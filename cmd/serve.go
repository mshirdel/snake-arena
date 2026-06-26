package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	echoMiddleware "github.com/labstack/echo/v4/middleware"
	"github.com/spf13/cobra"

	"github.com/mshirdel/snake/internal/config"
	"github.com/mshirdel/snake/internal/matchmaker"
	"github.com/mshirdel/snake/internal/models"
	"github.com/mshirdel/snake/internal/network"
	"github.com/mshirdel/snake/internal/protocol"
	"github.com/mshirdel/snake/internal/storage"
)

var (
	configPath string

	serveCmd = &cobra.Command{
		Use:   "serve",
		Short: "Start the Snake game server",
		RunE:  runServe,
	}
)

const (
	adminUsername = "admin"
	adminPassword = "admin123"
)

type adminStats struct {
	WebSocketConnections int `json:"websocket_connections"`
	RoomsWithPlayers     int `json:"rooms_with_players"`
	OnlineUsers          int `json:"online_users"`
	TotalPlayedUsers     int `json:"total_played_users"`
}

func init() {
	serveCmd.Flags().StringVarP(&configPath, "config", "c", "", "Path to config file (default: config.yaml)")
	rootCmd.AddCommand(serveCmd)
}

func runServe(cmd *cobra.Command, args []string) error {
	// Load configuration
	cfg := config.DefaultConfig()
	if err := cfg.Validate(); err != nil {
		return fmt.Errorf("invalid configuration: %w", err)
	}

	// Create Echo server
	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(echoMiddleware.CORSConfig{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE"},
		AllowHeaders:     []string{},
		AllowCredentials: false,
		ExposeHeaders:    []string{},
		MaxAge:           0,
	}))

	// Initialize network and matchmaker
	connHub := network.NewHub()
	highScores := storage.NewHighScores(10)
	mm := matchmaker.NewMatchmaker(connHub, models.DefaultRoomConfig(), highScores)

	// HTTP endpoints
	e.GET("/health", handleHealth)
	e.GET("/rooms", handleListRooms(mm))
	e.POST("/rooms", handleCreateRoom(mm))
	e.GET("/high-scores", handleHighScores(highScores))
	e.GET("/ws", handleWebSocket(connHub, mm))
	registerAdminRoutes(e, connHub, mm)

	// Start server
	addr := cfg.Server.Addr()
	fmt.Printf("Starting Snake server on %s\n", addr)

	if err := e.Start(addr); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("server error: %w", err)
	}

	return nil
}

func handleHighScores(highScores *storage.HighScores) echo.HandlerFunc {
	return func(c echo.Context) error {
		scores := highScores.List()
		return c.JSON(http.StatusOK, map[string]interface{}{
			"high_scores": scores,
			"count":       len(scores),
		})
	}
}

func registerAdminRoutes(e *echo.Echo, connHub *network.Hub, mm *matchmaker.Matchmaker) {
	admin := e.Group("/admin")
	admin.Use(middleware.BasicAuth(func(username, password string, c echo.Context) (bool, error) {
		usernameOK := subtle.ConstantTimeCompare([]byte(username), []byte(adminUsername)) == 1
		passwordOK := subtle.ConstantTimeCompare([]byte(password), []byte(adminPassword)) == 1
		return usernameOK && passwordOK, nil
	}))

	admin.GET("", handleAdminPanel(connHub, mm))
	admin.GET("/stats", handleAdminStats(connHub, mm))
}

func collectAdminStats(connHub *network.Hub, mm *matchmaker.Matchmaker) adminStats {
	return adminStats{
		WebSocketConnections: connHub.ConnectionCount(),
		RoomsWithPlayers:     mm.GetPlayingRoomCount(),
		OnlineUsers:          connHub.PlayingConnectionCount(),
		TotalPlayedUsers:     mm.GetTotalPlayedUserCount(),
	}
}

func handleAdminStats(connHub *network.Hub, mm *matchmaker.Matchmaker) echo.HandlerFunc {
	return func(c echo.Context) error {
		return c.JSON(http.StatusOK, collectAdminStats(connHub, mm))
	}
}

