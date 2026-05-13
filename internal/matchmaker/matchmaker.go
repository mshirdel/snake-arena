package matchmaker

import (
	"fmt"
	"sync"
	"sync/atomic"

	"github.com/mshirdel/snake/internal/models"
	"github.com/mshirdel/snake/internal/network"
	"github.com/mshirdel/snake/internal/room"
)

// Matchmaker manages room creation, joining, and cleanup.
type Matchmaker struct {
	rooms   map[string]*room.Room
	connHub *network.Hub
	config  models.RoomConfig
	mu      sync.RWMutex
	roomID  uint32
}

// NewMatchmaker creates a new matchmaker.
func NewMatchmaker(connHub *network.Hub, config models.RoomConfig) *Matchmaker {
	return &Matchmaker{
		rooms:   make(map[string]*room.Room),
		connHub: connHub,
		config:  config,
	}
}

// CreateRoom creates a new game room.
func (m *Matchmaker) CreateRoom(roomID string) (*room.Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.rooms[roomID]; exists {
		return nil, fmt.Errorf("room already exists")
	}

	r := room.NewRoom(roomID, m.config, m.connHub)
	m.rooms[roomID] = r

	return r, nil
}

// GetRoom retrieves a room by ID.
func (m *Matchmaker) GetRoom(roomID string) (*room.Room, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	r, ok := m.rooms[roomID]
	return r, ok
}

// JoinRoom adds a player to an existing room.
func (m *Matchmaker) JoinRoom(roomID, playerID, connID, playerName, color string) error {
	m.mu.RLock()
	r, ok := m.rooms[roomID]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("room not found")
	}

	if r.GetPlayerCount() >= m.config.MaxPlayers {
		return fmt.Errorf("room is full")
	}

	return r.AddPlayer(playerID, connID, playerName, color)
}

// LeaveRoom removes a player from a room.
func (m *Matchmaker) LeaveRoom(roomID, playerID string) error {
	m.mu.RLock()
	r, ok := m.rooms[roomID]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("room not found")
	}

	r.RemovePlayer(playerID)

	// Clean up empty rooms
	if r.GetPlayerCount() == 0 {
		m.mu.Lock()
		delete(m.rooms, roomID)
		m.mu.Unlock()
		r.Close()
	}

	return nil
}

// HandlePlayerInput queues a player input in their room.
func (m *Matchmaker) HandlePlayerInput(playerID, roomID string, direction models.Direction) error {
	m.mu.RLock()
	r, ok := m.rooms[roomID]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("room not found")
	}

	r.QueuePlayerInput(playerID, direction)
	return nil
}

// GetRoomCount returns the number of active rooms.
func (m *Matchmaker) GetRoomCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.rooms)
}

// ListRooms returns information about all rooms.
func (m *Matchmaker) ListRooms() []map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]map[string]interface{}, 0, len(m.rooms))
	for roomID, r := range m.rooms {
		state := r.GetState()
		result = append(result, map[string]interface{}{
			"room_id":     roomID,
			"players":     r.GetPlayerCount(),
			"tick":        state.Tick,
			"game_over":   state.GameOver,
			"max_players": m.config.MaxPlayers,
		})
	}
	return result
}

// Shutdown closes all rooms.
func (m *Matchmaker) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, r := range m.rooms {
		r.Close()
	}
	m.rooms = make(map[string]*room.Room)
}

// FindOrCreateRoom finds an available room or creates a new one.
func (m *Matchmaker) FindOrCreateRoom() string {
	m.mu.RLock()
	for id, r := range m.rooms {
		if r.GetPlayerCount() < m.config.MaxPlayers && !r.GetState().GameOver {
			m.mu.RUnlock()
			return id
		}
	}
	m.mu.RUnlock()

	id := fmt.Sprintf("room_%d", atomic.AddUint32(&m.roomID, 1))
	r, err := m.CreateRoom(id)
	if err != nil {
		// Rare race: room was created between unlock and CreateRoom
		return id
	}
	_ = r
	return id
}
