/**
 * Main application module
 * Handles UI, network connection, input, and game flow
 */

// Application state
const app = {
    currentScreen: 'connect',
    playerId: '',
    roomId: '',
    selectedColor: '#22c55e',
    isConnected: false,
    renderer: null,
    wsServerUrl: 'ws://localhost:8080/ws'
};

// DOM Elements
const screens = {
    connect: document.getElementById('connect-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen'),
    gameover: document.getElementById('gameover-screen')
};

/**
 * Initialize application
 */
function init() {
    setupUI();
    setupNetwork();
    setupInput();
}

/**
 * Setup UI event handlers
 */
function setupUI() {
    // Color picker
    const colorPicker = document.getElementById('color-picker');
    colorPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.color-btn');
        if (!btn) return;

        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        app.selectedColor = btn.dataset.color;
    });

    // Join form
    document.getElementById('join-form').addEventListener('submit', handleJoinSubmit);

    // Leave button
    document.getElementById('leave-btn').addEventListener('click', handleLeave);

    // Game over buttons
    document.getElementById('play-again-btn').addEventListener('click', handlePlayAgain);
    document.getElementById('back-to-menu-btn').addEventListener('click', handleBackToMenu);

    // Direction buttons
    document.querySelectorAll('.dir-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dir = btn.dataset.dir;
            if (dir) handleDirectionInput(dir);
        });
    });

    // Death overlay buttons
    document.getElementById('play-again-yes').addEventListener('click', () => handlePlayAgainChoice(true));
    document.getElementById('play-again-no').addEventListener('click', () => handlePlayAgainChoice(false));

    // Initialize renderer
    const canvas = document.getElementById('game-canvas');
    app.renderer = new GameRenderer(canvas);
}

/**
 * Setup network handlers
 */
function setupNetwork() {
    network.setConnectionHandlers({
        onOpen: () => {
            console.log('Connected to server');
            app.isConnected = true;
            showConnectError('');
        },
        onClose: (event) => {
            console.log('Disconnected from server', event.code);
            app.isConnected = false;

            if (app.currentScreen === 'game') {
                showGameOverScreen('Connection Lost', null);
            }
        },
        onError: (event) => {
            console.error('Network error:', event);
            showConnectError('Failed to connect to server');
        }
    });

    // Register message handlers
    network.on(MessageType.GameState, handleGameState);
    network.on(MessageType.GameStart, handleGameStart);
    network.on(MessageType.GameEnd, handleGameEnd);
    network.on(MessageType.Error, handleError);
    network.on(MessageType.PlayerJoined, handlePlayerJoined);
    network.on(MessageType.PlayerLeft, handlePlayerLeft);
    network.on(MessageType.PlayerDied, handlePlayerDied);
    network.on(MessageType.Ack, handleAck);
}

/**
 * Setup keyboard and touch input
 */
function setupInput() {
    document.addEventListener('keydown', (e) => {
        if (app.currentScreen !== 'game') return;

        const keyMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
            'w': 'up',
            'W': 'up',
            's': 'down',
            'S': 'down',
            'a': 'left',
            'A': 'left',
            'd': 'right',
            'D': 'right'
        };

        const direction = keyMap[e.key];
        if (direction) {
            e.preventDefault();
            handleDirectionInput(direction);
        }
    });
}

/**
 * Handle join form submission
 */
async function handleJoinSubmit(e) {
    e.preventDefault();

    const playerName = document.getElementById('player-name').value.trim();

    if (!playerName) {
        showConnectError('Please enter your name');
        return;
    }

    // Generate player ID
    app.playerId = 'player_' + Math.random().toString(36).substr(2, 9);

    // Connect to WebSocket
    try {
        await network.connect(app.wsServerUrl);

        // Initialize game
        game.init(app.playerId, playerName, app.selectedColor);

        // Send join message with empty room_id — server auto-assigns
        const joinMsg = createJoinRoomMessage(
            '',
            app.playerId,
            playerName,
            app.selectedColor
        );
        network.send(joinMsg);

        // Show lobby
        showScreen('lobby');
        updateLobbyUI(playerName);

    } catch (error) {
        showConnectError('Failed to connect to server');
    }
}

