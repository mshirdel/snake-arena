package storage

import (
	"sort"
	"sync"
	"time"
)

const defaultHighScoreLimit = 10

// HighScore records a player's best completed snake run.
type HighScore struct {
	PlayerID   string    `json:"player_id"`
	PlayerName string    `json:"player_name"`
	RoomID     string    `json:"room_id"`
	Score      int       `json:"score"`
	CreatedAt  time.Time `json:"created_at"`
}

// HighScores stores each player's top snake score in memory.
type HighScores struct {
	mu       sync.RWMutex
	limit    int
	entries  []HighScore
	byPlayer map[string]HighScore
}

// NewHighScores creates an in-memory high-score store.
func NewHighScores(limit int) *HighScores {
	if limit <= 0 {
		limit = defaultHighScoreLimit
	}
	return &HighScores{
		limit:    limit,
		entries:  make([]HighScore, 0, limit),
		byPlayer: make(map[string]HighScore),
	}
}

// Add records a player's score if it improves their current high score.
func (h *HighScores) Add(score HighScore) {
	if score.Score <= 0 {
		return
	}
	if score.CreatedAt.IsZero() {
		score.CreatedAt = time.Now().UTC()
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	current, exists := h.byPlayer[score.PlayerID]
	if exists && score.Score <= current.Score {
		return
	}

	h.byPlayer[score.PlayerID] = score
	h.rebuildLeaderboard()
}

func (h *HighScores) rebuildLeaderboard() {
	h.entries = h.entries[:0]
	for _, entry := range h.byPlayer {
		h.entries = append(h.entries, entry)
	}
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

// GetByPlayerID returns a player's stored high score.
func (h *HighScores) GetByPlayerID(playerID string) (HighScore, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	entry, ok := h.byPlayer[playerID]
	return entry, ok
}
