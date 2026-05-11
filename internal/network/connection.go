package network

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/mshirdel/snake/internal/protocol"
)

// Connection represents a client WebSocket connection.
type Connection struct {
	ID        string
	PlayerID  string
	RoomID    string
	conn      *websocket.Conn
	send      chan []byte
	messages  chan []byte
	ctx       context.Context
	cancel    context.CancelFunc
	mu        sync.RWMutex
	closed    bool
	closeOnce sync.Once
}

// NewConnection creates a new WebSocket connection wrapper.
func NewConnection(id, playerID string, conn *websocket.Conn) *Connection {
	ctx, cancel := context.WithCancel(context.Background())
	c := &Connection{
		ID:       id,
		PlayerID: playerID,
		conn:     conn,
		send:     make(chan []byte, 256),
		messages: make(chan []byte, 256),
		ctx:      ctx,
		cancel:   cancel,
	}
	// Start read and write goroutines
	go c.readPump()
	go c.writePump()
	return c
}

// SendMessage sends a message to the client.
func (c *Connection) SendMessage(msg *protocol.Message) error {
	c.mu.RLock()
	if c.closed {
		c.mu.RUnlock()
		return fmt.Errorf("connection closed")
	}
	c.mu.RUnlock()

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	select {
	case c.send <- data:
		return nil
	case <-c.ctx.Done():
		return fmt.Errorf("connection context cancelled")
	default:
		// Channel full, message dropped
		return fmt.Errorf("send queue full")
	}
}

// Messages returns the channel for receiving parsed messages.
func (c *Connection) Messages() <-chan []byte {
	return c.messages
}

// Close closes the connection.
func (c *Connection) Close() error {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil
	}
	c.closed = true
	c.mu.Unlock()

	c.closeOnce.Do(func() {
		c.cancel()
		close(c.send)
		close(c.messages)
		c.conn.Close(websocket.StatusNormalClosure, "")
	})
	return nil
}

// IsClosed returns whether the connection is closed.
func (c *Connection) IsClosed() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.closed
}

// readPump reads messages from the client.
func (c *Connection) readPump() {
	defer func() {
		c.Close()
	}()

	c.conn.SetReadLimit(65536)
	for {
		select {
		case <-c.ctx.Done():
			return
		default:
		}

		_, data, err := c.conn.Read(c.ctx)
		if err != nil {
			if websocket.CloseStatus(err) == websocket.StatusNormalClosure {
				return
			}
			return
		}

		// Queue message for handler to process
		select {
		case c.messages <- data:
		case <-c.ctx.Done():
			return
		default:
			// Channel full, message dropped
		}
	}
}

// writePump writes messages to the client.
func (c *Connection) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close(websocket.StatusInternalError, "")
	}()

	for {
		select {
		case <-c.ctx.Done():
			return
		case data, ok := <-c.send:
			if !ok {
				c.conn.Close(websocket.StatusNormalClosure, "")
				return
			}
			ctx, cancel := context.WithTimeout(c.ctx, 10*time.Second)
			err := c.conn.Write(ctx, websocket.MessageText, data)
			cancel()
			if err != nil {
				return
			}
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(c.ctx, 10*time.Second)
			err := c.conn.Ping(ctx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

// Hub manages all connections and broadcasts.
type Hub struct {
	connections map[string]*Connection
	mu          sync.RWMutex
}

// NewHub creates a new connection hub.
func NewHub() *Hub {
	return &Hub{
		connections: make(map[string]*Connection),
	}
}

// Register registers a new connection.
func (h *Hub) Register(conn *Connection) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.connections[conn.ID] = conn
}

// Unregister removes a connection.
func (h *Hub) Unregister(connID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if conn, ok := h.connections[connID]; ok {
		conn.Close()
		delete(h.connections, connID)
	}
}

// GetConnection retrieves a connection by ID.
func (h *Hub) GetConnection(connID string) (*Connection, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	conn, ok := h.connections[connID]
	return conn, ok
}

// BroadcastToRoom sends a message to all connections in a room.
func (h *Hub) BroadcastToRoom(roomID string, msg *protocol.Message) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, conn := range h.connections {
		if conn.RoomID == roomID && !conn.IsClosed() {
			conn.SendMessage(msg)
		}
	}
}

// GetConnectionsInRoom returns all connections in a room.
func (h *Hub) GetConnectionsInRoom(roomID string) []*Connection {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var conns []*Connection
	for _, conn := range h.connections {
		if conn.RoomID == roomID && !conn.IsClosed() {
			conns = append(conns, conn)
		}
	}
	return conns
}

// ConnectionCount returns the total number of active connections.
func (h *Hub) ConnectionCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.connections)
}
