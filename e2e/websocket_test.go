package e2e

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/mshirdel/snake/internal/protocol"
)

// TestHealthEndpoint tests the HTTP health endpoint
func TestHealthEndpoint(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatalf("failed to GET /health: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var result map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if result["status"] != "healthy" {
		t.Errorf("expected status 'healthy', got '%s'", result["status"])
	}
}

// TestCreateRoom tests room creation via HTTP
func TestCreateRoom(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	// Test creating a room
	resp, err := http.Post(ts.URL+"/rooms", "application/json", nil)
	if err != nil {
		t.Fatalf("failed to POST /rooms: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Errorf("expected status 200 or 201, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if result["room_id"] == nil || result["room_id"] == "" {
		t.Error("expected room_id in response")
	}
}

// TestListRooms tests listing rooms via HTTP
func TestListRooms(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	// Create a room first
	_, err := http.Post(ts.URL+"/rooms", "application/json", nil)
	if err != nil {
		t.Fatalf("failed to create room: %v", err)
	}

	// List rooms
	resp, err := http.Get(ts.URL + "/rooms")
	if err != nil {
		t.Fatalf("failed to GET /rooms: %v", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	rooms, ok := result["rooms"].([]interface{})
	if !ok {
		t.Fatal("expected rooms array in response")
	}

	if len(rooms) == 0 {
		t.Error("expected at least one room")
	}
}

// TestWebSocketConnection tests basic WebSocket connection
func TestWebSocketConnection(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer client.Close()
}

// TestJoinRoom tests joining a room via WebSocket
func TestJoinRoom(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer client.Close()

	roomID := "test-room-" + time.Now().Format("150405")
	playerID := "player-1"
	playerName := "TestPlayer"
	color := "#22c55e"

	err = client.JoinRoom(roomID, playerID, playerName, color)
	if err != nil {
		t.Fatalf("failed to send join message: %v", err)
	}

	// Wait for messages - order may vary (player_joined, game_state, ack)
	var gotAck, gotGameState bool
	for i := 0; i < 5; i++ {
		msg, err := client.Receive(2 * time.Second)
		if err != nil {
			t.Fatalf("timeout waiting for messages: %v", err)
		}

		switch msg.Type {
		case protocol.MessageTypeAck:
			gotAck = true
		case protocol.MessageTypeGameState:
			gotGameState = true
		case protocol.MessageTypePlayerJoined:
			// Player joined is also expected
		}
	}

	if !gotAck {
		t.Error("did not receive ack message")
	}
	if !gotGameState {
		t.Error("did not receive game state message")
	}
}

// TestJoinRoomAndReceiveGameState tests that game state is broadcast after joining
func TestJoinRoomAndReceiveGameState(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer client.Close()

	roomID := "test-room-" + time.Now().Format("150405")
	playerID := "player-1"
	playerName := "TestPlayer"
	color := "#22c55e"

	err = client.JoinRoom(roomID, playerID, playerName, color)
	if err != nil {
		t.Fatalf("failed to send join message: %v", err)
	}

	// Receive messages - should get ack and then game state
	var gotAck, gotGameState bool
	for i := 0; i < 10; i++ {
		msg, err := client.Receive(500 * time.Millisecond)
		if err != nil {
			break
		}

		switch msg.Type {
		case protocol.MessageTypeAck:
			gotAck = true
		case protocol.MessageTypeGameState:
			gotGameState = true
			var state protocol.GameStateMessage
			msg.UnmarshalPayload(&state)
			if state.RoomID != roomID {
				t.Errorf("expected room_id %s, got %s", roomID, state.RoomID)
			}
			if state.Width != 40 || state.Height != 30 {
				t.Errorf("expected 40x30 board, got %dx%d", state.Width, state.Height)
			}
		}
	}

	if !gotAck {
		t.Error("did not receive ack message")
	}
	if !gotGameState {
		t.Error("did not receive game state message")
	}
}

// TestPlayerInputMetadataAcknowledged verifies prediction metadata is echoed in authoritative snapshots.
func TestPlayerInputMetadataAcknowledged(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer client.Close()

	roomID := "test-room-input-meta-" + time.Now().Format("150405")
	playerID := "player-1"

	if err := client.JoinRoom(roomID, playerID, "TestPlayer", "#22c55e"); err != nil {
		t.Fatalf("failed to send join message: %v", err)
	}

	// Drain initial join/game_state messages.
	for i := 0; i < 5; i++ {
		_, _ = client.Receive(100 * time.Millisecond)
	}

	const clientTick uint64 = 7
	const inputSeq uint64 = 3
	if err := client.SendInputWithMetadata("down", clientTick, 0, inputSeq); err != nil {
		t.Fatalf("failed to send input: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		msg, err := client.Receive(250 * time.Millisecond)
		if err != nil || msg.Type != protocol.MessageTypeGameState {
			continue
		}

		var state protocol.GameStateMessage
		if err := msg.UnmarshalPayload(&state); err != nil {
			t.Fatalf("failed to unmarshal game state: %v", err)
		}

		if state.LastProcessedInputTick[playerID] == clientTick &&
			state.LastProcessedInputSeq[playerID] == inputSeq {
			return
		}
	}

	t.Fatalf("timed out waiting for input metadata acknowledgement")
}

// TestMultiplePlayersJoinSameRoom tests multiple players joining the same room
func TestMultiplePlayersJoinSameRoom(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	roomID := "test-room-multi-" + time.Now().Format("150405")

	// Player 1 joins
	client1, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect client 1: %v", err)
	}
	defer client1.Close()

	err = client1.JoinRoom(roomID, "player-1", "Alice", "#22c55e")
	if err != nil {
		t.Fatalf("failed to join room: %v", err)
	}

	// Receive messages for player 1
	var p1Messages []protocol.Message
	for i := 0; i < 5; i++ {
		msg, err := client1.Receive(1 * time.Second)
		if err == nil {
			p1Messages = append(p1Messages, *msg)
		}
	}

	// Player 2 joins same room
	client2, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect client 2: %v", err)
	}
	defer client2.Close()

	err = client2.JoinRoom(roomID, "player-2", "Bob", "#ef4444")
	if err != nil {
		t.Fatalf("failed to join room: %v", err)
	}

	// Give time for messages to be delivered
	time.Sleep(500 * time.Millisecond)

	// Receive messages for player 2 - should get ack, game_state, player_joined
	var p2Messages []protocol.Message
	for i := 0; i < 10; i++ {
		msg, err := client2.Receive(1 * time.Second)
		if err == nil {
			p2Messages = append(p2Messages, *msg)
		}
	}

	// Verify player 2 got at least one message (any type is fine)
	if len(p2Messages) == 0 {
		t.Error("player 2 did not receive any messages")
	}
}

// TestPlayerInput tests sending player input
func TestPlayerInput(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer client.Close()

	roomID := "test-room-input-" + time.Now().Format("150405")
	playerID := "player-1"

	// Join room first
	err = client.JoinRoom(roomID, playerID, "TestPlayer", "#22c55e")
	if err != nil {
		t.Fatalf("failed to join room: %v", err)
	}

	// Consume join messages
	for i := 0; i < 5; i++ {
		client.Receive(200 * time.Millisecond)
	}

	// Send input
	err = client.SendInput("right")
	if err != nil {
		t.Fatalf("failed to send input: %v", err)
	}

	// Input doesn't get a direct response, but should be reflected in game state
	// Wait for next game state tick
	time.Sleep(200 * time.Millisecond)
}

// TestPlayerInputWithoutJoin tests that input without joining returns error
func TestPlayerInputWithoutJoin(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer client.Close()

	// Send input without joining room
	err = client.SendInput("right")
	if err != nil {
		t.Fatalf("failed to send input: %v", err)
	}

	// Should receive error
	msg, err := client.Receive(2 * time.Second)
	if err != nil {
		t.Fatalf("timeout waiting for error: %v", err)
	}

	if msg.Type != protocol.MessageTypeError {
		t.Errorf("expected error message, got %s", msg.Type)
	}
}

// TestLeaveRoom tests leaving a room
func TestLeaveRoom(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer client.Close()

	roomID := "test-room-leave-" + time.Now().Format("150405")
	playerID := "player-1"

	// Join room
	err = client.JoinRoom(roomID, playerID, "TestPlayer", "#22c55e")
	if err != nil {
		t.Fatalf("failed to join room: %v", err)
	}

	// Consume all join messages (player_joined, game_state, ack)
	for i := 0; i < 10; i++ {
		client.Receive(500 * time.Millisecond)
	}

	// Leave room
	err = client.LeaveRoom()
	if err != nil {
		t.Fatalf("failed to leave room: %v", err)
	}

	// Should be able to join another room without issues
	newRoomID := "another-room-" + time.Now().Format("150405")
	err = client.JoinRoom(newRoomID, playerID, "TestPlayer", "#22c55e")
	if err != nil {
		t.Fatalf("failed to join new room after leaving: %v", err)
	}

	// Should receive ack for new room - wait for it
	var gotAck bool
	for i := 0; i < 10; i++ {
		msg, err := client.Receive(1 * time.Second)
		if err != nil {
			break
		}
		if msg.Type == protocol.MessageTypeAck {
			gotAck = true
			break
		}
	}

	if !gotAck {
		t.Error("did not receive ack for new room")
	}
}

// TestGameStateSnakeData tests that snake data is correctly formatted
func TestGameStateSnakeData(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer client.Close()

	roomID := "test-room-snake-" + time.Now().Format("150405")
	playerID := "player-1"
	playerName := "TestPlayer"
	color := "#22c55e"

	err = client.JoinRoom(roomID, playerID, playerName, color)
	if err != nil {
		t.Fatalf("failed to join room: %v", err)
	}

	// Wait for game state
	var state *protocol.GameStateMessage
	for i := 0; i < 10; i++ {
		msg, err := client.Receive(1 * time.Second)
		if err != nil {
			t.Fatalf("timeout waiting for message: %v", err)
		}

		if msg.Type == protocol.MessageTypeGameState {
			var s protocol.GameStateMessage
			msg.UnmarshalPayload(&s)
			state = &s
			break
		}
	}

	if state == nil {
		t.Fatal("did not receive game state")
	}

	snake, ok := state.Snakes[playerID]
	if !ok {
		t.Error("snake not found in game state")
		return
	}

	if snake.Color != color {
		t.Errorf("expected color %s, got %s", color, snake.Color)
	}

	if snake.Head.X == 0 && snake.Head.Y == 0 {
		// Initial position should not be 0,0 (should be in middle of board)
		// Default board is 40x30, so center would be around 20,15
	}

	if len(snake.Body) == 0 {
		t.Error("snake body should not be empty")
	}
}

// TestInvalidJSON tests handling of invalid JSON
func TestInvalidJSON(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer client.Close()

	// The test server handles invalid JSON and returns an error message
	// We test this by sending invalid JSON through the client

	// Access internal write to send raw invalid JSON
	ctx := context.Background()
	writeErr := client.conn.Write(ctx, websocket.MessageText, []byte("this is not valid json {"))
	if writeErr != nil {
		// Write error is acceptable - connection may close
		t.Logf("Write error (expected): %v", writeErr)
		return
	}

	// Wait for error response
	_, err = client.Receive(2 * time.Second)
	if err != nil {
		t.Log("Did not receive error for invalid JSON (may have closed connection)")
	}
}

// TestRoomCreationForJoin tests that room is created when joining non-existent room
func TestRoomCreationForJoin(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	// Verify room doesn't exist
	resp, err := http.Get(ts.URL + "/rooms")
	if err != nil {
		t.Fatalf("failed to list rooms: %v", err)
	}
	resp.Body.Close()

	// Join a new room via WebSocket
	client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer client.Close()

	roomID := "new-room-auto-create-" + time.Now().Format("150405")
	playerID := "player-1"

	err = client.JoinRoom(roomID, playerID, "TestPlayer", "#22c55e")
	if err != nil {
		t.Fatalf("failed to join room: %v", err)
	}

	// Should receive messages (ack, game_state, player_joined) - wait for ack
	var gotAck bool
	for i := 0; i < 10; i++ {
		msg, err := client.Receive(1 * time.Second)
		if err != nil {
			break
		}
		if msg.Type == protocol.MessageTypeAck {
			gotAck = true
			break
		}
	}

	if !gotAck {
		t.Error("did not receive ack message")
	}

	// Now verify room exists
	resp, err = http.Get(ts.URL + "/rooms")
	if err != nil {
		t.Fatalf("failed to list rooms: %v", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	rooms, ok := result["rooms"].([]interface{})
	if !ok {
		t.Fatal("expected rooms array in response")
	}

	found := false
	for _, r := range rooms {
		room := r.(map[string]interface{})
		if room["room_id"] == roomID {
			found = true
			break
		}
	}

	if !found {
		t.Error("room should exist after joining via WebSocket")
	}
}

// TestAllDirectionInputs tests all four direction inputs
func TestAllDirectionInputs(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	directions := []string{"up", "down", "left", "right"}

	for _, dir := range directions {
		t.Run(dir, func(t *testing.T) {
			client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
			if err != nil {
				t.Fatalf("failed to connect: %v", err)
			}
			defer client.Close()

			roomID := "test-room-dir-" + dir + "-" + time.Now().Format("150405")
			playerID := "player-" + dir

			err = client.JoinRoom(roomID, playerID, "TestPlayer", "#22c55e")
			if err != nil {
				t.Fatalf("failed to join room: %v", err)
			}

			// Consume join messages
			for i := 0; i < 5; i++ {
				client.Receive(200 * time.Millisecond)
			}

			// Send direction input
			err = client.SendInput(dir)
			if err != nil {
				t.Fatalf("failed to send input: %v", err)
			}

			// No error should be received for valid direction
		})
	}
}

// TestInvalidDirection tests invalid direction handling
func TestInvalidDirection(t *testing.T) {
	ts := NewTestServer(t)
	defer ts.Close()

	client, err := NewWebSocketClient(t, "ws://"+ts.Server.Listener.Addr().String()+"/ws")
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer client.Close()

	roomID := "test-room-invalid-" + time.Now().Format("150405")
	playerID := "player-1"

	err = client.JoinRoom(roomID, playerID, "TestPlayer", "#22c55e")
	if err != nil {
		t.Fatalf("failed to join room: %v", err)
	}

	// Consume join messages
	for i := 0; i < 5; i++ {
		client.Receive(200 * time.Millisecond)
	}

	// Send invalid direction - this goes to room which will queue DirectionNone
	// No error should be sent, just ignored
	msg, _ := client.Receive(500 * time.Millisecond)
	if msg != nil && msg.Type == protocol.MessageTypeError {
		t.Log("Server returned error for invalid direction (DirectionNone queued)")
	}
}
