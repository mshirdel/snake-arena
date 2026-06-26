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
