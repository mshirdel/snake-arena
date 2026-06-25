package network

import "testing"

func TestPlayingConnectionCount(t *testing.T) {
	h := NewHub()
	h.connections["connected"] = &Connection{ID: "connected"}
	h.connections["playing"] = &Connection{ID: "playing", PlayerID: "player-1", RoomID: "room-1"}
	h.connections["closed-playing"] = &Connection{
		ID:       "closed-playing",
		PlayerID: "player-2",
		RoomID:   "room-1",
		closed:   true,
	}

	if got := h.PlayingConnectionCount(); got != 1 {
		t.Fatalf("expected 1 playing connection, got %d", got)
	}
}
