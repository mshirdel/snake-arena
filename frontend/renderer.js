/**
 * Renderer module for canvas-based game rendering
 * Handles all drawing operations for the game
 */

class GameRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cellSize = 20;
        this.gridWidth = 40;
        this.gridHeight = 30;
        this.backgroundColor = '#1a1a2e';
        this.gridColor = '#252540';
        this.foodColor = '#f59e0b';
        this.foodGlowColor = 'rgba(245, 158, 11, 0.3)';

        // Animation
        this.animationFrame = null;
        this.lastFrameTime = 0;
        this.foodPulse = 0;

        // Resize handler
        this.resizeHandler = this.resize.bind(this);
        window.addEventListener('resize', this.resizeHandler);
        this.resize();
    }

    /**
     * Resize canvas to fit container
     */
    resize() {
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth - 20;
        const containerHeight = Math.min(containerWidth * 0.75, window.innerHeight * 0.6);

        // Calculate cell size to fit grid
        const cellW = Math.floor(containerWidth / this.gridWidth);
        const cellH = Math.floor(containerHeight / this.gridHeight);
        this.cellSize = Math.min(cellW, cellH, 20);

        const width = this.gridWidth * this.cellSize;
        const height = this.gridHeight * this.cellSize;

        // Set canvas size
        this.canvas.width = width;
        this.canvas.height = height;

        // Rescale for crisp rendering
        this.ctx.scale(1, 1);
    }

    /**
     * Set grid dimensions
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     */
    setGridSize(width, height) {
        this.gridWidth = width;
        this.gridHeight = height;
        this.resize();
    }

    /**
     * Clear the canvas
     */
    clear() {
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Draw grid lines
     */
    drawGrid() {
        this.ctx.strokeStyle = this.gridColor;
        this.ctx.lineWidth = 0.5;

        // Vertical lines
        for (let x = 0; x <= this.gridWidth; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.cellSize, 0);
            this.ctx.lineTo(x * this.cellSize, this.canvas.height);
            this.ctx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y <= this.gridHeight; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * this.cellSize);
            this.ctx.lineTo(this.canvas.width, y * this.cellSize);
            this.ctx.stroke();
        }
    }

    /**
     * Draw a single cell
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @param {string} color - Fill color
     * @param {number} padding - Cell padding (0-1)
     */
    drawCell(x, y, color, padding = 0) {
        const px = x * this.cellSize + padding;
        const py = y * this.cellSize + padding;
        const size = this.cellSize - padding * 2;

        this.ctx.fillStyle = color;
        this.ctx.fillRect(px, py, size, size);
    }

    /**
     * Draw snake body with rounded segments
     * @param {object} snake - Snake data
     */
    drawSnake(snake) {
        const body = snake.body || [];
        const color = snake.color || '#22c55e';
        const cellSize = this.cellSize;

        if (body.length === 0) return;

        // Draw body segments (skip head, draw from tail to head for proper layering)
        for (let i = body.length - 1; i >= 0; i--) {
            const segment = body[i];
            const px = segment.x * cellSize;
            const py = segment.y * cellSize;

            if (i === 0) {
                // Draw head
                this.drawRoundedRect(px, py, cellSize, cellSize, color, 4);

                // Draw eyes based on direction
                this.drawSnakeEyes(snake, i);
            } else {
                // Draw body segment
                this.drawRoundedRect(px, py, cellSize, cellSize, color, 2);
            }
        }

        // Draw darker inner segments for depth
        this.ctx.globalAlpha = 0.3;
        for (let i = 1; i < body.length; i++) {
            const segment = body[i];
            const px = segment.x * cellSize + 4;
            const py = segment.y * cellSize + 4;
            const size = cellSize - 8;

            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.arc(px + size/2, py + size/2, size/4, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;
    }

    /**
     * Draw snake eyes on head
     * @param {object} snake - Snake data
     * @param {number} headIndex - Index of head in body array
     */
    drawSnakeEyes(snake, headIndex) {
        const body = snake.body || [];
        if (body.length < 2) return;

        const head = body[0];
        const neck = body[1];
        const cellSize = this.cellSize;

        const px = head.x * cellSize;
        const py = head.y * cellSize;

        // Calculate direction
        const dx = neck.x - head.x;
        const dy = neck.y - head.y;

        const eyeSize = 3;
        const eyeOffset = cellSize / 4;

        this.ctx.fillStyle = '#fff';

        if (dx !== 0) {
            // Horizontal movement
            const eyeX = dx > 0 ? px + cellSize - eyeOffset : px + eyeOffset;
            this.ctx.beginPath();
            this.ctx.arc(eyeX, py + cellSize / 3, eyeSize, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(eyeX, py + 2 * cellSize / 3, eyeSize, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            // Vertical movement
            const eyeY = dy > 0 ? py + cellSize - eyeOffset : py + eyeOffset;
            this.ctx.beginPath();
            this.ctx.arc(px + cellSize / 3, eyeY, eyeSize, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(px + 2 * cellSize / 3, eyeY, eyeSize, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    /**
     * Draw rounded rectangle
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {string} color - Fill color
     * @param {number} radius - Corner radius
     */
    drawRoundedRect(x, y, width, height, color, radius) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, width, height, radius);
        this.ctx.fill();
    }

    /**
     * Draw food items with pulsing animation
     * @param {array} foods - Array of food positions
     */
    drawFoods(foods) {
        if (!foods || foods.length === 0) return;

        const cellSize = this.cellSize;
        const pulse = Math.sin(this.foodPulse) * 0.15 + 0.85;

        foods.forEach(food => {
            const px = food.position.x * cellSize;
            const py = food.position.y * cellSize;

            // Draw glow
            this.ctx.fillStyle = this.foodGlowColor;
            this.ctx.beginPath();
            this.ctx.arc(
                px + cellSize / 2,
                py + cellSize / 2,
                cellSize / 2 * pulse * 1.2,
                0,
                Math.PI * 2
            );
            this.ctx.fill();

            // Draw food
            this.ctx.fillStyle = this.foodColor;
            this.ctx.beginPath();
            this.ctx.arc(
                px + cellSize / 2,
                py + cellSize / 2,
                cellSize / 3 * pulse,
                0,
                Math.PI * 2
            );
            this.ctx.fill();
        });
    }

    /**
     * Draw dead snake overlay
     * @param {object} snake - Snake data
     */
    drawDeadSnake(snake) {
        const body = snake.body || [];
        const color = snake.color || '#22c55e';
        const cellSize = this.cellSize;

        // Draw faded body
        this.ctx.globalAlpha = 0.3;
        body.forEach(segment => {
            const px = segment.x * cellSize;
            const py = segment.y * cellSize;
            this.ctx.fillStyle = color;
            this.ctx.fillRect(px, py, cellSize, cellSize);
        });
        this.ctx.globalAlpha = 1;
    }

    /**
     * Render the full game state
     * @param {object} state - Game state
     */
    render(state) {
        // Update food pulse
        this.foodPulse += 0.1;

        // Clear and draw grid
        this.clear();
        this.drawGrid();

        // Update grid size if changed
        if (state.width && state.height) {
            this.setGridSize(state.width, state.height);
        }

        // Draw foods
        if (state.foods) {
            this.drawFoods(state.foods);
        }

        // Draw snakes
        const snakes = state.snakes || {};
        Object.values(snakes).forEach(snake => {
            if (snake.alive) {
                this.drawSnake(snake);
            } else {
                this.drawDeadSnake(snake);
            }
        });
    }

    /**
     * Render single frame
     * @param {object} state - Current game state
     */
    renderFrame(state) {
        this.render(state);
    }

    /**
     * Start render loop
     * @param {function} getState - Function returning current state
     */
    startRenderLoop(getState) {
        const loop = (timestamp) => {
            const state = getState();
            if (state) {
                this.renderFrame(state);
            }
            this.animationFrame = requestAnimationFrame(loop);
        };
        this.animationFrame = requestAnimationFrame(loop);
    }

    /**
     * Stop render loop
     */
    stopRenderLoop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.stopRenderLoop();
        window.removeEventListener('resize', this.resizeHandler);
    }
}