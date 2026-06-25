package room

import (
	"testing"
	"time"

	"github.com/mshirdel/snake/internal/models"
	"github.com/mshirdel/snake/internal/network"
)

func TestNewRoomAddsBot(t *testing.T) {
	r := NewRoom("room-with-bot", models.DefaultRoomConfig(), network.NewHub())
	defer r.Close()

	state := r.GetState()
	botSnake, ok := state.Snakes[models.DefaultRoomConfig().BotID]
	if !ok {
		t.Fatal("expected room to create bot snake")
	}
	if botSnake.Color != models.DefaultRoomConfig().BotColor {
		t.Fatalf("expected bot color %s, got %s", models.DefaultRoomConfig().BotColor, botSnake.Color)
	}
	if r.GetHumanPlayerCount() != 0 {
		t.Fatalf("expected no human players, got %d", r.GetHumanPlayerCount())
	}
}

func TestBotMovesOnTick(t *testing.T) {
	config := models.DefaultRoomConfig()
	r := NewRoom("moving-bot", config, network.NewHub())
	defer r.Close()

	initial := r.GetState().Snakes[config.BotID].Head

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		current := r.GetState().Snakes[config.BotID].Head
		if current != initial {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}

	t.Fatal("bot did not move after room ticks")
}

func TestHumanPlayerCountExcludesBot(t *testing.T) {
	config := models.DefaultRoomConfig()
	r := NewRoom("human-count", config, network.NewHub())
	defer r.Close()

	if err := r.AddPlayer("player-1", "missing-conn", "Alice", "#22c55e"); err != nil {
		t.Fatalf("failed to add player: %v", err)
	}

	if got := r.GetHumanPlayerCount(); got != 1 {
		t.Fatalf("expected 1 human player, got %d", got)
	}
	if got := r.GetPlayerCount(); got != 2 {
		t.Fatalf("expected 2 total players including bot, got %d", got)
	}
}
