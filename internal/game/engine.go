package game

import (
	"fmt"
	"math/rand"

	"github.com/mshirdel/snake/internal/models"
)

// Engine handles all deterministic game logic.
type Engine struct {
	state  *models.GameState
	config models.RoomConfig
	rng    *rand.Rand
}

// NewEngine creates a new game engine.
func NewEngine(roomID string, config models.RoomConfig, seed int64) *Engine {
	e := &Engine{
		config: config,
		rng:    rand.New(rand.NewSource(seed)),
		state: &models.GameState{
			RoomID:   roomID,
			Width:    config.Width,
			Height:   config.Height,
			Snakes:   make(map[string]*models.Snake),
			Foods:    make([]models.Food, 0, config.FoodCount),
			Tick:     0,
			GameOver: false,
		},
	}
	return e
}

// GetState returns a copy of the current game state.
func (e *Engine) GetState() *models.GameState {
	return e.state
}

// AddPlayer adds a new player with initial snake to the game.
func (e *Engine) AddPlayer(playerID string, color string) error {
	if e.state.GameOver {
		return fmt.Errorf("game is already over")
	}
	if len(e.state.Snakes) >= e.config.MaxPlayers {
		return fmt.Errorf("room is full")
	}
	if _, exists := e.state.Snakes[playerID]; exists {
		return fmt.Errorf("player already in game")
	}

	// Create starting position (scattered to avoid collisions)
	startX := (len(e.state.Snakes) + 1) * (e.config.Width / (e.config.MaxPlayers + 1))
	startY := e.config.Height / 2

	head := models.Vector2D{X: startX, Y: startY}
	body := []models.Vector2D{
		{X: startX - 1, Y: startY},
		{X: startX - 2, Y: startY},
	}

	e.state.Snakes[playerID] = &models.Snake{
		PlayerID:  playerID,
		Head:      head,
		Body:      body,
		Color:     color,
		Direction: models.DirectionRight,
	}

	return nil
}

// RemovePlayer removes a player from the game.
func (e *Engine) RemovePlayer(playerID string) {
	delete(e.state.Snakes, playerID)
	if len(e.state.Snakes) == 0 {
		e.state.GameOver = true
	}
}

// SetPlayerDirection sets the direction for the next movement.
func (e *Engine) SetPlayerDirection(playerID string, dir models.Direction) error {
	_, exists := e.state.Snakes[playerID]
	if !exists {
		return fmt.Errorf("player not found")
	}
	if dir == models.DirectionNone {
		return nil
	}
	// Direction is validated and queued during tick processing
	return nil
}

// Tick processes one game tick. Critical order:
// 1. Move snakes
// 2. Check wall collisions
// 3. Check snake-to-snake collisions
// 4. Check self collisions
// 5. Check food consumption
// 6. Grow snakes
// 7. Cleanup dead snakes
// 8. Spawn food if needed
func (e *Engine) Tick(directions map[string]models.Direction) {
	if e.state.GameOver {
		return
	}

	e.state.Tick++

	// 1. Resolve directions and move snakes
	for playerID, snake := range e.state.Snakes {
		dir := snake.Direction // default: keep moving forward

		if queued, ok := directions[playerID]; ok && queued != models.DirectionNone {
			// Prevent 180° reversal
			if !e.isOpposite(queued, snake.Direction) {
				dir = queued
			}
		}

		snake.Direction = dir
		e.moveSnake(snake, dir)
	}

	// Mark dead snakes
	dead := make(map[string]bool)

	// 2. Check wall collisions
	for playerID, snake := range e.state.Snakes {
		if e.isOutOfBounds(snake.Head) {
			dead[playerID] = true
		}
	}

	// 3. Check snake-to-snake collisions (head vs body)
	for playerID, snake := range e.state.Snakes {
		if dead[playerID] {
			continue
		}
		for otherID, other := range e.state.Snakes {
			if playerID == otherID {
				continue
			}
			// Check if head collides with other's body
			if e.positionEquals(snake.Head, other.Head) {
				dead[playerID] = true
				dead[otherID] = true
			}
			for _, segment := range other.Body {
				if e.positionEquals(snake.Head, segment) {
					dead[playerID] = true
				}
			}
		}
	}

	// 4. Check self collisions
	for playerID, snake := range e.state.Snakes {
		if dead[playerID] {
			continue
		}
		for _, segment := range snake.Body {
			if e.positionEquals(snake.Head, segment) {
				dead[playerID] = true
				break
			}
		}
	}

	// 5. Check food consumption and grow
	foodEaten := make([]bool, len(e.state.Foods))
	for playerID, snake := range e.state.Snakes {
		if dead[playerID] {
			continue
		}
		for i, food := range e.state.Foods {
			if foodEaten[i] {
				continue
			}
			if e.positionEquals(snake.Head, food.Position) {
				// 6. Grow snake
				if len(snake.Body) > 0 {
					snake.Body = append([]models.Vector2D{snake.Body[0]}, snake.Body...)
				} else {
					snake.Body = append(snake.Body, snake.Head)
				}
				foodEaten[i] = true
			}
		}
	}

	// Remove eaten food
	newFoods := make([]models.Food, 0, len(e.state.Foods))
	for i, food := range e.state.Foods {
		if !foodEaten[i] {
			newFoods = append(newFoods, food)
		}
	}
	e.state.Foods = newFoods

	// 7. Cleanup dead snakes
	for playerID := range dead {
		delete(e.state.Snakes, playerID)
	}

	// Check game over condition
	// Only end when all snakes are dead. Single-player and multiplayer
	// both continue until the last snake dies from a collision.
	alive := len(e.state.Snakes)
	if alive == 0 {
		e.state.GameOver = true
		e.state.Winner = ""
	} else if alive == 1 {
		for playerID := range e.state.Snakes {
			e.state.Winner = playerID
		}
	}

	// 8. Spawn food if needed
	e.spawnFood()
}

