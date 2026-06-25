/**
 * Protocol definitions for WebSocket communication
 * Matches the Go backend protocol.go
 */

const MessageType = {
    // Client messages
    JoinRoom: 'join_room',
    PlayerInput: 'player_input',
    LeaveRoom: 'leave_room',
    PlayAgain: 'play_again',

    // Server messages
    GameState: 'game_state',
    GameStart: 'game_start',
    GameEnd: 'game_end',
    Error: 'error',
    PlayerJoined: 'player_joined',
    PlayerLeft: 'player_left',
    PlayerDied: 'player_died',
    Ack: 'ack',

    // Ping/Pong for latency measurement
    Ping: 'ping',
    Pong: 'pong'
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
 * @param {string|object} direction - Direction string or queued input metadata
 * @param {number} clientTick - Client prediction tick for this input
 * @param {number} lastServerTick - Last authoritative server tick seen by the client
 * @param {number} inputSeq - Client-local monotonically increasing input sequence
 * @returns {object} - PlayerInput message
 */
function createPlayerInputMessage(direction, clientTick = 0, lastServerTick = 0, inputSeq = 0) {
    if (direction && typeof direction === 'object') {
        return createMessage(MessageType.PlayerInput, {
            direction: direction.direction,
            client_tick: direction.clientTick || 0,
            last_server_tick: direction.lastServerTick || 0,
            input_seq: direction.inputSeq || 0
        });
    }

    return createMessage(MessageType.PlayerInput, {
        direction: direction,
        client_tick: clientTick,
        last_server_tick: lastServerTick,
        input_seq: inputSeq
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
 * Create a PlayAgain message
 * @param {boolean} playAgain - true to respawn, false to quit
 * @returns {object} - PlayAgain message
 */
function createPlayAgainMessage(playAgain) {
    return createMessage(MessageType.PlayAgain, {
        play_again: playAgain
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
