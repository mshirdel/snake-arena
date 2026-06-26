package storage

import (
	"sort"
	"sync"
	"time"
)

const defaultHighScoreLimit = 10

// HighScore records one completed snake run.
type HighScore struct {
	PlayerID   string    `json:"player_id"`
	PlayerName string    `json:"player_name"`
	RoomID     string    `json:"room_id"`
	Score      int       `json:"score"`
	CreatedAt  time.Time `json:"created_at"`
}

// HighScores stores the top snake scores in memory.
type HighScores struct {
	mu      sync.RWMutex
	limit   int
	entries []HighScore
}

// NewHighScores creates an in-memory high-score store.
func NewHighScores(limit int) *HighScores {
	if limit <= 0 {
		limit = defaultHighScoreLimit
	}
	return &HighScores{
		limit:   limit,
		entries: make([]HighScore, 0, limit),
	}
}

// Add records a score if it belongs in the current top list.
func (h *HighScores) Add(score HighScore) {
	if score.Score <= 0 {
		return
	}
	if score.CreatedAt.IsZero() {
		score.CreatedAt = time.Now().UTC()
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	h.entries = append(h.entries, score)
	sort.SliceStable(h.entries, func(i, j int) bool {
		if h.entries[i].Score == h.entries[j].Score {
			return h.entries[i].CreatedAt.Before(h.entries[j].CreatedAt)
		}
		return h.entries[i].Score > h.entries[j].Score
	})
	if len(h.entries) > h.limit {
		h.entries = h.entries[:h.limit]
	}
}

// List returns the current top scores in descending score order.
func (h *HighScores) List() []HighScore {
	h.mu.RLock()
	defer h.mu.RUnlock()

	result := make([]HighScore, len(h.entries))
	copy(result, h.entries)
	return result
}