// moveSnake moves a snake in the given direction.
func (e *Engine) moveSnake(snake *models.Snake, dir models.Direction) {
	newHead := e.getNextPosition(snake.Head, dir)
	newBody := make([]models.Vector2D, len(snake.Body)+1)
	newBody[0] = snake.Head
	copy(newBody[1:], snake.Body)
	newBody = newBody[:len(newBody)-1] // Remove last segment

	snake.Head = newHead
	snake.Body = newBody
}

// getNextPosition calculates the next position based on direction.
func (e *Engine) getNextPosition(pos models.Vector2D, dir models.Direction) models.Vector2D {
	switch dir {
	case models.DirectionUp:
		return models.Vector2D{X: pos.X, Y: pos.Y - 1}
	case models.DirectionDown:
		return models.Vector2D{X: pos.X, Y: pos.Y + 1}
	case models.DirectionLeft:
		return models.Vector2D{X: pos.X - 1, Y: pos.Y}
	case models.DirectionRight:
		return models.Vector2D{X: pos.X + 1, Y: pos.Y}
	default:
		return pos
	}
}

// isOutOfBounds checks if a position is outside the board.
func (e *Engine) isOutOfBounds(pos models.Vector2D) bool {
	return pos.X < 0 || pos.X >= e.config.Width ||
		pos.Y < 0 || pos.Y >= e.config.Height
}

// isOpposite checks if two directions are reversals of each other.
func (e *Engine) isOpposite(a, b models.Direction) bool {
	return (a == models.DirectionUp && b == models.DirectionDown) ||
		(a == models.DirectionDown && b == models.DirectionUp) ||
		(a == models.DirectionLeft && b == models.DirectionRight) ||
		(a == models.DirectionRight && b == models.DirectionLeft)
}

// positionEquals checks if two positions are the same.
func (e *Engine) positionEquals(a, b models.Vector2D) bool {
	return a.X == b.X && a.Y == b.Y
}

// spawnFood spawns food until the target count is reached.
func (e *Engine) spawnFood() {
	for len(e.state.Foods) < e.config.FoodCount {
		for attempts := 0; attempts < 100; attempts++ {
			pos := models.Vector2D{
				X: e.rng.Intn(e.config.Width),
				Y: e.rng.Intn(e.config.Height),
			}

			// Check if position is not occupied
			occupied := false
			for _, snake := range e.state.Snakes {
				if e.positionEquals(pos, snake.Head) {
					occupied = true
					break
				}
				for _, segment := range snake.Body {
					if e.positionEquals(pos, segment) {
						occupied = true
						break
					}
				}
				if occupied {
					break
				}
			}
			for _, food := range e.state.Foods {
				if e.positionEquals(pos, food.Position) {
					occupied = true
					break
				}
			}

			if !occupied {
				e.state.Foods = append(e.state.Foods, models.Food{Position: pos})
				break
			}
		}
	}
}