/**
 * Handle direction input from keyboard or buttons
 */
function handleDirectionInput(direction) {
    if (!game.queueInput(direction)) return;

    const inputMsg = createPlayerInputMessage(direction);
    network.send(inputMsg);
}

/**
 * Handle leave button
 */
function handleLeave() {
    hideDeathOverlay();

    if (app.roomId && app.playerId) {
        // If dead, use play_again: false to properly clean up
        const isDead = document.getElementById('death-overlay').style.display === 'flex';
        if (isDead) {
            const msg = createPlayAgainMessage(false);
            network.send(msg);
        } else {
            const leaveMsg = createLeaveRoomMessage(app.roomId, app.playerId);
            network.send(leaveMsg);
        }
    }

    network.disconnect();
    game.reset();
    app.roomId = '';
    showScreen('connect');
}

/**
 * Handle play again button
 */
async function handlePlayAgain() {
    network.disconnect();
    game.reset();
    showScreen('connect');
}

/**
 * Handle back to menu button
 */
function handleBackToMenu() {
    network.disconnect();
    game.reset();
    app.roomId = '';
    showScreen('connect');
}

// ============ Message Handlers ============

/**
 * Handle game state update
 */
function handleGameState(message) {
    const state = message.payload;
    game.updateState(state);

    // Update latency display
    if (app.renderer) {
        app.renderer.latency = network.getLatency();
    }

    // Start game screen if we haven't already
    if (app.currentScreen === 'lobby' && !game.state.gameOver) {
        startGameScreen();
    }

    // Hide death overlay if player respawned (alive again)
    const mySnake = state.snakes && state.snakes[app.playerId];
    if (mySnake && mySnake.alive) {
        hideDeathOverlay();
    }

    // Update UI
    updateTickCounter(state.tick);
    updateSnakeScores();
}

/**
 * Handle game start
 */
function handleGameStart(message) {
    console.log('Game starting!', message.payload);
    game.handleGameStart(message.payload);

    if (app.currentScreen === 'lobby') {
        startGameScreen();
    }
}

/**
 * Handle game end
 */
function handleGameEnd(message) {
    const payload = message.payload;
    console.log('Game ended!', payload);

    game.state.gameOver = true;
    game.state.winner = payload.winner;

    const winnerName = payload.winner ?
        Object.values(game.state.snakes).find(s => s.player_id === payload.winner)?.player_name || 'Unknown'
        : 'No one';

    showGameOverScreen(`Winner: ${winnerName}`, payload);
}

/**
 * Handle error message
 */
function handleError(message) {
    const error = message.payload;
    console.error('Server error:', error);

    if (error.code === 'ROOM_NOT_FOUND') {
        showConnectError('Room not found');
        showScreen('connect');
    } else if (error.code === 'ROOM_FULL') {
        showConnectError('Room is full');
        showScreen('connect');
    } else {
        showConnectError(error.message || 'Unknown error');
    }
}

/**
 * Handle player joined message
 */
function handlePlayerJoined(message) {
    const player = message.payload;
    console.log('Player joined:', player);
    updateLobbyPlayers();
}

/**
 * Handle player left message
 */
function handlePlayerLeft(message) {
    const player = message.payload;
    console.log('Player left:', player);
    updateLobbyPlayers();
}

/**
 * Handle acknowledgment
 */
function handleAck(message) {
    const payload = message.payload;
    if (payload.action === 'join_room' && payload.room_id) {
        app.roomId = payload.room_id;
        document.getElementById('current-room-id').textContent = app.roomId;
    }
}

/**
 * Handle player died notification
 */
function handlePlayerDied(message) {
    const payload = message.payload;
    console.log('You died!', payload.reason);
    showDeathOverlay(payload.reason);
}

/**
 * Handle play again choice
 * @param {boolean} playAgain - true to respawn, false to quit
 */
function handlePlayAgainChoice(playAgain) {
    const msg = createPlayAgainMessage(playAgain);
    network.send(msg);

    if (!playAgain) {
        hideDeathOverlay();
        network.disconnect();
        game.reset();
        app.roomId = '';
        showScreen('connect');
    }
}

