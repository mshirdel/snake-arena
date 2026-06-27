package storage

import (
	"testing"
	"time"
)

func TestHighScoresKeepsTopScores(t *testing.T) {
	scores := NewHighScores(3)

	scores.Add(HighScore{PlayerID: "low", Score: 4, CreatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)})
	scores.Add(HighScore{PlayerID: "high", Score: 9, CreatedAt: time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)})
	scores.Add(HighScore{PlayerID: "mid", Score: 6, CreatedAt: time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC)})
	scores.Add(HighScore{PlayerID: "higher", Score: 10, CreatedAt: time.Date(2026, 1, 4, 0, 0, 0, 0, time.UTC)})

	got := scores.List()
	if len(got) != 3 {
		t.Fatalf("expected 3 scores, got %d", len(got))
	}

	wantOrder := []string{"higher", "high", "mid"}
	for i, want := range wantOrder {
		if got[i].PlayerID != want {
			t.Fatalf("score %d: expected player %s, got %s", i, want, got[i].PlayerID)
		}
	}
}

func TestHighScoresReturnsCopy(t *testing.T) {
	scores := NewHighScores(10)
	scores.Add(HighScore{PlayerID: "player-1", Score: 5})

	got := scores.List()
	got[0].PlayerID = "mutated"

	if scores.List()[0].PlayerID != "player-1" {
		t.Fatal("expected List to return a copy")
	}
}

func TestHighScoresKeepsOneBestScorePerPlayer(t *testing.T) {
	scores := NewHighScores(10)

	scores.Add(HighScore{
		PlayerID:   "player-1",
		PlayerName: "Alice",
		RoomID:     "room-1",
		Score:      8,
		CreatedAt:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	})
	scores.Add(HighScore{
		PlayerID:   "player-1",
		PlayerName: "Alice",
		RoomID:     "room-2",
		Score:      5,
		CreatedAt:  time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC),
	})
	scores.Add(HighScore{
		PlayerID:   "player-1",
		PlayerName: "Alice Updated",
		RoomID:     "room-3",
		Score:      12,
		CreatedAt:  time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC),
	})

	got := scores.List()
	if len(got) != 1 {
		t.Fatalf("expected 1 high score, got %d", len(got))
	}
	if got[0].Score != 12 {
		t.Fatalf("expected best score 12, got %d", got[0].Score)
	}
	if got[0].RoomID != "room-3" {
		t.Fatalf("expected best score room room-3, got %s", got[0].RoomID)
	}
	if got[0].PlayerName != "Alice Updated" {
		t.Fatalf("expected updated player name, got %s", got[0].PlayerName)
	}
}

func TestHighScoresGetsScoreByPlayerID(t *testing.T) {
	scores := NewHighScores(10)
	scores.Add(HighScore{
		PlayerID:   "player-1",
		PlayerName: "Alice",
		RoomID:     "room-1",
		Score:      8,
	})

	got, ok := scores.GetByPlayerID("player-1")
	if !ok {
		t.Fatal("expected score for player-1")
	}
	if got.Score != 8 {
		t.Fatalf("expected score 8, got %d", got.Score)
	}

	if _, ok := scores.GetByPlayerID("missing"); ok {
		t.Fatal("expected no score for missing player")
	}
}

func TestHighScoresKeepsPlayerScoreOutsideLeaderboard(t *testing.T) {
	scores := NewHighScores(1)

	scores.Add(HighScore{PlayerID: "leader", Score: 20})
	scores.Add(HighScore{PlayerID: "player-1", Score: 5})

	list := scores.List()
	if len(list) != 1 {
		t.Fatalf("expected leaderboard to keep 1 score, got %d", len(list))
	}
	if list[0].PlayerID != "leader" {
		t.Fatalf("expected leader on leaderboard, got %s", list[0].PlayerID)
	}

	got, ok := scores.GetByPlayerID("player-1")
	if !ok {
		t.Fatal("expected player-1 score to remain available")
	}
	if got.Score != 5 {
		t.Fatalf("expected player-1 score 5, got %d", got.Score)
	}
}