func handleAdminPanel(connHub *network.Hub, mm *matchmaker.Matchmaker) echo.HandlerFunc {
	return func(c echo.Context) error {
		c.Response().Header().Set(echo.HeaderContentType, echo.MIMETextHTMLCharsetUTF8)
		return adminPanelTemplate.Execute(c.Response().Writer, collectAdminStats(connHub, mm))
	}
}

// handleHealth returns server health status.
func handleHealth(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status": "healthy",
	})
}

// handleListRooms returns all active rooms.
func handleListRooms(mm *matchmaker.Matchmaker) echo.HandlerFunc {
	return func(c echo.Context) error {
		rooms := mm.ListRooms()
		return c.JSON(http.StatusOK, map[string]interface{}{
			"rooms": rooms,
			"count": len(rooms),
		})
	}
}

// handleCreateRoom creates a new game room.
func handleCreateRoom(mm *matchmaker.Matchmaker) echo.HandlerFunc {
	return func(c echo.Context) error {
		var req struct {
			RoomID string `json:"room_id"`
		}
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "invalid request",
			})
		}

		if req.RoomID == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "room_id is required",
			})
		}

		r, err := mm.CreateRoom(req.RoomID)
		if err != nil {
			return c.JSON(http.StatusConflict, map[string]string{
				"error": err.Error(),
			})
		}

		state := r.GetState()
		return c.JSON(http.StatusCreated, map[string]interface{}{
			"room_id": r.ID,
			"width":   state.Width,
			"height":  state.Height,
		})
	}
}

// handleWebSocket handles WebSocket connections.
func handleWebSocket(connHub *network.Hub, mm *matchmaker.Matchmaker) echo.HandlerFunc {
	return func(c echo.Context) error {
		conn, err := websocket.Accept(c.Response().Unwrap(), c.Request(), &websocket.AcceptOptions{
			Subprotocols:   []string{"json"},
			OriginPatterns: []string{"*"},
		})
		if err != nil {
			return err
		}

		// Create connection wrapper
		connID := generateConnID()
		netConn := network.NewConnection(connID, "", conn)
		connHub.Register(netConn)

		// Handle connection lifecycle
		go handleClientConnection(netConn, connHub, mm, context.Background())

		return nil
	}
}

// handleClientConnection manages a single client connection.
func handleClientConnection(conn *network.Connection, connHub *network.Hub, mm *matchmaker.Matchmaker, ctx context.Context) {
	defer func() {
		connHub.Unregister(conn.ID)
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case data, ok := <-conn.Messages():
			if !ok {
				return
			}

			// Parse message
			var msg protocol.Message
			if err := json.Unmarshal(data, &msg); err != nil {
				errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
					Code:    "invalid_json",
					Message: "malformed message",
				})
				conn.SendMessage(errMsg)
				continue
			}

			// Route message
			switch msg.Type {
			case protocol.MessageTypeJoinRoom:
				handleJoinRoom(conn, connHub, mm, &msg)
			case protocol.MessageTypePlayerInput:
				handlePlayerInput(conn, connHub, mm, &msg)
			case protocol.MessageTypeLeaveRoom:
				handleLeaveRoom(conn, connHub, mm, &msg)
			case protocol.MessageTypePlayAgain:
				handlePlayAgain(conn, connHub, mm, &msg)
			case protocol.MessageTypePing:
				pong, _ := protocol.NewMessage(protocol.MessageTypePong, msg.Payload)
				conn.SendMessage(pong)
			default:
				errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
					Code:    "unknown_message_type",
					Message: "unsupported message type",
				})
				conn.SendMessage(errMsg)
			}
		}
	}
}

