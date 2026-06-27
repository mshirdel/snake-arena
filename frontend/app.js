/**
 * Main application module
 * Handles UI, network connection, input, and game flow
 */

// Application state
const app = {
    currentScreen: 'connect',
    playerId: '',
    playerName: '',
    roomId: '',
    selectedColor: '#22c55e',
    playerHighScore: 0,
    isConnected: false,
    renderer: null,
    wsServerUrl: '',
    apiServerUrl: '',
    highScoresTimer: null
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
    loadUserPreferences();
    setupNetwork();
    setupInput();
    startHighScoresPolling();
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
        saveUserPreferences();
    });

    // Join form
    document.getElementById('join-form').addEventListener('submit', handleJoinSubmit);
    document.getElementById('player-name').addEventListener('change', (e) => {
        app.playerName = e.target.value.trim();
        saveUserPreferences();
    });

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

    app.playerName = playerName;
    if (!app.playerId) {
        app.playerId = 'player_' + Math.random().toString(36).substr(2, 9);
    }
    saveUserPreferences();
    loadPlayerHighScore(app.playerId);

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
    const queuedInput = game.queueInput(direction);
    if (!queuedInput) return;

    const inputMsg = createPlayerInputMessage(queuedInput);
    network.send(inputMsg);
}

/**
 * Handle leave button
 */
function handleLeave() {
    hideDeathOverlay();
    recordCurrentPlayerScore();

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
    recordCurrentPlayerScore();
    network.disconnect();
    game.reset();
    showScreen('connect');
}

/**
 * Handle back to menu button
 */
