# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Hard rules (read first, every session)

Use LSP for symbol lookup, not grep/find. If you reach for `grep / rg / find / Bash` to locate a symbol, type, function, class, method, or reference — stop and use LSP:

- `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `incomingCalls`, `outgoingCalls`
- Fall back to grep only if LSP errors, or for plain string/comment search.
- Never use `workspaceSymbol` — dumps ~43K symbols.

Defaulting to grep is a bug, not a preference.

## Project Overview

Realtime multiplayer Snake game backend written in Go. The server is authoritative — clients only send input intents, never coordinates. All game simulation runs server-side on a fixed tick rate.

## Build & Run Commands

```bash
make build   # Build binary to bin/snake
make run     # Build and run: ./bin/snake serve
make clean   # Remove bin/ directory
```

Run a single test:
```bash
go test ./internal/game/...    # test specific package
go test ./...                   # all tests
```

## HTTP & WebSocket Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/rooms` | GET | List active rooms |
| `/rooms` | POST | Create new room (`{room_id: string}`) |
| `/ws` | GET (WebSocket) | Game connection (JSON subprotocol) |

## WebSocket Message Flow

1. Client connects to `/ws`
2. Client sends `JoinRoomRequest` with `room_id`, `player_id`, `player_name`, `color`
3. Server broadcasts `PlayerJoined` to room, sends `GameState` to all clients
4. Client sends `PlayerInput` messages (direction: up/down/left/right)
5. Server queues inputs, processes on next tick, broadcasts `GameState`
6. If the player dies, server sends `player_died` to that client only (reason: wall/collision/self)
7. Client sends `play_again: true` to respawn at a new position, or `play_again: false` to leave
8. Client sends `LeaveRoom` to disconnect gracefully

## Configuration

Defaults in `internal/config/config.go`:
- **Server**: port 8080, host localhost
- **Game**: tick_rate 10, board 40x30, max 4 players/room, 5 food, snake length 3
- **Network**: max_message 64KB, write_timeout 10s, ping_interval 30s

## Key Architectural Constraints

**Never mutate game state from websocket handlers.** All player inputs must be queued and consumed during the next game tick. The room tick loop owns all state mutations.

**Each room owns its state exclusively.** No shared mutable state across goroutines. Communication through channels and command queues only.

**Tick-based determinism.** Game logic runs at a fixed tick rate (start at 10 ticks/sec). Movement, collisions, and food consumption all resolve in deterministic order within each tick.

**Separate network from game logic.** /network handles WebSocket lifecycle only — no gameplay code. /game contains pure deterministic simulation with no network dependencies.

## Critical Collision Resolution Order

When modifying collision logic, resolve in this order:
1. Next positions → 2. Wall collisions → 3. Snake-to-snake → 4. Self collisions → 5. Food consumption → 6. Snake growth → 7. Mark newly dead snakes (don't delete — players respawn via `play_again`)

## Development Priority

Follow the ordered development list in README.md. Core MVP complete (rooms, tick loop, snake movement, websocket, collision, food, matchmaking). Next: spectating → horizontal scaling.
