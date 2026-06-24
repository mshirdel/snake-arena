package bot

import (
	"testing"

	"github.com/mshirdel/snake/internal/models"
)

func TestSimpleBotMovesTowardNearestFood(t *testing.T) {
	state := testState(models.Snake{
		PlayerID:  "bot",
		Head:      models.Vector2D{X: 5, Y: 5},
		Body:      []models.Vector2D{{X: 4, Y: 5}, {X: 3, Y: 5}},
		Direction: models.DirectionRight,
	})
	state.Foods = []models.Food{{Position: models.Vector2D{X: 8, Y: 5}}}

	got := (SimpleBot{PlayerID: "bot"}).NextDirection(state)
	if got != models.DirectionRight {
		t.Fatalf("expected right, got %v", got)
	}
}

func TestSimpleBotAvoidsWall(t *testing.T) {
	state := testState(models.Snake{
		PlayerID:  "bot",
		Head:      models.Vector2D{X: 9, Y: 5},
		Body:      []models.Vector2D{{X: 8, Y: 5}, {X: 7, Y: 5}},
		Direction: models.DirectionRight,
	})
	state.Foods = []models.Food{{Position: models.Vector2D{X: 12, Y: 5}}}

	got := (SimpleBot{PlayerID: "bot"}).NextDirection(state)
	if got == models.DirectionRight {
		t.Fatal("bot chose to move into the wall")
	}
	if got == models.DirectionLeft {
		t.Fatal("bot chose an immediate reversal")
	}
}

func TestSimpleBotAvoidsOccupiedPositions(t *testing.T) {
	state := testState(models.Snake{
		PlayerID:  "bot",
		Head:      models.Vector2D{X: 5, Y: 5},
		Body:      []models.Vector2D{{X: 4, Y: 5}, {X: 3, Y: 5}},
		Direction: models.DirectionRight,
	})
	state.Snakes["other"] = &models.Snake{
		PlayerID: "other",
		Head:     models.Vector2D{X: 7, Y: 5},
		Body:     []models.Vector2D{{X: 6, Y: 5}},
	}
	state.Foods = []models.Food{{Position: models.Vector2D{X: 8, Y: 5}}}

	got := (SimpleBot{PlayerID: "bot"}).NextDirection(state)
	if got == models.DirectionRight {
		t.Fatal("bot chose an occupied position")
	}
}

func TestSimpleBotDoesNotReverse(t *testing.T) {
	state := testState(models.Snake{
		PlayerID:  "bot",
		Head:      models.Vector2D{X: 5, Y: 5},
		Body:      []models.Vector2D{{X: 6, Y: 5}, {X: 7, Y: 5}},
		Direction: models.DirectionLeft,
	})
	state.Foods = []models.Food{{Position: models.Vector2D{X: 8, Y: 5}}}

	got := (SimpleBot{PlayerID: "bot"}).NextDirection(state)
	if got == models.DirectionRight {
		t.Fatal("bot chose an immediate reversal")
	}
}

func testState(botSnake models.Snake) *models.GameState {
	return &models.GameState{
		Width:  10,
		Height: 10,
		Snakes: map[string]*models.Snake{
			botSnake.PlayerID: &botSnake,
		},
	}
}
