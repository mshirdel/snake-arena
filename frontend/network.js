/**
 * Network module for WebSocket communication
 * Handles connection lifecycle, message sending/receiving, and reconnection
 */

class NetworkManager {
    constructor() {
        this.ws = null;
        this.url = '';
        this.connected = false;
        this.messageHandlers = {};
        this.connectionHandlers = {
            onOpen: null,
            onClose: null,
            onError: null
        };
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.shouldReconnect = false;

        // Latency measurement
        this.rttSamples = [];
        this.maxRttSamples = 5;
        this.pingInterval = null;
        this.pingIntervalMs = 2000;
    }

    /**
     * Connect to WebSocket server
     * @param {string} url - WebSocket server URL
     * @returns {Promise} - Resolves when connected, rejects on error
     */
    connect(url) {
        return new Promise((resolve, reject) => {
            this.url = url;
            this.shouldReconnect = true;

            try {
                this.ws = new WebSocket(url);

                this.ws.onopen = (event) => {
                    console.log('WebSocket connected');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.startPing();
                    if (this.connectionHandlers.onOpen) {
                        this.connectionHandlers.onOpen(event);
                    }
                    resolve();
                };

                this.ws.onclose = (event) => {
                    console.log('WebSocket closed', event.code, event.reason);
                    this.connected = false;
                    if (this.connectionHandlers.onClose) {
                        this.connectionHandlers.onClose(event);
                    }
                    this.attemptReconnect();
                };

                this.ws.onerror = (event) => {
                    console.error('WebSocket error:', event);
                    if (this.connectionHandlers.onError) {
                        this.connectionHandlers.onError(event);
                    }
                    reject(event);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

            } catch (error) {
                console.error('Failed to create WebSocket:', error);
                reject(error);
            }
        });
    }

    /**
     * Handle incoming message
     * @param {string} data - Raw message data
     */
    handleMessage(data) {
        const message = parseMessage(data);
        if (!message) return;

        const handler = this.messageHandlers[message.type];
        if (handler) {
            handler(message);
        }
    }

    /**
     * Send a message to the server
     * @param {object} message - Message to send
     * @returns {boolean} - True if sent successfully
     */
    send(message) {
        if (!this.connected || !this.ws) {
            console.warn('Cannot send message: not connected');
            return false;
        }

        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('Failed to send message:', error);
            return false;
        }
    }

    /**
     * Register a handler for a specific message type
     * @param {string} type - Message type
     * @param {function} handler - Handler function
     */
    on(type, handler) {
        this.messageHandlers[type] = handler;
    }

    /**
     * Remove a handler for a specific message type
     * @param {string} type - Message type
     */
    off(type) {
        delete this.messageHandlers[type];
    }

    /**
     * Set connection lifecycle handlers
     * @param {object} handlers - { onOpen, onClose, onError }
     */
    setConnectionHandlers(handlers) {
        this.connectionHandlers = { ...this.connectionHandlers, ...handlers };
    }

    /**
     * Attempt to reconnect after disconnection
     */
    attemptReconnect() {
        if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Reconnection not attempted or max attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            if (this.shouldReconnect && !this.connected) {
                this.connect(this.url).catch((error) => {
                    console.error('Reconnection failed:', error);
                });
            }
        }, delay);
    }

    /**
     * Disconnect from the server
     */
    disconnect() {
        this.shouldReconnect = false;
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    /**
     * Check if currently connected
     * @returns {boolean}
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Get current WebSocket ready state
     * @returns {number} - WebSocket ready state (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)
     */
    getReadyState() {
        return this.ws ? this.ws.readyState : WebSocket.CLOSED;
    }

    /**
     * Start periodic ping to measure latency
     */
    startPing() {
        this.stopPing();
        this.rttSamples = [];

        // Register pong handler
        this.on(MessageType.Pong, (message) => {
            const now = Date.now();
            const rtt = now - message.payload.timestamp;
            this.rttSamples.push(rtt);
            if (this.rttSamples.length > this.maxRttSamples) {
                this.rttSamples.shift();
            }
        });

        // Send first ping immediately
        this._sendPing();

        this.pingInterval = setInterval(() => this._sendPing(), this.pingIntervalMs);
    }

    /**
     * Stop ping loop
     */
    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.off(MessageType.Pong);
        this.rttSamples = [];
    }

    /**
     * Send a ping message
     */
    _sendPing() {
        if (!this.connected) return;
        this.send(createMessage(MessageType.Ping, { timestamp: Date.now() }));
    }

    /**
     * Get smoothed round-trip latency in milliseconds
     * @returns {number|null} - Average RTT or null if no samples
     */
    getLatency() {
        if (this.rttSamples.length === 0) return null;
        const sum = this.rttSamples.reduce((a, b) => a + b, 0);
        return Math.round(sum / this.rttSamples.length);
    }
}

// Export singleton instance
const network = new NetworkManager();