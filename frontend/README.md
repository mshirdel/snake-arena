# Snake Frontend

Browser-based frontend for the multiplayer Snake game. Pure JavaScript + HTML5 Canvas, no framework dependencies.

## Prerequisites

- [Node.js](https://nodejs.org/) (for dev tooling and the static server)
- The [Snake backend](../) running on `localhost:8080`

## Getting Started

```bash
# Install dependencies
npm install

# Start the frontend on http://localhost:9000
npm start
```

Make sure the backend server is running (`make run` from the project root) before opening the game.

## Building

The frontend is a static HTML/CSS/JavaScript app. Build it into `dist/` with:

```bash
npm run build
```

The build command writes the browser-facing files into `frontend/dist/`, minifies the CSS, bundles and obfuscates the JavaScript, and adds content hashes to the CSS and JavaScript filenames for cache-busting. The generated `index.html` references the versioned assets and can be served by any static file server.

## CLI Simulation

You can test the game from the client side without opening a browser by running the Node.js simulator. It connects players to the backend WebSocket, sends direction inputs, respawns after deaths, and leaves the room when the configured duration ends. Auto-created simulations split players across rooms with no more than 4 players per room.

```bash
# Run 4 simulated players for 2 minutes
npm run simulate -- --players 4 --duration 120

# Run 8 simulated players across 2 rooms
npm run simulate -- --players 8 --duration 120

# Join a specific room for 30 seconds
npm run simulate -- --room-id test-room --players 2 --duration 30

npm run simulate -- --players 2 --duration 30 --url ws://localhost:8080/ws
npm run simulate -- --room-id test-room --players 2 --duration 60 --verbose
```

Options:

| Option | Default | Description |
|--------|---------|-------------|
| `--url` | `ws://localhost:8080/ws` | Backend WebSocket URL |
| `--players` | `2` | Number of concurrent simulated players |
| `--duration` | `120` | Simulation duration in seconds |
| `--room-id` | empty | Existing room to join. Empty means the simulator auto-creates rooms with up to 4 players each |
| `--input-interval` | `150` | Milliseconds between direction inputs per player |
| `--name-prefix` | `cli-bot` | Prefix for simulated player names |
| `--verbose` | off | Log deaths and server errors |

The backend still needs to be running before you start the simulator.

## How It Works

The frontend connects to the backend via WebSocket. The server is authoritative, while the browser runs lightweight client-side prediction between snapshots so local movement feels responsive.

### Screens

1. **Connect** -- Enter your name and pick a snake color
2. **Lobby** -- Wait for other players to join (up to 4 per room)
3. **Game** -- Play! Use arrow keys or WASD to move
4. **Game Over** -- View scores and play again

### Controls

- Arrow keys or WASD to change direction
- On-screen direction buttons for mobile

### Prediction Model

- Direction input is applied locally immediately and sent to the server with `client_tick`, `last_server_tick`, and `input_seq`.
- The server keeps simulating the authoritative state and broadcasts `last_processed_input_tick` / `last_processed_input_seq`.
- The browser drops acknowledged pending inputs and reconciles to each server snapshot.
- Collision, food, death, and respawn outcomes are still confirmed by the server.

## Project Structure

```
frontend/
  index.html          Main HTML (all screens)
  app.js              App entry point, screen management
  game.js             Game state and input handling
  network.js          WebSocket connection management
  protocol.js         Message type definitions (shared with backend)
  renderer.js         Canvas rendering
  simulate-cli.js     Node.js CLI client simulator
  styles.css          All styles
  dist/               Static build output from npm run build
  e2e/                Playwright E2E tests
  package.json
```

## Running Tests

E2E tests use [Playwright](https://playwright.dev/) and require the backend to be running.

```bash
# Run tests headless
npm run test:e2e

# Run tests with browser UI
npm run test:e2e:ui

# Run tests in headed mode (visible browser)
npm run test:e2e:headed

# Debug tests step-by-step
npm run test:e2e:debug
```

Or use the Makefile from the project root:

```bash
make test-frontend        # headless
make test-frontend-ui     # with Playwright UI
make test-frontend-headed # visible browser
```
