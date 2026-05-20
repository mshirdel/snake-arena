package room

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/mshirdel/snake/internal/game"
	"github.com/mshirdel/snake/internal/models"
	"github.com/mshirdel/snake/internal/network"
	"github.com/mshirdel/snake/internal/protocol"
)

// CommandType represents the type of command.
type CommandType uint8

const (
	CommandTypePlayerInput CommandType = iota
	CommandTypePlayerJoin
	CommandTypePlayerLeave
)

// Command represents a queued command to process during tick.
type Command struct {
	Type      CommandType
	PlayerID  string
	Direction models.Direction
	ConnID    string
}

// Room manages a single game room.
type Room struct {
	ID       string
	config   models.RoomConfig
	engine   *game.Engine
	players  map[string]*models.Player
	connHub  *network.Hub
	mu       sync.RWMutex
	cmdQueue []Command
	ctx      context.Context
	cancel   context.CancelFunc
	tickChan <-chan time.Time
	closed   bool
}

// NewRoom creates a new game room.
func NewRoom(id string, config models.RoomConfig, connHub *network.Hub) *Room {
	ctx, cancel := context.WithCancel(context.Background())
	r := &Room{
		ID:       id,
		config:   config,
		engine:   game.NewEngine(id, config, time.Now().UnixNano()),
		players:  make(map[string]*models.Player),
		connHub:  connHub,
		ctx:      ctx,
		cancel:   cancel,
		cmdQueue: make([]Command, 0, 256),
	}

	// Start tick loop
	tickRate := time.Duration(1000/config.TickRate) * time.Millisecond
	ticker := time.NewTicker(tickRate)
	r.tickChan = ticker.C

	go r.tickLoop(ticker)

	return r
}

// AddPlayer adds a player to the room.
func (r *Room) AddPlayer(playerID, connID, playerName, color string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.players[playerID]; exists {
		return fmt.Errorf("player already in room")
	}

	if err := r.engine.AddPlayer(playerID, color); err != nil {
		return err
	}

	r.players[playerID] = &models.Player{
		ID:       playerID,
		RoomID:   r.ID,
		Name:     playerName,
		JoinedAt: time.Now(),
	}

	// Update connection with room assignment
	if conn, ok := r.connHub.GetConnection(connID); ok {
		conn.RoomID = r.ID
		conn.PlayerID = playerID
	}

	// Broadcast player joined
	msg, _ := protocol.NewMessage(protocol.MessageTypePlayerJoined, protocol.PlayerInfo{
		PlayerID:   playerID,
		PlayerName: playerName,
		Color:      color,
	})
	r.connHub.BroadcastToRoom(r.ID, msg)

	// Send current game state to all clients
	r.broadcastGameState()

	return nil
}

// RemovePlayer removes a player from the room.
func (r *Room) RemovePlayer(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.players[playerID]; !exists {
		return
	}

	delete(r.players, playerID)
	r.engine.RemovePlayer(playerID)

	// Broadcast player left
	msg, _ := protocol.NewMessage(protocol.MessageTypePlayerLeft, map[string]string{
		"player_id": playerID,
	})
	r.connHub.BroadcastToRoom(r.ID, msg)

	// If room is empty, it can be cleaned up by matchmaker
}

// QueuePlayerInput queues a player input command.
func (r *Room) QueuePlayerInput(playerID string, direction models.Direction) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.cmdQueue = append(r.cmdQueue, Command{
		Type:      CommandTypePlayerInput,
		PlayerID:  playerID,
		Direction: direction,
	})
}

// tickLoop runs the game tick loop.
func (r *Room) tickLoop(ticker *time.Ticker) {
	defer ticker.Stop()

	for {
		select {
		case <-r.ctx.Done():
			return
		case <-r.tickChan:
			r.processTick()
		}
	}
}

// processTick processes a single game tick.
func (r *Room) processTick() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.closed || len(r.players) == 0 {
		return
	}

	// Build direction map from queued commands
	directions := make(map[string]models.Direction)
	for _, cmd := range r.cmdQueue {
		if cmd.Type == CommandTypePlayerInput {
			directions[cmd.PlayerID] = cmd.Direction
		}
	}
	r.cmdQueue = r.cmdQueue[:0] // Clear queue

	// Run game tick (deterministic, no external mutations)
	r.engine.Tick(directions)

	// Broadcast updated game state
	r.broadcastGameState()

	// Notify newly dead players
	newlyDead := r.engine.GetNewlyDeadPlayers()
	for playerID, reason := range newlyDead {
		r.sendToPlayer(playerID, protocol.MessageTypePlayerDied, protocol.PlayerDiedMessage{
			PlayerID: playerID,
			Reason:   reason,
		})
	}

	// Check if game is over
	state := r.engine.GetState()
	if state.GameOver {
		endMsg, _ := protocol.NewMessage(protocol.MessageTypeGameEnd, protocol.GameEndMessage{
			RoomID: r.ID,
			Winner: state.Winner,
		})
		r.connHub.BroadcastToRoom(r.ID, endMsg)
	}
}

