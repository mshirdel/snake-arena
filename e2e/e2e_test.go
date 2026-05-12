package e2e

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/mshirdel/snake/internal/matchmaker"
	"github.com/mshirdel/snake/internal/models"
	"github.com/mshirdel/snake/internal/network"
	"github.com/mshirdel/snake/internal/protocol"
)

// TestServer is a test server wrapper for WebSocket testing
type TestServer struct {
	Server     *httptest.Server
	Mux        *http.ServeMux
	Matchmaker *matchmaker.Matchmaker
	Hub        *network.Hub
	URL        string
}

// NewTestServer creates a new test server with WebSocket and HTTP endpoints
func NewTestServer(t *testing.T) *TestServer {
	ts := &TestServer{
		Mux: http.NewServeMux(),
	}

	// Create matchmaker and hub
	ts.Hub = network.NewHub()
	ts.Matchmaker = matchmaker.NewMatchmaker(ts.Hub, models.DefaultRoomConfig())

	// HTTP endpoints
	ts.Mux.HandleFunc("/health", ts.handleHealth)
	ts.Mux.HandleFunc("/rooms", ts.handleRooms)
	ts.Mux.HandleFunc("/ws", ts.handleWebSocket)

	ts.Server = httptest.NewServer(ts.Mux)
	ts.URL = ts.Server.URL

	return ts
}

