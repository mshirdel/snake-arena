package matchmaker

import (
	"testing"

	"github.com/mshirdel/snake/internal/models"
	"github.com/mshirdel/snake/internal/network"
)

func TestGetPlayingRoomCount(t *testing.T) {
	mm := NewMatchmaker(network.NewHub(), models.DefaultRoomConfig())
	defer mm.Shutdown()

	if _, err := mm.CreateRoom("empty-room"); err != nil {
		t.Fatalf("failed to create empty room: %v", err)
	}
	if _, err := mm.CreateRoom("playing-room"); err != nil {
		t.Fatalf("failed to create playing room: %v", err)
	}
	if err := mm.JoinRoom("playing-room", "player-1", "missing-conn", "Alice", "#22c55e"); err != nil {
		t.Fatalf("failed to join playing room: %v", err)
	}

	if got := mm.GetPlayingRoomCount(); got != 1 {
		t.Fatalf("expected 1 room with human players, got %d", got)
	}
}

func TestGetTotalPlayedUserCount(t *testing.T) {
	mm := NewMatchmaker(network.NewHub(), models.DefaultRoomConfig())
	defer mm.Shutdown()

	if _, err := mm.CreateRoom("room-1"); err != nil {
		t.Fatalf("failed to create room: %v", err)
	}
	if err := mm.JoinRoom("room-1", "player-1", "missing-conn-1", "Alice", "#22c55e"); err != nil {
		t.Fatalf("failed to join room: %v", err)
	}
	if err := mm.LeaveRoom("room-1", "player-1"); err != nil {
		t.Fatalf("failed to leave room: %v", err)
	}
	if _, err := mm.CreateRoom("room-2"); err != nil {
		t.Fatalf("failed to create second room: %v", err)
	}
	if err := mm.JoinRoom("room-2", "player-1", "missing-conn-2", "Alice", "#22c55e"); err != nil {
		t.Fatalf("failed to rejoin room: %v", err)
	}
	if err := mm.JoinRoom("room-2", "player-2", "missing-conn-3", "Bob", "#3b82f6"); err != nil {
		t.Fatalf("failed to join second player: %v", err)
	}

	if got := mm.GetTotalPlayedUserCount(); got != 2 {
		t.Fatalf("expected 2 total played users, got %d", got)
	}
}
