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
  styles.css          All styles
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
