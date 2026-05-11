package models

import (
	"time"
)

// Vector2D represents a 2D coordinate on the game board.
type Vector2D struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// Snake represents a player's snake with its body segments.
type Snake struct {
	PlayerID string     `json:"player_id"`
	Head     Vector2D   `json:"head"`
	Body     []Vector2D `json:"body"`
	Color    string     `json:"color"`
}

// Food represents food on the board.
type Food struct {
	Position Vector2D `json:"position"`
}

// GameState represents the current state of a game room.
type GameState struct {
	RoomID    string           `json:"room_id"`
	Width     int              `json:"width"`
	Height    int              `json:"height"`
	Snakes    map[string]*Snake `json:"snakes"`
	Foods     []Food           `json:"foods"`
	Tick      uint64           `json:"tick"`
	GameOver  bool             `json:"game_over"`
	Winner    string           `json:"winner"` // empty if tie or still playing
	Timestamp time.Time        `json:"timestamp"`
}

// Player represents a connected player.
type Player struct {
	ID          string
	RoomID      string
	Direction   Direction
	NextDirect  Direction // buffered next direction
	JoinedAt    time.Time
	LastInputAt time.Time
}

// Direction represents movement direction.
type Direction uint8

const (
	DirectionNone Direction = iota
	DirectionUp
	DirectionDown
	DirectionLeft
	DirectionRight
)

// Room represents a game room with players.
type Room struct {
	ID        string
	GameState *GameState
	Players   map[string]*Player
	CreatedAt time.Time
}

// RoomConfig contains room configuration.
type RoomConfig struct {
	Width      int
	Height     int
	TickRate   int // ticks per second
	MaxPlayers int
	FoodCount  int
}

// DefaultRoomConfig returns sensible defaults.
func DefaultRoomConfig() RoomConfig {
	return RoomConfig{
		Width:      40,
		Height:     30,
		TickRate:   10,
		MaxPlayers: 4,
		FoodCount:  5,
	}
}
