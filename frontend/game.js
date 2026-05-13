/**
 * Game module for state management and simulation
 * Manages game state received from server and input queue
 */

class Game {
    constructor() {
        this.state = {
            roomId: '',
            tick: 0,
            gameOver: false,
            winner: '',
            width: 40,
            height: 30,
            snakes: {},
            foods: []
        };
        this.playerId = '';
        this.playerName = '';
        this.playerColor = '';
        this.inputQueue = [];
        this.lastInputDirection = '';
        this.stateHistory = [];
        this.maxHistoryLength = 10;
        this.onStateUpdate = null;
        this.onGameStart = null;
        this.onGameEnd = null;
    }

    /**
     * Initialize game with player info
     * @param {string} playerId - Player's unique ID
     * @param {string} playerName - Player's display name
     * @param {string} color - Snake color
     */
    init(playerId, playerName, color) {
        this.playerId = playerId;
        this.playerName = playerName;
        this.playerColor = color;
        this.reset();
    }

    /**
     * Reset game state
     */
    reset() {
        this.state = {
            roomId: '',
            tick: 0,
            gameOver: false,
            winner: '',
            width: 40,
            height: 30,
            snakes: {},
            foods: []
        };
        this.inputQueue = [];
        this.lastInputDirection = '';
        this.stateHistory = [];
    }

    /**
     * Update game state from server message
     * @param {object} gameState - Game state from server
     */
    updateState(gameState) {
        // Store previous state for interpolation
        if (Object.keys(this.state.snakes).length > 0) {
            this.stateHistory.push({ ...this.state });
            if (this.stateHistory.length > this.maxHistoryLength) {
                this.stateHistory.shift();
            }
        }

        this.state.roomId = gameState.room_id || this.state.roomId;
        this.state.tick = gameState.tick || 0;
        this.state.gameOver = gameState.game_over || false;
        this.state.winner = gameState.winner || '';
        this.state.width = gameState.width || 40;
        this.state.height = gameState.height || 30;
        this.state.snakes = gameState.snakes || {};
        this.state.foods = gameState.foods || [];

        if (this.onStateUpdate) {
            this.onStateUpdate(this.state);
        }

        if (this.state.gameOver && this.onGameEnd) {
            this.onGameEnd({
                winner: this.state.winner,
                snakes: this.state.snakes
            });
        }
    }

    /**
     * Handle game start
     * @param {object} gameStart - Game start info
     */
    handleGameStart(gameStart) {
        console.log('Game starting:', gameStart);
        if (this.onGameStart) {
            this.onGameStart(gameStart);
        }
    }

    /**
     * Get the current snake for the player
     * @returns {object|null} - Snake data or null
     */
    getPlayerSnake() {
        return this.state.snakes[this.playerId] || null;
    }

    /**
     * Get all snakes as array
     * @returns {array} - Array of snake objects
     */
    getSnakesArray() {
        return Object.values(this.state.snakes);
    }

    /**
     * Get snake by player ID
     * @param {string} playerId
     * @returns {object|null}
     */
    getSnake(playerId) {
        return this.state.snakes[playerId] || null;
    }

    /**
     * Get current direction of player's snake
     * @returns {string} - 'up', 'down', 'left', 'right', or ''
     */
    getCurrentDirection() {
        if (this.lastInputDirection) {
            return this.lastInputDirection;
        }

        const snake = this.getPlayerSnake();
        if (snake && snake.direction) {
            return snake.direction;
        }

        return '';
    }

    /**
     * Check if direction is valid (cannot reverse)
     * @param {string} newDirection - New direction to check
     * @returns {boolean}
     */
    isValidDirection(newDirection) {
        const currentDir = this.getCurrentDirection();

        // No previous direction, any is valid
        if (!currentDir) return true;

        // Cannot reverse
        const opposites = {
            'up': 'down',
            'down': 'up',
            'left': 'right',
            'right': 'left'
        };

        return opposites[newDirection] !== currentDir;
    }

    /**
     * Queue an input for sending to server
     * @param {string} direction - Direction input
     * @returns {boolean} - True if queued successfully
     */
    queueInput(direction) {
        // Validate direction
        if (!['up', 'down', 'left', 'right'].includes(direction)) {
            console.warn('Invalid direction:', direction);
            return false;
        }

        // Check if reversal
        if (!this.isValidDirection(direction)) {
            console.warn('Cannot reverse direction');
            return false;
        }

        this.inputQueue.push(direction);
        this.lastInputDirection = direction;

        return true;
    }

    /**
     * Get queued inputs and clear queue
     * @returns {array} - Array of queued directions
     */
    getQueuedInputs() {
        const inputs = [...this.inputQueue];
        this.inputQueue = [];
        return inputs;
    }

    /**
     * Get interpolated state between two frames
     * @param {number} progress - Interpolation factor (0-1)
     * @returns {object} - Interpolated state
     */
    getInterpolatedState(progress) {
        if (this.stateHistory.length === 0) {
            return this.state;
        }

        const prevState = this.stateHistory[this.stateHistory.length - 1];
        const currentState = this.state;

        // Simple linear interpolation
        return {
            ...currentState,
            tick: prevState.tick + (currentState.tick - prevState.tick) * progress,
            snakes: this.state.snakes // Use latest state for snakes
        };
    }

    /**
     * Get leaderboard sorted by snake length
     * @returns {array} - Array of snakes sorted by length
     */
    getLeaderboard() {
        return this.getSnakesArray()
            .filter(snake => snake.alive)
            .sort((a, b) => b.length - a.length);
    }

    /**
     * Get player ranking
     * @returns {number} - Player's rank (1-based)
     */
    getPlayerRank() {
        const leaderboard = this.getLeaderboard();
        const playerSnake = this.getPlayerSnake();
        if (!playerSnake) return -1;

        return leaderboard.findIndex(s => s.player_id === this.playerId) + 1;
    }

    /**
     * Check if player is alive
     * @returns {boolean}
     */
    isPlayerAlive() {
        const snake = this.getPlayerSnake();
        return snake && snake.alive;
    }

    /**
     * Get game info for display
     * @returns {object}
     */
    getGameInfo() {
        return {
            roomId: this.state.roomId,
            tick: this.state.tick,
            gameOver: this.state.gameOver,
            winner: this.state.winner,
            playerCount: Object.keys(this.state.snakes).length
        };
    }
}

// Export singleton instance
const game = new Game();