// broadcastGameState sends the current game state to all clients in the room.
func (r *Room) broadcastGameState() {
	state := r.engine.GetState()

	// Convert to protocol message
	snakes := make(map[string]protocol.SnakeData)
	for playerID, snake := range state.Snakes {
		playerName := ""
		if p, ok := r.players[playerID]; ok {
			playerName = p.Name
		}
		snakes[playerID] = protocol.SnakeData{
			PlayerID:   snake.PlayerID,
			PlayerName: playerName,
			Head: protocol.VectorData{
				X: snake.Head.X,
				Y: snake.Head.Y,
			},
			Body:      convertVectors(snake.Body),
			Color:     snake.Color,
			Length:    len(snake.Body) + 1,
			Alive:     !snake.Dead,
			Direction: directionToString(snake.Direction),
		}
	}

	foods := make([]protocol.FoodData, len(state.Foods))
	for i, food := range state.Foods {
		foods[i] = protocol.FoodData{
			Position: protocol.VectorData{
				X: food.Position.X,
				Y: food.Position.Y,
			},
		}
	}

	gameStateMsg := protocol.GameStateMessage{
		RoomID:    r.ID,
		Tick:      state.Tick,
		GameOver:  state.GameOver,
		Winner:    state.Winner,
		Width:     state.Width,
		Height:    state.Height,
		Snakes:    snakes,
		Foods:     foods,
		Timestamp: time.Now().UnixMilli(),
	}

	msg, _ := protocol.NewMessage(protocol.MessageTypeGameState, gameStateMsg)
	r.connHub.BroadcastToRoom(r.ID, msg)
}

// GetPlayerCount returns the number of players in the room.
func (r *Room) GetPlayerCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.players)
}

// GetState returns the current game state.
func (r *Room) GetState() *models.GameState {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.engine.GetState()
}

// HandlePlayAgain processes a player's decision to respawn or quit after death.
func (r *Room) HandlePlayAgain(playerID string, playAgain bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if playAgain {
		if err := r.engine.RespawnPlayer(playerID); err != nil {
			return
		}
		// Broadcast updated state so all clients see the respawn
		r.broadcastGameState()
	} else {
		// Player chose to quit — remove them
		if _, exists := r.players[playerID]; !exists {
			return
		}
		delete(r.players, playerID)
		r.engine.RemovePlayer(playerID)

		msg, _ := protocol.NewMessage(protocol.MessageTypePlayerLeft, map[string]string{
			"player_id": playerID,
		})
		r.connHub.BroadcastToRoom(r.ID, msg)
	}
}

// sendToPlayer sends a message to a specific player in the room.
func (r *Room) sendToPlayer(playerID string, msgType protocol.MessageType, payload interface{}) {
	conns := r.connHub.GetConnectionsInRoom(r.ID)
	for _, conn := range conns {
		if conn.PlayerID == playerID {
			msg, _ := protocol.NewMessage(msgType, payload)
			conn.SendMessage(msg)
			return
		}
	}
}

// Close closes the room.
func (r *Room) Close() {
	r.mu.Lock()
	r.closed = true
	r.mu.Unlock()
	r.cancel()
}

// IsClosed returns whether the room is closed.
func (r *Room) IsClosed() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.closed
}

// convertVectors converts model vectors to protocol vectors.
func convertVectors(vecs []models.Vector2D) []protocol.VectorData {
	result := make([]protocol.VectorData, len(vecs))
	for i, v := range vecs {
		result[i] = protocol.VectorData{X: v.X, Y: v.Y}
	}
	return result
}

// directionToString converts a direction to its string representation.
func directionToString(d models.Direction) string {
	switch d {
	case models.DirectionUp:
		return "up"
	case models.DirectionDown:
		return "down"
	case models.DirectionLeft:
		return "left"
	case models.DirectionRight:
		return "right"
	default:
		return ""
	}
}