function handleBackToMenu() {
    recordCurrentPlayerScore();
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
    recordCurrentPlayerScore();

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
    recordCurrentPlayerScore();
    loadPlayerHighScore(app.playerId);
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
        game.stopPrediction();
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
    game.startPrediction();
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
 * Start polling the REST high-score endpoint.
 */
function startHighScoresPolling() {
    loadHighScores();
    app.highScoresTimer = setInterval(loadHighScores, 5000);
}

/**
 * Fetch and render top high scores.
 */
async function loadHighScores() {
    const status = document.getElementById('high-scores-status');

    try {
        const response = await fetch(`${app.apiServerUrl}/high-scores`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) {
            throw new Error(`High scores request failed: ${response.status}`);
        }

        const data = await response.json();
        renderHighScores(data.high_scores || []);
        syncPlayerHighScoreFromList(data.high_scores || []);
        status.textContent = 'Live';
        status.classList.remove('error-state');
    } catch (error) {
        console.error('Failed to load high scores:', error);
        status.textContent = 'Offline';
        status.classList.add('error-state');
    }
}

/**
 * Fetch and display the current player's server-side high score.
 */
async function loadPlayerHighScore(playerId = app.playerId) {
    if (!playerId) {
        renderPlayerHighScore(app.playerHighScore);
        return;
    }

    try {
        const response = await fetch(`${app.apiServerUrl}/high-scores/${encodeURIComponent(playerId)}`, {
            headers: { 'Accept': 'application/json' }
        });

        if (response.status === 404) {
            renderPlayerHighScore(app.playerHighScore);
            return;
        }
        if (!response.ok) {
            throw new Error(`Player high score request failed: ${response.status}`);
        }

        const data = await response.json();
        const score = normalizeScore(data.high_score && data.high_score.score);
        updateLocalHighScore(score);
    } catch (error) {
        console.error('Failed to load player high score:', error);
        renderPlayerHighScore(app.playerHighScore);
    }
}

/**
 * Keep the player score display fresh when the leaderboard already includes them.
 * @param {array} scores
 */
function syncPlayerHighScoreFromList(scores) {
    if (!app.playerId) {
        renderPlayerHighScore(app.playerHighScore);
        return;
    }

    const ownScore = scores.find(score => score.player_id === app.playerId);
    if (ownScore) {
        updateLocalHighScore(normalizeScore(ownScore.score));
    } else {
        renderPlayerHighScore(app.playerHighScore);
    }
}

/**
 * Render the saved player score above the high-scores panel.
 * @param {number} score
 */
function renderPlayerHighScore(score) {
    const panel = document.getElementById('player-high-score');
    const value = document.getElementById('player-high-score-value');
    const scoreValue = normalizeScore(score);

    panel.style.display = scoreValue > 0 ? 'flex' : 'none';
    value.textContent = scoreValue;
}

/**
 * Save the player's best known score locally.
 * @param {number} score
 */
function updateLocalHighScore(score) {
    const scoreValue = normalizeScore(score);
    if (scoreValue <= app.playerHighScore) {
        renderPlayerHighScore(app.playerHighScore);
        return;
    }

    app.playerHighScore = scoreValue;
    setCookie('snake_player_high_score', String(scoreValue));
    renderPlayerHighScore(scoreValue);
}

/**
 * Record the visible player score from the latest game state.
 */
function recordCurrentPlayerScore() {
    const snake = game.getPlayerSnake();
    if (!snake) return;

    updateLocalHighScore(snake.length || 0);
}

/**
 * Render high scores in the right sidebar.
 * @param {array} scores
 */
function renderHighScores(scores) {
    const list = document.getElementById('high-scores-list');
    const empty = document.getElementById('high-scores-empty');
    const topScores = scores.slice(0, 10);

    empty.style.display = topScores.length === 0 ? 'block' : 'none';
    list.innerHTML = topScores.map((score, index) => {
        const playerName = escapeHtml(score.player_name || score.player_id || 'Player');
        const roomId = escapeHtml(score.room_id || '');
        const scoreValue = Number.isFinite(score.score) ? score.score : 0;

        return `
            <li class="high-score-item">
                <span class="high-score-rank">${index + 1}</span>
                <span class="high-score-player">
                    <span class="high-score-name">${playerName}</span>
                    <span class="high-score-room">${roomId}</span>
                </span>
                <span class="high-score-value">${scoreValue}</span>
            </li>
        `;
    }).join('');
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
 * Load persisted name, color, player id, and local high score.
 */
function loadUserPreferences() {
    app.playerId = getCookie('snake_player_id');
    app.playerName = getCookie('snake_player_name');
    app.selectedColor = getCookie('snake_player_color') || app.selectedColor;
    app.playerHighScore = normalizeScore(getCookie('snake_player_high_score'));

    const playerNameInput = document.getElementById('player-name');
    if (app.playerName) {
        playerNameInput.value = app.playerName;
    }

    const colorButton = Array.from(document.querySelectorAll('.color-btn'))
        .find(btn => btn.dataset.color === app.selectedColor);
    if (colorButton) {
        document.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('selected'));
        colorButton.classList.add('selected');
    }

    renderPlayerHighScore(app.playerHighScore);
    loadPlayerHighScore(app.playerId);
}

/**
 * Persist current user preferences in cookies.
 */
function saveUserPreferences() {
    if (app.playerId) setCookie('snake_player_id', app.playerId);
    if (app.playerName) setCookie('snake_player_name', app.playerName);
    if (app.selectedColor) setCookie('snake_player_color', app.selectedColor);
}

/**
 * Generate a random ID
 */
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

/**
 * Normalize a score value from cookies or JSON.
 */
function normalizeScore(value) {
    const score = Number(value);
    return Number.isFinite(score) && score > 0 ? Math.floor(score) : 0;
}

/**
 * Set a cookie for one year.
 */
function setCookie(name, value) {
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

/**
 * Read a cookie value.
 */
function getCookie(name) {
    const encodedName = `${encodeURIComponent(name)}=`;
    const cookies = document.cookie ? document.cookie.split('; ') : [];
    for (const cookie of cookies) {
        if (cookie.startsWith(encodedName)) {
            return decodeURIComponent(cookie.slice(encodedName.length));
        }
    }
    return '';
}

/**
 * Escape text before rendering HTML strings.
 */
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

/**
 * Get server URLs based on current location
 */
function updateServerUrls() {
    const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
    app.wsServerUrl = isLocal ? 'ws://localhost:8080/ws' : 'wss://snake.liara.run/ws';
    app.apiServerUrl = isLocal ? 'http://localhost:8080' : 'https://snake.liara.run';
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

// Update URLs based on current location for development
updateServerUrls();