/**
 * Show death overlay with reason
 * @param {string} reason - Death reason ("wall", "collision", "self")
 */
function showDeathOverlay(reason) {
    const reasonText = {
        'wall': 'You hit a wall!',
        'collision': 'You collided with another snake!',
        'self': 'You bit yourself!'
    };

    document.getElementById('death-reason').textContent = reasonText[reason] || 'You died!';
    document.getElementById('death-overlay').style.display = 'flex';
}

/**
 * Hide death overlay
 */
function hideDeathOverlay() {
    document.getElementById('death-overlay').style.display = 'none';
}

// ============ UI Updates ============

/**
 * Show a specific screen
 */
function showScreen(name) {
    app.currentScreen = name;

    Object.entries(screens).forEach(([key, element]) => {
        element.classList.toggle('active', key === name);
    });

    // Start/stop render loop based on screen
    if (name === 'game') {
        app.renderer.startRenderLoop(() => game.state);
    } else {
        app.renderer.stopRenderLoop();
    }
}

/**
 * Show connection error
 */
function showConnectError(message) {
    document.getElementById('connect-error').textContent = message;
}

/**
 * Update lobby UI
 */
function updateLobbyUI(playerName) {
    document.getElementById('current-room-id').textContent = app.roomId;
    document.getElementById('lobby-status-text').textContent = 'Waiting for players...';
    updateLobbyPlayers();
}

/**
 * Update lobby player list
 */
function updateLobbyPlayers() {
    const playerList = document.getElementById('player-list');
    const playerCount = document.getElementById('player-count');

    const snakes = game.getSnakesArray();
    playerCount.textContent = snakes.length;

    playerList.innerHTML = snakes.map(snake => `
        <div class="player-item">
            <div class="player-color" style="background: ${snake.color}"></div>
            <span class="player-name">${snake.player_name || 'Player'}</span>
            <span class="player-status">${snake.alive ? 'Ready' : 'Dead'}</span>
        </div>
    `).join('');

    // Update lobby status text
    const statusText = document.getElementById('lobby-status-text');
    if (snakes.length < 2) {
        statusText.textContent = 'Waiting for more players...';
    } else {
        statusText.textContent = 'Game starting soon...';
    }
}

/**
 * Start game screen
 */
function startGameScreen() {
    document.getElementById('game-room-id').textContent = app.roomId;
    showScreen('game');
    updateSnakeScores();
}

/**
 * Update tick counter
 */
function updateTickCounter(tick) {
    document.getElementById('tick-counter').textContent = tick;
}

/**
 * Update snake scores display
 */
function updateSnakeScores() {
    const container = document.getElementById('snake-scores');
    const snakes = game.getLeaderboard();

    container.innerHTML = snakes.map((snake, index) => `
        <div class="snake-score">
            <span class="snake-rank">#${index + 1}</span>
            <div class="snake-score-color" style="background: ${snake.color}"></div>
            <span class="snake-score-name">${snake.player_name || 'Player'}</span>
            <span class="snake-score-length">${snake.length || 0}</span>
        </div>
    `).join('');
}

/**
 * Show game over screen
 */
function showGameOverScreen(message, data) {
    showScreen('gameover');

    document.getElementById('gameover-message').textContent = message;

    // Show final scores
    const finalScores = document.getElementById('final-scores');
    const snakes = game.getSnakesArray()
        .sort((a, b) => b.length - a.length);

    finalScores.innerHTML = snakes.map((snake, index) => `
        <div class="final-score-item">
            <div style="display: flex; align-items: center;">
                <div class="final-score-color" style="background: ${snake.color}"></div>
                <span class="final-score-name">${snake.player_name || 'Player'}</span>
            </div>
            <span class="final-score-length">#${index + 1} - ${snake.length} length</span>
        </div>
    `).join('');
}

// ============ Utility Functions ============

/**
 * Generate a random ID
 */
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

/**
 * Get server URLs based on current location
 */
function updateServerUrls() {
    const host = window.location.hostname || 'localhost';
    app.wsServerUrl = `ws://${host}:8080/ws`;
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

// Update URLs based on current location for development
updateServerUrls();