// handleJoinRoom processes join room requests.
func handleJoinRoom(conn *network.Connection, connHub *network.Hub, mm *matchmaker.Matchmaker, msg *protocol.Message) {
	var req protocol.JoinRoomRequest
	if err := msg.UnmarshalPayload(&req); err != nil {
		errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
			Code:    "invalid_payload",
			Message: "failed to parse join room request",
		})
		conn.SendMessage(errMsg)
		return
	}

	// Validate input
	if req.PlayerID == "" {
		errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
			Code:    "missing_fields",
			Message: "player_id is required",
		})
		conn.SendMessage(errMsg)
		return
	}

	// Auto-assign room if not specified
	if req.RoomID == "" {
		req.RoomID = mm.FindOrCreateRoom()
	}

	// Update connection
	conn.PlayerID = req.PlayerID
	conn.RoomID = req.RoomID

	// Try to join room (creates if doesn't exist)
	_, roomExists := mm.GetRoom(req.RoomID)
	if !roomExists {
		_, err := mm.CreateRoom(req.RoomID)
		if err != nil {
			errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
				Code:    "room_creation_failed",
				Message: err.Error(),
			})
			conn.SendMessage(errMsg)
			return
		}
	}

	// Join the room
	if err := mm.JoinRoom(req.RoomID, req.PlayerID, conn.ID, req.PlayerName, req.Color); err != nil {
		errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
			Code:    "join_failed",
			Message: err.Error(),
		})
		conn.SendMessage(errMsg)
		return
	}

	// Send acknowledgment
	ackMsg, _ := protocol.NewMessage(protocol.MessageTypeAck, map[string]string{
		"action":  "join_room",
		"room_id": req.RoomID,
	})
	conn.SendMessage(ackMsg)
}

// handlePlayerInput processes player input.
func handlePlayerInput(conn *network.Connection, connHub *network.Hub, mm *matchmaker.Matchmaker, msg *protocol.Message) {
	if conn.PlayerID == "" || conn.RoomID == "" {
		errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
			Code:    "not_in_room",
			Message: "player is not in a room",
		})
		conn.SendMessage(errMsg)
		return
	}

	var req protocol.PlayerInputMessage
	if err := msg.UnmarshalPayload(&req); err != nil {
		errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
			Code:    "invalid_payload",
			Message: "failed to parse player input",
		})
		conn.SendMessage(errMsg)
		return
	}

	// Parse direction
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

	// Queue input (room will process on next tick)
	if err := mm.HandlePlayerInput(conn.PlayerID, conn.RoomID, dir, req.ClientTick, req.LastServerTick, req.InputSeq); err != nil {
		errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
			Code:    "input_failed",
			Message: err.Error(),
		})
		conn.SendMessage(errMsg)
	}
}

// handleLeaveRoom processes leave room requests.
func handleLeaveRoom(conn *network.Connection, connHub *network.Hub, mm *matchmaker.Matchmaker, msg *protocol.Message) {
	if conn.PlayerID == "" || conn.RoomID == "" {
		return
	}

	if err := mm.LeaveRoom(conn.RoomID, conn.PlayerID); err != nil {
		errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
			Code:    "leave_failed",
			Message: err.Error(),
		})
		conn.SendMessage(errMsg)
		return
	}

	conn.PlayerID = ""
	conn.RoomID = ""
}

// handlePlayAgain processes a player's decision to respawn or quit after death.
func handlePlayAgain(conn *network.Connection, connHub *network.Hub, mm *matchmaker.Matchmaker, msg *protocol.Message) {
	if conn.PlayerID == "" || conn.RoomID == "" {
		errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
			Code:    "not_in_room",
			Message: "player is not in a room",
		})
		conn.SendMessage(errMsg)
		return
	}

	var req protocol.PlayAgainRequest
	if err := msg.UnmarshalPayload(&req); err != nil {
		errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
			Code:    "invalid_payload",
			Message: "failed to parse play again request",
		})
		conn.SendMessage(errMsg)
		return
	}

	if err := mm.HandlePlayAgain(conn.PlayerID, conn.RoomID, req.PlayAgain); err != nil {
		errMsg, _ := protocol.NewMessage(protocol.MessageTypeError, protocol.ErrorMessage{
			Code:    "play_again_failed",
			Message: err.Error(),
		})
		conn.SendMessage(errMsg)
		return
	}

	if !req.PlayAgain {
		conn.PlayerID = ""
		conn.RoomID = ""
	}
}

// generateConnID generates a unique connection ID.
func generateConnID() string {
	return fmt.Sprintf("conn_%d", time.Now().UnixNano())
}
