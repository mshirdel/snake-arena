# Snake Arena — Backend

Real-time multiplayer Snake game server written in Go. The server is fully authoritative — clients send only input intents, and all game simulation runs server-side on a fixed tick rate.

## Quick Start

```bash
make run
```

The server starts on `http://0.0.0.0:8080`.

## Build

```bash
make build    # Build binary to bin/snake
make clean    # Remove bin/
```

## Test

```bash
make test              # Run all Go tests
make test-e2e          # Run integration tests only
make test-all          # Run all Go tests + integration tests
make test-frontend     # Run Playwright frontend tests
```

Run a single package:

```bash
go test ./internal/game/...
```

## Docker

```bash
docker build -t snake-server .
docker run -p 8080:8080 snake-server
```

## Architecture

```
cmd/                    CLI entry point (Cobra)
  serve.go              Starts HTTP/WS server via Echo
internal/
  config/               Server, game, and network configuration
  game/                 Deterministic game engine (tick-based simulation)
  matchmaker/           Room creation, joining, matchmaking
  models/               Core data types (Snake, GameState, Player, etc.)
  network/              WebSocket connection wrapper and hub
  protocol/             Wire protocol — message types and JSON structs
  room/                 Game room lifecycle and tick loop
e2e/                    Go integration tests (in-process WS server)
doc/                    OpenAPI 3.0 spec
```

### Key design rules

- **No mutations from WebSocket handlers.** All player inputs are queued and consumed during the next game tick.
- **Each room owns its state exclusively.** No shared mutable state across goroutines. Communication through channels and command queues only.
- **Tick-based determinism.** Game logic runs at a fixed tick rate (10 ticks/sec). Movement, collisions, food, and respawns all resolve in deterministic order each tick.
- **Network is separate from game logic.** `network/` handles WebSocket lifecycle only. `game/` contains pure deterministic simulation.

### Collision resolution order

1. Next positions
2. Wall collisions
3. Snake-to-snake collisions
4. Self collisions
5. Food consumption
6. Snake growth
7. Mark newly dead snakes
8. Spawn food if needed

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/rooms` | GET | List active rooms |
| `/rooms` | POST | Create a new room (`{room_id: string}`) |
| `/ws` | GET (WebSocket) | Game connection (JSON subprotocol) |

## WebSocket Protocol

All messages are JSON with the shape `{type: string, payload: object}`.

### Client → Server

| Type | Payload | Description |
|------|---------|-------------|
| `join_room` | `{room_id, player_id, player_name, color}` | Join or create a room |
| `player_input` | `{direction, client_tick?, last_server_tick?, input_seq?}` | Send direction intent plus optional client prediction metadata |
| `leave_room` | `{room_id, player_id}` | Leave the current room |
| `play_again` | `{play_again: bool}` | `true` to respawn after death, `false` to quit |
| `ping` | `{timestamp}` | Latency measurement |

### Server → Client

| Type | Payload | Description |
|------|---------|-------------|
| `game_state` | Full state with snakes, food, tick, dimensions, input ack metadata | Broadcast every tick |
| `player_joined` | `{player_id, player_name, color}` | A player joined the room |
| `player_left` | `{player_id}` | A player left the room |
| `player_died` | `{player_id, reason}` | Sent to the dead player only. Reason: `wall`, `collision`, `self` |
| `game_end` | `{room_id, winner}` | Game over (all players gone) |
| `ack` | `{action, room_id}` | Acknowledges join/leave |
| `error` | `{code, message}` | Error response |
| `pong` | `{timestamp}` | Latency response |

### Message flow

1. Client connects to `/ws`
2. Client sends `join_room` (empty `room_id` for auto-assign)
3. Server sends `ack` + broadcasts `player_joined` + `game_state`
4. Client sends `player_input` each time the player presses a direction
5. Server queues input, processes on next tick, broadcasts authoritative `game_state` with `last_processed_input_tick` and `last_processed_input_seq`
6. If the player dies, server sends `player_died` to that client only
7. Client sends `play_again: true` to respawn or `play_again: false` to leave
8. Client sends `leave_room` to disconnect gracefully

### Client-side prediction contract

The server remains authoritative, but clients may simulate ahead for smoother rendering:

- Clients include `client_tick`, `last_server_tick`, and a monotonically increasing `input_seq` on `player_input`.
- The room tick loop records the latest processed metadata per player.
- `game_state` includes `server_time`, `last_processed_input_tick`, and `last_processed_input_seq`.
- Browsers discard acknowledged local inputs, keep unacknowledged inputs pending, and reconcile to each authoritative snapshot.
- Local prediction must never replace server death, collision, food, or respawn decisions.

## Configuration

Defaults in `internal/config/config.go`:

| Section | Key | Default |
|---------|-----|---------|
| Server | port | 8080 |
| Server | host | 0.0.0.0 |
| Game | tick_rate | 10 ticks/sec |
| Game | board | 40 x 30 |
| Game | max_players_per_room | 4 |
| Game | default_food_count | 5 |
| Game | snake_start_length | 3 |
| Network | max_message_size | 64 KB |
| Network | write_timeout | 10s |
| Network | ping_interval | 30s |

## Dependencies

| Package | Purpose |
|---------|---------|
| `github.com/labstack/echo/v4` | HTTP framework |
| `github.com/coder/websocket` | WebSocket library |
| `github.com/spf13/cobra` | CLI framework |

## API Spec

Full OpenAPI 3.0 spec is at `doc/openapi.yaml`.
