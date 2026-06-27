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
        this.canvasWidth = 800;
        this.canvasHeight = 600;
        this.devicePixelRatio = window.devicePixelRatio || 1;
        this.backgroundColor = '#1a1a2e';
        this.gridColor = '#252540';
        this.foodColor = '#f59e0b';
        this.foodGlowColor = 'rgba(245, 158, 11, 0.3)';
        this.gridCanvas = document.createElement('canvas');
        this.gridCtx = this.gridCanvas.getContext('2d');

        // Animation
        this.animationFrame = null;
        this.lastFrameTime = 0;
        this.foodPulse = 0;

        // Latency display
        this.latency = null;

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
        const fallbackWidth = this.gridWidth * 20;
        const availableWidth = container ? container.clientWidth - 20 : this.canvas.clientWidth;
        const containerWidth = availableWidth > 0 ? availableWidth : fallbackWidth;
        const containerHeight = Math.min(containerWidth * 0.75, window.innerHeight * 0.6);
        const dpr = window.devicePixelRatio || 1;

        // Calculate cell size to fit grid
        const cellW = Math.floor(containerWidth / this.gridWidth);
        const cellH = Math.floor(containerHeight / this.gridHeight);
        this.cellSize = Math.max(1, Math.min(cellW, cellH, 20));

        const width = this.gridWidth * this.cellSize;
        const height = this.gridHeight * this.cellSize;

        this.canvasWidth = width;
        this.canvasHeight = height;
        this.devicePixelRatio = dpr;

        // Use a high-DPI backing store while keeping drawing in CSS pixels.
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.rebuildGridCache();
    }

    /**
     * Set grid dimensions
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     */
    setGridSize(width, height) {
        if (this.gridWidth === width && this.gridHeight === height) {
            return;
        }

        this.gridWidth = width;
        this.gridHeight = height;
        this.resize();
    }

    /**
     * Clear the canvas
     */
    clear() {
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    /**
     * Rebuild the static board background cache.
     */
    rebuildGridCache() {
        const dpr = this.devicePixelRatio;
        this.gridCanvas.width = Math.round(this.canvasWidth * dpr);
        this.gridCanvas.height = Math.round(this.canvasHeight * dpr);
        this.gridCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.gridCtx.fillStyle = this.backgroundColor;
        this.gridCtx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.gridCtx.strokeStyle = this.gridColor;
        this.gridCtx.lineWidth = 0.5;

        // Vertical lines
        for (let x = 0; x <= this.gridWidth; x++) {
            this.gridCtx.beginPath();
            this.gridCtx.moveTo(x * this.cellSize + 0.25, 0);
            this.gridCtx.lineTo(x * this.cellSize + 0.25, this.canvasHeight);
            this.gridCtx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y <= this.gridHeight; y++) {
            this.gridCtx.beginPath();
            this.gridCtx.moveTo(0, y * this.cellSize + 0.25);
            this.gridCtx.lineTo(this.canvasWidth, y * this.cellSize + 0.25);
            this.gridCtx.stroke();
        }
    }

    /**
     * Draw cached grid background.
     */
    drawGrid() {
        this.ctx.drawImage(this.gridCanvas, 0, 0, this.canvasWidth, this.canvasHeight);
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
        const body = this.getRenderableBody(snake);
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
            const inset = Math.min(4, cellSize * 0.2);
            const px = segment.x * cellSize + inset;
            const py = segment.y * cellSize + inset;
            const size = Math.max(1, cellSize - inset * 2);

            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.arc(px + size / 2, py + size / 2, Math.max(1, size / 4), 0, Math.PI * 2);
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
        const body = this.getRenderableBody(snake);
        if (body.length < 2) return;

        const head = body[0];
        const cellSize = this.cellSize;

        const px = head.x * cellSize;
        const py = head.y * cellSize;

        const direction = snake.direction || '';

        const eyeSize = Math.max(2, cellSize * 0.15);
        const eyeOffset = cellSize / 4;

        this.ctx.fillStyle = '#fff';

        if (direction === 'left' || direction === 'right') {
            // Horizontal movement
            const eyeX = direction === 'right' ? px + cellSize - eyeOffset : px + eyeOffset;
            this.ctx.beginPath();
            this.ctx.arc(eyeX, py + cellSize / 3, eyeSize, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(eyeX, py + 2 * cellSize / 3, eyeSize, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            // Vertical movement
            const eyeY = direction === 'down' ? py + cellSize - eyeOffset : py + eyeOffset;
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
        const body = this.getRenderableBody(snake);
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
     * Convert backend snake shape (head + body) into render order.
     * @param {object} snake - Snake data
     * @returns {array}
     */
    getRenderableBody(snake) {
        const body = snake.body || [];
        if (!snake.head) return body;
        return [snake.head, ...body];
    }

    /**
     * Render the full game state
     * @param {object} state - Game state
     */
    render(state) {
        // Update grid size if changed
        if (state.width && state.height) {
            this.setGridSize(state.width, state.height);
        }

        // Update food pulse
        this.foodPulse += 0.1;

        // Draw cached board background
        this.drawGrid();

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

        // Draw latency overlay
        this.drawLatency();
    }

    /**
     * Draw latency indicator in top-right corner
     */
    drawLatency() {
        if (this.latency === null) return;

        const text = `${this.latency}ms`;
        this.ctx.font = 'bold 12px monospace';
        const metrics = this.ctx.measureText(text);
        const pad = 6;

        // Color by severity
        let color;
        if (this.latency < 50) color = '#22c55e';
        else if (this.latency < 100) color = '#f59e0b';
        else color = '#ef4444';

        // Background pill
        const x = this.canvasWidth - metrics.width - pad * 3;
        const y = pad;
        const w = metrics.width + pad * 2;
        const h = 20;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, w, h, 4);
        this.ctx.fill();

        // Ping bars icon (3 bars)
        const barX = x + 5;
        const barY = y + 14;
        this.ctx.fillStyle = color;
        [4, 7, 10].forEach((h, i) => {
            this.ctx.fillRect(barX + i * 3, barY - h, 2, h);
        });

        // Text
        this.ctx.fillStyle = color;
        this.ctx.fillText(text, barX + 14, y + 15);
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
            const state = getState(timestamp);
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
