package room

import (
	"testing"
	"time"

	"github.com/mshirdel/snake/internal/models"
	"github.com/mshirdel/snake/internal/network"
	"github.com/mshirdel/snake/internal/storage"
)

func TestNewRoomAddsBot(t *testing.T) {
	r := NewRoom("room-with-bot", models.DefaultRoomConfig(), network.NewHub(), nil)
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
	r := NewRoom("moving-bot", config, network.NewHub(), nil)
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
	r := NewRoom("human-count", config, network.NewHub(), nil)
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

func TestRemovePlayerRecordsHumanHighScore(t *testing.T) {
	config := models.DefaultRoomConfig()
	scores := storage.NewHighScores(10)
	r := NewRoom("scores", config, network.NewHub(), scores)
	defer r.Close()

	if err := r.AddPlayer("player-1", "missing-conn", "Alice", "#22c55e"); err != nil {
		t.Fatalf("failed to add player: %v", err)
	}

	r.RemovePlayer("player-1")

	got := scores.List()
	if len(got) != 1 {
		t.Fatalf("expected 1 high score, got %d", len(got))
	}
	if got[0].PlayerID != "player-1" {
		t.Fatalf("expected player-1 score, got %s", got[0].PlayerID)
	}
	if got[0].PlayerName != "Alice" {
		t.Fatalf("expected Alice player name, got %s", got[0].PlayerName)
	}
	if got[0].Score != 3 {
		t.Fatalf("expected starting length score 3, got %d", got[0].Score)
	}
}
