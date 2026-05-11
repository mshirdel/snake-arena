/**
 * Protocol definitions for WebSocket communication
 * Matches the Go backend protocol.go
 */

const MessageType = {
    // Client messages
    JoinRoom: 'join_room',
    PlayerInput: 'player_input',
    LeaveRoom: 'leave_room',

    // Server messages
    GameState: 'game_state',
    GameStart: 'game_start',
    GameEnd: 'game_end',
    Error: 'error',
    PlayerJoined: 'player_joined',
    PlayerLeft: 'player_left',
    Ack: 'ack'
};

/**
 * Create a Message wrapper
 * @param {string} type - Message type
 * @param {object} payload - Message payload
 * @returns {object} - Wrapped message
 */
function createMessage(type, payload) {
    return {
        type,
        payload
    };
}

/**
 * Create a JoinRoom request
 * @param {string} roomId - Room ID to join
 * @param {string} playerId - Player's unique ID
 * @param {string} playerName - Player's display name
 * @param {string} color - Snake color (hex)
 * @returns {object} - JoinRoom message
 */
function createJoinRoomMessage(roomId, playerId, playerName, color) {
    return createMessage(MessageType.JoinRoom, {
        room_id: roomId,
        player_id: playerId,
        player_name: playerName,
        color: color
    });
}

/**
 * Create a PlayerInput message
 * @param {string} direction - 'up', 'down', 'left', 'right'
 * @returns {object} - PlayerInput message
 */
function createPlayerInputMessage(direction) {
    return createMessage(MessageType.PlayerInput, {
        direction: direction
    });
}

/**
 * Create a LeaveRoom message
 * @param {string} roomId - Room ID to leave
 * @param {string} playerId - Player's ID
 * @returns {object} - LeaveRoom message
 */
function createLeaveRoomMessage(roomId, playerId) {
    return createMessage(MessageType.LeaveRoom, {
        room_id: roomId,
        player_id: playerId
    });
}

/**
 * Parse a server message
 * @param {string} data - Raw JSON string
 * @returns {object|null} - Parsed message or null if invalid
 */
function parseMessage(data) {
    try {
        return JSON.parse(data);
    } catch (e) {
        console.error('Failed to parse message:', e);
        return null;
    }
}

/**
 * Get message type from raw data
 * @param {string} data - Raw JSON string
 * @returns {string|null} - Message type or null
 */
function getMessageType(data) {
    try {
        const msg = JSON.parse(data);
        return msg.type || null;
    } catch (e) {
        return null;
    }
}

/**
 * Extract game state from a message
 * @param {object} message - Parsed message
 * @returns {object|null} - Game state or null
 */
function extractGameState(message) {
    if (message.type === MessageType.GameState) {
        return message.payload;
    }
    return null;
}

/**
 * Extract error from a message
 * @param {object} message - Parsed message
 * @returns {object|null} - Error object or null
 */
function extractError(message) {
    if (message.type === MessageType.Error) {
        return message.payload;
    }
    return null;
}

/**
 * Extract player info from various messages
 * @param {object} message - Parsed message
 * @returns {array|null} - Array of player info or null
 */
function extractPlayers(message) {
    if (message.type === MessageType.GameStart) {
        return message.payload.players || [];
    }
    if (message.type === MessageType.PlayerJoined) {
        return [message.payload];
    }
    return null;
}