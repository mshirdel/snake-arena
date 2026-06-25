# Multiplayer Snake Game Backend Architecture

## Project

Realtime multiplayer Snake game backend written in Go.

The backend is an authoritative game server responsible for:

- websocket communication
- game loop execution
- collision handling
- room management
- matchmaking
- state synchronization
- anti-cheat validation

Frontend is implemented separately using pure JavaScript + HTML5 Canvas.

---

# Core Architecture Principles

## 1. Server Authoritative

The server is the single source of truth.

Clients are NOT allowed to:

- move themselves directly
- update coordinates
- resolve collisions
- spawn food
- modify scores

Clients only send:

- input events
- room join requests
- ping/pong

All game simulation happens on the server.

---

## 2. Tick-Based Simulation

Game logic must run on a fixed tick rate.

Recommended:

- 10 ticks/sec initially

Never update game state directly from websocket handlers.

All player inputs must be queued and consumed during the next game tick.

---

## 3. Deterministic Game Loop

Each room owns exactly one game loop.

A room loop is responsible for:

1. processing queued inputs
2. updating snake positions
3. resolving collisions
4. handling food consumption
5. spawning food
6. broadcasting snapshots

Avoid timing inconsistencies.

---

# Project Structure

````text
/cmd/server
    main.go

/internal
    /config
    /game
    /room
    /engine
    /network
    /matchmaker
    /protocol
    /storage
    /models
    /utils

/pkg

---

# Package Responsibilities

## /network

Responsible for:

* websocket upgrade
* connection lifecycle
* client write/read pumps
* serialization
* broadcast delivery

Must NOT contain game logic.

---

## /game

Pure gameplay logic:

* snake movement
* collision detection
* food spawning
* score handling

Should be deterministic and testable.

Must avoid network dependencies.

---

## /room

Responsible for:

* room lifecycle
* room state
* tick loop
* player membership

Each room owns:

* game state
* player list
* tick scheduler
* input queue

---

## /engine

Contains:

* update orchestration
* simulation sequencing
* tick coordination

Acts as runtime execution layer.

---

## /matchmaker

Responsible for:

* assigning players to rooms
* room creation
* room balancing

No gameplay logic here.

---

## /protocol

Contains:

* websocket message definitions
* DTOs
* event types
* serialization contracts

All messages should be versionable.

---

# Coding Standards

## General

* Keep packages small and cohesive
* Prefer composition over inheritance-like abstractions
* Avoid global mutable state
* Avoid circular dependencies
* Avoid framework-heavy architecture

---

## Concurrency

Concurrency must be explicit and controlled.

Allowed:

* goroutine per websocket client
* goroutine per room loop

Avoid:

* uncontrolled goroutine spawning
* shared mutable maps without synchronization

Prefer:

* channels
* message passing
* room ownership model

---

## State Ownership

Each room exclusively owns its game state.

Other goroutines must NOT mutate room state directly.

Interaction with rooms should happen through:

* channels
* command queues
* room methods

---

# Networking Rules

## Transport

Use WebSocket for realtime communication.

Communication format:

* JSON initially
* binary protocol later if needed

---

## Client Input

Clients send only intent.

Example:

```json
{
  "type": "input",
  "direction": "left"
}
````

Never trust client coordinates.

---

## Snapshot Broadcast

Server periodically broadcasts snapshots.

Example:

```json
{
  "type": "state",
  "tick": 102,
  "players": [],
  "foods": []
}
```

Snapshots should be immutable once emitted.

---

# Game Rules

## Snake Movement

Rules:

- movement occurs only on tick
- snake cannot reverse direction instantly
- movement speed is uniform

---

## Collision Resolution Order

Always resolve collisions in deterministic order:

1. next positions
2. wall collisions
3. snake-to-snake collisions
4. self collisions
5. food consumption
6. snake growth
7. cleanup dead snakes

---

# Error Handling

Rules:

- never panic on invalid client input
- invalid packets should disconnect client gracefully
- recover from room crashes if possible
- log all fatal simulation errors

---

# Logging

Structured logging preferred.

Include:

- room_id
- player_id
- tick
- event_type

Avoid excessive debug logging in hot paths.

---

# Performance Guidelines

Avoid:

- allocations inside tick loop
- excessive JSON marshaling
- large mutex contention

Prefer:

- object reuse
- preallocated slices
- room-local state

---

# Testing Strategy

Must have tests for:

- movement logic
- collision detection
- food spawning
- direction validation
- room lifecycle

Gameplay logic should be testable without websocket layer.

---

# Security Rules

Never trust client data.

Validate:

- direction changes
- packet sizes
- message types
- reconnect attempts

Protect against:

- packet flooding
- malformed JSON
- room exhaustion

---

# Future Scalability

Initial deployment:

- single process
- in-memory rooms

Future scaling:

- Redis pub/sub
- room sharding
- sticky sessions
- horizontal scaling

Design code to allow future distributed architecture.

---

# Recommended Libraries

## WebSocket

Primary:

- gorilla/websocket

Alternative:

- coder/websocket

---

# Deployment

Initial deployment target:

- Docker container
- single binary
- behind NGINX reverse proxy

---

# Non-Goals (Initial MVP)

Do NOT implement initially:

- rollback netcode
- ECS architecture
- microservices
- distributed simulation
- Kubernetes orchestration
- prediction/interpolation
- persistence layer
- authentication system

Focus on:

- correctness
- deterministic simulation
- stable multiplayer sync

---

# Development Order

1. Single room
2. Tick loop
3. Snake movement
4. WebSocket communication
5. Multiplayer sync
6. Collision handling
7. Food system
8. Matchmaking
9. Spectating
10. Horizontal scaling

---

# Architectural Rules

## DO

- keep simulation deterministic
- isolate room state
- queue inputs
- separate network and game logic
- keep update loop predictable

## DO NOT

- mutate game state from websocket handlers
- trust client coordinates
- block inside room loop
- share room state across goroutines
- over-engineer early MVP
