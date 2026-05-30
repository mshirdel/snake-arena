package protocol

import (
	"encoding/json"
	"fmt"
)

// MessageType represents the type of WebSocket message.
type MessageType string

const (
	// Client messages
	MessageTypeJoinRoom    MessageType = "join_room"
	MessageTypePlayerInput MessageType = "player_input"
	MessageTypeLeaveRoom   MessageType = "leave_room"
	MessageTypePlayAgain   MessageType = "play_again"

	// Server messages
	MessageTypeGameState    MessageType = "game_state"
	MessageTypeGameStart    MessageType = "game_start"
	MessageTypeGameEnd      MessageType = "game_end"
	MessageTypeError        MessageType = "error"
	MessageTypePlayerJoined MessageType = "player_joined"
	MessageTypePlayerLeft   MessageType = "player_left"
	MessageTypePlayerDied   MessageType = "player_died"
	MessageTypeAck          MessageType = "ack"

	// Ping/Pong for latency measurement
	MessageTypePing MessageType = "ping"
	MessageTypePong MessageType = "pong"
)

// Message is the base wrapper for all WebSocket messages.
type Message struct {
	Type    MessageType     `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// JoinRoomRequest is sent by client to join a room.
type JoinRoomRequest struct {
	RoomID     string `json:"room_id"`
	PlayerID   string `json:"player_id"`
	PlayerName string `json:"player_name"`
	Color      string `json:"color"`
}

// PlayerInputMessage is sent by client for each input.
type PlayerInputMessage struct {
	Direction      string `json:"direction"` // "up", "down", "left", "right"
	ClientTick     uint64 `json:"client_tick,omitempty"`
	LastServerTick uint64 `json:"last_server_tick,omitempty"`
	InputSeq       uint64 `json:"input_seq,omitempty"`
}

// LeaveRoomRequest is sent when player leaves.
type LeaveRoomRequest struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
}

// GameStateMessage is the full game state sent to clients.
type GameStateMessage struct {
	RoomID                 string               `json:"room_id"`
	Tick                   uint64               `json:"tick"`
	GameOver               bool                 `json:"game_over"`
	Winner                 string               `json:"winner"`
	Width                  int                  `json:"width"`
	Height                 int                  `json:"height"`
	Snakes                 map[string]SnakeData `json:"snakes"`
	Foods                  []FoodData           `json:"foods"`
	Timestamp              int64                `json:"timestamp"`
	ServerTime             int64                `json:"server_time"`
	LastProcessedInputTick map[string]uint64    `json:"last_processed_input_tick,omitempty"`
	LastProcessedInputSeq  map[string]uint64    `json:"last_processed_input_seq,omitempty"`
}

// SnakeData for transmission.
type SnakeData struct {
	PlayerID   string       `json:"player_id"`
	PlayerName string       `json:"player_name"`
	Head       VectorData   `json:"head"`
	Body       []VectorData `json:"body"`
	Color      string       `json:"color"`
	Length     int          `json:"length"`
	Alive      bool         `json:"alive"`
	Direction  string       `json:"direction"`
}

// FoodData for transmission.
type FoodData struct {
	Position VectorData `json:"position"`
}

// VectorData for transmission.
type VectorData struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// GameStartMessage notifies when game starts.
type GameStartMessage struct {
	RoomID  string       `json:"room_id"`
	Tick    uint64       `json:"tick"`
	Players []PlayerInfo `json:"players"`
}

// PlayerInfo contains info about a player.
type PlayerInfo struct {
	PlayerID   string `json:"player_id"`
	PlayerName string `json:"player_name"`
	Color      string `json:"color"`
}

// GameEndMessage notifies when game ends.
type GameEndMessage struct {
	RoomID    string   `json:"room_id"`
	Winner    string   `json:"winner"`
	Survivors []string `json:"survivors"`
}

// ErrorMessage is sent on errors.
type ErrorMessage struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// PingMessage is sent by client to measure latency.
type PingMessage struct {
	Timestamp int64 `json:"timestamp"`
}

// PlayerDiedMessage is sent to a player when their snake dies.
type PlayerDiedMessage struct {
	PlayerID string `json:"player_id"`
	Reason   string `json:"reason"` // "wall", "collision", "self"
}

// PlayAgainRequest is sent by client to respawn or quit after death.
type PlayAgainRequest struct {
	PlayAgain bool `json:"play_again"` // true = respawn, false = leave room
}

// AckMessage acknowledges receipt of a message.
type AckMessage struct {
	MessageID string `json:"message_id"`
}

// NewMessage creates a new message with given type and payload.
func NewMessage(msgType MessageType, payload interface{}) (*Message, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}
	return &Message{
		Type:    msgType,
		Payload: data,
	}, nil
}

// UnmarshalPayload unmarshals the message payload into the given target.
func (m *Message) UnmarshalPayload(target interface{}) error {
	return json.Unmarshal(m.Payload, target)
}
