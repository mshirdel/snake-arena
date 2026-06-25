package bot

import "github.com/mshirdel/snake/internal/models"

// SimpleBot chooses safe directions that move toward the nearest food.
type SimpleBot struct {
	PlayerID string
}

// NextDirection returns the bot's next input for the provided game state.
func (b SimpleBot) NextDirection(state *models.GameState) models.Direction {
	snake, ok := state.Snakes[b.PlayerID]
	if !ok || snake.Dead {
		return models.DirectionNone
	}

	occupied := occupiedPositions(state)
	directions := []models.Direction{
		models.DirectionUp,
		models.DirectionDown,
		models.DirectionLeft,
		models.DirectionRight,
	}

	target, hasTarget := nearestFood(snake.Head, state.Foods)
	bestDirection := models.DirectionNone
	bestDistance := maxInt()

	for _, direction := range directions {
		if isOpposite(direction, snake.Direction) {
			continue
		}

		next := nextPosition(snake.Head, direction)
		if !isSafe(next, state.Width, state.Height, occupied) {
			continue
		}

		if !hasTarget {
			return direction
		}

		distance := manhattan(next, target)
		if distance < bestDistance {
			bestDistance = distance
			bestDirection = direction
		}
	}

	if bestDirection != models.DirectionNone {
		return bestDirection
	}

	return snake.Direction
}

func nearestFood(head models.Vector2D, foods []models.Food) (models.Vector2D, bool) {
	if len(foods) == 0 {
		return models.Vector2D{}, false
	}

	target := foods[0].Position
	bestDistance := manhattan(head, target)
	for _, food := range foods[1:] {
		distance := manhattan(head, food.Position)
		if distance < bestDistance {
			bestDistance = distance
			target = food.Position
		}
	}
	return target, true
}

func occupiedPositions(state *models.GameState) map[models.Vector2D]struct{} {
	occupied := make(map[models.Vector2D]struct{})
	for _, snake := range state.Snakes {
		if snake.Dead {
			continue
		}
		occupied[snake.Head] = struct{}{}
		for _, segment := range snake.Body {
			occupied[segment] = struct{}{}
		}
	}
	return occupied
}

func isSafe(pos models.Vector2D, width, height int, occupied map[models.Vector2D]struct{}) bool {
	if pos.X < 0 || pos.X >= width || pos.Y < 0 || pos.Y >= height {
		return false
	}
	_, blocked := occupied[pos]
	return !blocked
}

func nextPosition(pos models.Vector2D, direction models.Direction) models.Vector2D {
	switch direction {
	case models.DirectionUp:
		return models.Vector2D{X: pos.X, Y: pos.Y - 1}
	case models.DirectionDown:
		return models.Vector2D{X: pos.X, Y: pos.Y + 1}
	case models.DirectionLeft:
		return models.Vector2D{X: pos.X - 1, Y: pos.Y}
	case models.DirectionRight:
		return models.Vector2D{X: pos.X + 1, Y: pos.Y}
	default:
		return pos
	}
}

func isOpposite(a, b models.Direction) bool {
	return (a == models.DirectionUp && b == models.DirectionDown) ||
		(a == models.DirectionDown && b == models.DirectionUp) ||
		(a == models.DirectionLeft && b == models.DirectionRight) ||
		(a == models.DirectionRight && b == models.DirectionLeft)
}

func manhattan(a, b models.Vector2D) int {
	return abs(a.X-b.X) + abs(a.Y-b.Y)
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func maxInt() int {
	return int(^uint(0) >> 1)
}
