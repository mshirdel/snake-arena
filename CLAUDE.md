# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Key Architectural Constraints

**Never mutate game state from websocket handlers.** All player inputs must be queued and consumed during the next game tick. The room tick loop owns all state mutations.

**Each room owns its state exclusively.** No shared mutable state across goroutines. Communication through channels and command queues only.

**Tick-based determinism.** Game logic runs at a fixed tick rate (start at 10 ticks/sec). Movement, collisions, and food consumption all resolve in deterministic order within each tick.

**Separate network from game logic.** /network handles WebSocket lifecycle only — no gameplay code. /game contains pure deterministic simulation with no network dependencies.

## Critical Collision Resolution Order

When modifying collision logic, resolve in this order:
1. Next positions → 2. Wall collisions → 3. Snake-to-snake → 4. Self collisions → 5. Food consumption → 6. Snake growth → 7. Cleanup dead snakes

## Development Priority

Follow the ordered development list in README.md. Current phase: single room tick loop → snake movement → websocket communication.