func (ts *TestServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

func (ts *TestServer) handleRooms(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		rooms := ts.Matchmaker.ListRooms()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"rooms": rooms,
			"count": len(rooms),
		})
	case http.MethodPost:
		var req struct {
			RoomID string `json:"room_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			// If no body, create a room with auto-generated ID
			req.RoomID = generateRoomID()
		}

		// Auto-generate room ID if none provided
		if req.RoomID == "" {
			req.RoomID = generateRoomID()
		}

		_, err := ts.Matchmaker.CreateRoom(req.RoomID)
		if err != nil {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"room_id": req.RoomID,
			"width":   40,
			"height":  30,
		})
	}
}

func (ts *TestServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		Subprotocols: []string{"json"},
	})
	if err != nil {
		return
	}

	connID := generateConnID()
	netConn := network.NewConnection(connID, "", conn)
	ts.Hub.Register(netConn)

	// Create a context that lives for the duration of the connection
	// This is independent of the HTTP request context
	ctx, cancel := context.WithCancel(context.Background())

	// Store cancel so we can call it when the connection closes
	netConn.SetContext(ctx, cancel)

	go ts.handleConnection(netConn, ctx)
}

func (ts *TestServer) handleConnection(conn *network.Connection, ctx context.Context) {
	defer func() {
		ts.Hub.Unregister(conn.ID)
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case data, ok := <-conn.Messages():
			if !ok {
				return
			}

			var msg protocol.Message
			if err := json.Unmarshal(data, &msg); err != nil {
				ts.sendError(conn, "invalid_json", "malformed message")
				continue
			}

			ts.handleMessage(conn, &msg)
		}
	}
}

func (ts *TestServer) handleMessage(conn *network.Connection, msg *protocol.Message) {
	switch msg.Type {
	case protocol.MessageTypeJoinRoom:
		ts.handleJoinRoom(conn, msg)
	case protocol.MessageTypePlayerInput:
		ts.handlePlayerInput(conn, msg)
	case protocol.MessageTypeLeaveRoom:
		ts.handleLeaveRoom(conn, msg)
	default:
		ts.sendError(conn, "unknown_message_type", "unsupported message type")
	}
}

func (ts *TestServer) handleJoinRoom(conn *network.Connection, msg *protocol.Message) {
	var req protocol.JoinRoomRequest
	if err := msg.UnmarshalPayload(&req); err != nil {
		ts.sendError(conn, "invalid_payload", "failed to parse join room request")
		return
	}

	if req.RoomID == "" || req.PlayerID == "" {
		ts.sendError(conn, "missing_fields", "room_id and player_id are required")
		return
	}

	conn.PlayerID = req.PlayerID
	conn.RoomID = req.RoomID

	_, roomExists := ts.Matchmaker.GetRoom(req.RoomID)
	if !roomExists {
		_, err := ts.Matchmaker.CreateRoom(req.RoomID)
		if err != nil {
			ts.sendError(conn, "room_creation_failed", err.Error())
			return
		}
	}

	if err := ts.Matchmaker.JoinRoom(req.RoomID, req.PlayerID, conn.ID, req.PlayerName, req.Color); err != nil {
		ts.sendError(conn, "join_failed", err.Error())
		return
	}

	ts.sendAck(conn, "join_room", req.RoomID)
}

func (ts *TestServer) handlePlayerInput(conn *network.Connection, msg *protocol.Message) {
	if conn.PlayerID == "" || conn.RoomID == "" {
		ts.sendError(conn, "not_in_room", "player is not in a room")
		return
	}

	var req protocol.PlayerInputMessage
	if err := msg.UnmarshalPayload(&req); err != nil {
		ts.sendError(conn, "invalid_payload", "failed to parse player input")
		return
	}

	var dir models.Direction
	switch req.Direction {
	case "up":
		dir = models.DirectionUp
	case "down":
		dir = models.DirectionDown
	case "left":
		dir = models.DirectionLeft
	case "right":
		dir = models.DirectionRight
	default:
		dir = models.DirectionNone
	}

	ts.Matchmaker.HandlePlayerInput(conn.PlayerID, conn.RoomID, dir)
}

func (ts *TestServer) handleLeaveRoom(conn *network.Connection, msg *protocol.Message) {
	if conn.PlayerID == "" || conn.RoomID == "" {
		return
	}

	ts.Matchmaker.LeaveRoom(conn.RoomID, conn.PlayerID)
	conn.PlayerID = ""
	conn.RoomID = ""
}

func (ts *TestServer) sendError(conn *network.Connection, code, message string) {
	msg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
		Code:    code,
		Message: message,
	})
	conn.SendMessage(msg)
}

func (ts *TestServer) sendAck(conn *network.Connection, action, roomID string) {
	msg, _ := protocol.NewMessage(protocol.MessageTypeAck, map[string]string{
		"action":  action,
		"room_id": roomID,
	})
	conn.SendMessage(msg)
}

func (ts *TestServer) Close() {
	ts.Matchmaker.Shutdown()
	ts.Server.CloseClientConnections()
	ts.Server.Close()
}

// WebSocketClient is a test client for WebSocket connections
type WebSocketClient struct {
	conn   *websocket.Conn
	URL    string
	mu     sync.Mutex
	inbox  []protocol.Message
}

func NewWebSocketClient(t *testing.T, url string) (*WebSocketClient, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		Subprotocols: []string{"json"},
	})
	if err != nil {
		return nil, err
	}

	client := &WebSocketClient{
		conn:  conn,
		URL:   url,
		inbox: make([]protocol.Message, 0),
	}

	// Start reading messages in background
	go client.readMessages()

	return client, nil
}

func (c *WebSocketClient) readMessages() {
	ctx := context.Background()
	for {
		_, msg, err := c.conn.Read(ctx)
		if err != nil {
			return
		}

		var protocolMsg protocol.Message
		if err := json.Unmarshal(msg, &protocolMsg); err != nil {
			continue
		}

		c.mu.Lock()
		c.inbox = append(c.inbox, protocolMsg)
		c.mu.Unlock()
	}
}

func (c *WebSocketClient) Send(msg protocol.Message) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return c.conn.Write(ctx, websocket.MessageText, data)
}

func (c *WebSocketClient) JoinRoom(roomID, playerID, playerName, color string) error {
	msg, _ := protocol.NewMessage(protocol.MessageTypeJoinRoom, protocol.JoinRoomRequest{
		RoomID:     roomID,
		PlayerID:  playerID,
		PlayerName: playerName,
		Color:     color,
	})
	return c.Send(*msg)
}

func (c *WebSocketClient) SendInput(direction string) error {
	msg, _ := protocol.NewMessage(protocol.MessageTypePlayerInput, protocol.PlayerInputMessage{
		Direction: direction,
	})
	return c.Send(*msg)
}

func (c *WebSocketClient) LeaveRoom() error {
	msg, _ := protocol.NewMessage(protocol.MessageTypeLeaveRoom, protocol.LeaveRoomRequest{})
	return c.Send(*msg)
}

func (c *WebSocketClient) Receive(timeout time.Duration) (*protocol.Message, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
			c.mu.Lock()
			if len(c.inbox) > 0 {
				msg := c.inbox[0]
				c.inbox = c.inbox[1:]
				c.mu.Unlock()
				return &msg, nil
			}
			c.mu.Unlock()
		}
	}
}

func (c *WebSocketClient) ReceiveAll(timeout time.Duration) []protocol.Message {
	time.Sleep(timeout)
	c.mu.Lock()
	msgs := make([]protocol.Message, len(c.inbox))
	copy(msgs, c.inbox)
	c.inbox = c.inbox[:0]
	c.mu.Unlock()
	return msgs
}

func (c *WebSocketClient) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = ctx // context used for timeout, not directly referenced in Close
	return c.conn.Close(websocket.StatusNormalClosure, "")
}

func generateRoomID() string {
	return "room_" + time.Now().Format("20060102150405")
}

func generateConnID() string {
	return "conn_" + time.Now().Format("20060102150405.000000000")
}

// Helper to wait for message of specific type
func waitForMessageType(t *testing.T, client *WebSocketClient, msgType protocol.MessageType, timeout time.Duration) *protocol.Message {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		msg, err := client.Receive(100 * time.Millisecond)
		if err == nil && msg.Type == msgType {
			return msg
		}
	}
	t.Fatalf("timeout waiting for message type: %s", msgType)
	return nil
}