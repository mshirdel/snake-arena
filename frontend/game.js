/**
 * Game module for state management and simulation
 * Manages game state received from server and input queue
 */

class Game {
    constructor() {
        this.state = {
            roomId: '',
            tick: 0,
            serverTime: 0,
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
        this.pendingInputs = [];
        this.inputSeq = 0;
        this.lastInputDirection = '';
        this.lastAuthoritativeState = null;
        this.stateHistory = [];
        this.maxHistoryLength = 10;
        this.tickRate = 10;
        this.predictionTimer = null;
        this.predictionIntervalMs = 1000 / this.tickRate;
        this.lastServerTick = 0;
        this.lastProcessedInputTick = {};
        this.lastProcessedInputSeq = {};
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
            serverTime: 0,
            gameOver: false,
            winner: '',
            width: 40,
            height: 30,
            snakes: {},
            foods: []
        };
        this.inputQueue = [];
        this.pendingInputs = [];
        this.inputSeq = 0;
        this.lastInputDirection = '';
        this.lastAuthoritativeState = null;
        this.stateHistory = [];
        this.lastServerTick = 0;
        this.lastProcessedInputTick = {};
        this.lastProcessedInputSeq = {};
        this.stopPrediction();
    }

    /**
     * Update game state from server message
     * @param {object} gameState - Game state from server
     */
    updateState(gameState) {
        // Store previous state for interpolation
        if (Object.keys(this.state.snakes).length > 0) {
            this.stateHistory.push(this.cloneState(this.state));
            if (this.stateHistory.length > this.maxHistoryLength) {
                this.stateHistory.shift();
            }
        }

        this.state = {
            roomId: gameState.room_id || this.state.roomId,
            tick: gameState.tick || 0,
            serverTime: gameState.server_time || gameState.timestamp || 0,
            gameOver: gameState.game_over || false,
            winner: gameState.winner || '',
            width: gameState.width || 40,
            height: gameState.height || 30,
            snakes: gameState.snakes || {},
            foods: gameState.foods || []
        };
        this.lastServerTick = this.state.tick;
        this.lastProcessedInputTick = gameState.last_processed_input_tick || {};
        this.lastProcessedInputSeq = gameState.last_processed_input_seq || {};
        this.lastAuthoritativeState = this.cloneState(this.state);
        this.state = this.reconcilePendingInputs(this.lastAuthoritativeState);

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

        const queuedInput = {
            direction,
            clientTick: Math.max(this.state.tick + 1, this.lastServerTick + this.pendingInputs.length + 1),
            lastServerTick: this.lastServerTick,
            inputSeq: ++this.inputSeq,
            sentAt: Date.now()
        };

        this.inputQueue.push(direction);
        this.pendingInputs.push(queuedInput);
        this.lastInputDirection = direction;

        this.applyLocalDirection(direction);

        return queuedInput;
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
     * Start local simulation between authoritative server snapshots.
     */
    startPrediction() {
        this.stopPrediction();
        this.predictionTimer = setInterval(() => {
            if (!this.playerId || this.state.gameOver || Object.keys(this.state.snakes).length === 0) {
                return;
            }
            this.state = this.simulateTick(this.state);
            if (this.onStateUpdate) {
                this.onStateUpdate(this.state);
            }
        }, this.predictionIntervalMs);
    }

    /**
     * Stop local simulation.
     */
    stopPrediction() {
        if (this.predictionTimer) {
            clearInterval(this.predictionTimer);
            this.predictionTimer = null;
        }
    }

    /**
     * Rebuild the predicted state from an authoritative snapshot and unacknowledged inputs.
     * @param {object} authoritativeState
     * @returns {object}
     */
    reconcilePendingInputs(authoritativeState = this.state) {
        const ackedSeq = this.lastProcessedInputSeq[this.playerId] || 0;
        const ackedTick = this.lastProcessedInputTick[this.playerId] || 0;

        this.pendingInputs = this.pendingInputs.filter(input => {
            if (ackedSeq > 0) {
                return input.inputSeq > ackedSeq;
            }
            return input.clientTick > ackedTick;
        });

        let reconciledState = this.cloneState(authoritativeState);
        const orderedInputs = [...this.pendingInputs].sort((a, b) => a.inputSeq - b.inputSeq);

        for (const input of orderedInputs) {
            this.applyLocalDirectionToState(reconciledState, input.direction);
            reconciledState = this.simulateTick(reconciledState, input.direction);
        }

        const latestPending = orderedInputs[orderedInputs.length - 1];
        const playerSnake = reconciledState.snakes[this.playerId];
        this.lastInputDirection = latestPending ? latestPending.direction : (playerSnake && playerSnake.direction) || '';

        return reconciledState;
    }

    /**
     * Apply a direction change locally without waiting for the next server tick.
     * @param {string} direction
     */
    applyLocalDirection(direction) {
        this.applyLocalDirectionToState(this.state, direction);
    }

    /**
     * Apply a direction change to a supplied state.
     * @param {object} state
     * @param {string} direction
     */
    applyLocalDirectionToState(state, direction) {
        const snake = state.snakes[this.playerId];
        if (snake && snake.alive && this.isDirectionAllowed(direction, snake.direction)) {
            snake.direction = direction;
        }
    }

    /**
     * Advance a cloned state by one deterministic client-side tick.
     * @param {object} sourceState
     * @returns {object}
     */
    simulateTick(sourceState, localDirection = this.lastInputDirection) {
        const nextState = this.cloneState(sourceState);
        nextState.tick += 1;

        Object.values(nextState.snakes).forEach(snake => {
            if (!snake || !snake.alive) return;

            const desiredDirection = snake.player_id === this.playerId && localDirection
                ? localDirection
                : snake.direction;
            const direction = this.isDirectionAllowed(desiredDirection, snake.direction)
                ? desiredDirection
                : snake.direction;

            this.moveSnake(snake, direction, nextState.foods);
        });

        return nextState;
    }

    /**
     * Move a snake one grid cell, using the same head/body shape as the backend protocol.
     * @param {object} snake
     * @param {string} direction
     * @param {array} foods
     */
    moveSnake(snake, direction, foods) {
        const head = snake.head || (snake.body && snake.body[0]);
        if (!head) return;

        const nextHead = this.getNextPosition(head, direction);
        const body = Array.isArray(snake.body) ? snake.body : [];
        const nextBody = [head, ...body];
        const foodIndex = foods.findIndex(food => {
            const pos = food.position;
            return pos && pos.x === nextHead.x && pos.y === nextHead.y;
        });

        if (foodIndex >= 0) {
            foods.splice(foodIndex, 1);
        } else {
            nextBody.pop();
        }

        snake.head = nextHead;
        snake.body = nextBody;
        snake.direction = direction;
        snake.length = nextBody.length + 1;
    }

    /**
     * Calculate the next grid position for a direction.
     * @param {object} position
     * @param {string} direction
     * @returns {object}
     */
    getNextPosition(position, direction) {
        switch (direction) {
            case 'up':
                return { x: position.x, y: position.y - 1 };
            case 'down':
                return { x: position.x, y: position.y + 1 };
            case 'left':
                return { x: position.x - 1, y: position.y };
            case 'right':
                return { x: position.x + 1, y: position.y };
            default:
                return { x: position.x, y: position.y };
        }
    }

    /**
     * Check direction reversal against a supplied current direction.
     * @param {string} newDirection
     * @param {string} currentDirection
     * @returns {boolean}
     */
    isDirectionAllowed(newDirection, currentDirection) {
        if (!newDirection || !currentDirection) return true;
        const opposites = {
            'up': 'down',
            'down': 'up',
            'left': 'right',
            'right': 'left'
        };
        return opposites[newDirection] !== currentDirection;
    }

    /**
     * Clone game state for client-side prediction.
     * @param {object} state
     * @returns {object}
     */
    cloneState(state) {
        return {
            ...state,
            snakes: JSON.parse(JSON.stringify(state.snakes || {})),
            foods: JSON.parse(JSON.stringify(state.foods || []))
        };
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
            .sort((a, b) => this.getSnakeLength(b) - this.getSnakeLength(a));
    }

    /**
     * Get snake length from protocol field with a body fallback for tests/older data.
     * @param {object} snake
     * @returns {number}
     */
    getSnakeLength(snake) {
        if (typeof snake.length === 'number') {
            return snake.length;
        }
        return Array.isArray(snake.body) ? snake.body.length : 0;
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
