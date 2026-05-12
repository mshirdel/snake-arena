/**
 * Frontend WebSocket Tests
 * Tests for protocol.js, network.js, and game.js modules
 * Can be run with: node test.js (requires ws package) or opened in browser
 */

// Test utilities
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    tests.push({ name, fn });
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message} Expected ${expected}, got ${actual}`);
    }
}

function assertTrue(value, message = '') {
    if (!value) {
        throw new Error(`${message} Expected truthy value, got ${value}`);
    }
}

function assertObjectEqual(actual, expected, message = '') {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

async function runTests() {
    console.log('🧪 Running Frontend WebSocket Tests\n');

    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (error) {
            console.log(`❌ ${name}`);
            console.log(`   Error: ${error.message}`);
            failed++;
        }
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(40));

    return failed === 0;
}

// ============ Protocol Tests ============

test('protocol.js - MessageType constants exist', () => {
    assertTrue(typeof MessageType !== 'undefined', 'MessageType not defined');
    assertEqual(MessageType.JoinRoom, 'join_room');
    assertEqual(MessageType.PlayerInput, 'player_input');
    assertEqual(MessageType.LeaveRoom, 'leave_room');
    assertEqual(MessageType.GameState, 'game_state');
    assertEqual(MessageType.GameStart, 'game_start');
    assertEqual(MessageType.GameEnd, 'game_end');
    assertEqual(MessageType.Error, 'error');
    assertEqual(MessageType.PlayerJoined, 'player_joined');
    assertEqual(MessageType.PlayerLeft, 'player_left');
    assertEqual(MessageType.Ack, 'ack');
});

test('protocol.js - createMessage creates correct structure', () => {
    const msg = createMessage('test_type', { data: 'value' });
    assertTrue(msg.type === 'test_type');
    assertTrue(msg.payload && msg.payload.data === 'value');
});

test('protocol.js - createJoinRoomMessage creates valid join message', () => {
    const msg = createJoinRoomMessage('room1', 'player1', 'Alice', '#22c55e');
    assertEqual(msg.type, 'join_room');
    assertEqual(msg.payload.room_id, 'room1');
    assertEqual(msg.payload.player_id, 'player1');
    assertEqual(msg.payload.player_name, 'Alice');
    assertEqual(msg.payload.color, '#22c55e');
});

test('protocol.js - createPlayerInputMessage creates valid input message', () => {
    const msg = createPlayerInputMessage('up');
    assertEqual(msg.type, 'player_input');
    assertEqual(msg.payload.direction, 'up');
});

test('protocol.js - createLeaveRoomMessage creates valid leave message', () => {
    const msg = createLeaveRoomMessage('room1', 'player1');
    assertEqual(msg.type, 'leave_room');
    assertEqual(msg.payload.room_id, 'room1');
    assertEqual(msg.payload.player_id, 'player1');
});

test('protocol.js - parseMessage parses valid JSON', () => {
    const msg = parseMessage('{"type":"test","payload":{"key":"value"}}');
    assertTrue(msg !== null);
    assertEqual(msg.type, 'test');
    assertEqual(msg.payload.key, 'value');
});

test('protocol.js - parseMessage returns null for invalid JSON', () => {
    const msg = parseMessage('not valid json');
    assertTrue(msg === null);
});

test('protocol.js - getMessageType extracts type correctly', () => {
    assertEqual(getMessageType('{"type":"join_room"}'), 'join_room');
    assertEqual(getMessageType('{"type":"game_state"}'), 'game_state');
});

test('protocol.js - extractGameState extracts game state correctly', () => {
    const msg = { type: 'game_state', payload: { tick: 100, snakes: {} } };
    const state = extractGameState(msg);
    assertTrue(state !== null);
    assertEqual(state.tick, 100);
});

test('protocol.js - extractGameState returns null for non-game-state message', () => {
    const msg = { type: 'join_room', payload: {} };
    const state = extractGameState(msg);
    assertTrue(state === null);
});

test('protocol.js - extractError extracts error correctly', () => {
    const msg = { type: 'error', payload: { code: 'ROOM_FULL', message: 'Room is full' } };
    const error = extractError(msg);
    assertTrue(error !== null);
    assertEqual(error.code, 'ROOM_FULL');
});

test('protocol.js - extractError returns null for non-error message', () => {
    const msg = { type: 'game_state', payload: {} };
    const error = extractError(msg);
    assertTrue(error === null);
});

test('protocol.js - extractPlayers extracts players from GameStart', () => {
    const msg = {
        type: 'game_start',
        payload: {
            players: [
                { player_id: 'p1', player_name: 'Alice' },
                { player_id: 'p2', player_name: 'Bob' }
            ]
        }
    };
    const players = extractPlayers(msg);
    assertTrue(Array.isArray(players));
    assertEqual(players.length, 2);
});

// ============ Game State Tests ============

test('game.js - Game initializes with correct default state', () => {
    game.reset();
    assertEqual(game.state.tick, 0);
    assertEqual(game.state.gameOver, false);
    assertEqual(game.state.winner, '');
    assertEqual(game.state.width, 40);
    assertEqual(game.state.height, 30);
    assertTrue(typeof game.state.snakes === 'object');
    assertTrue(Array.isArray(game.state.foods));
});

test('game.js - init sets player info', () => {
    game.init('player1', 'Alice', '#22c55e');
    assertEqual(game.playerId, 'player1');
    assertEqual(game.playerName, 'Alice');
    assertEqual(game.playerColor, '#22c55e');
});

test('game.js - updateState updates all game fields', () => {
    game.reset();
    const newState = {
        room_id: 'room1',
        tick: 100,
        game_over: true,
        winner: 'player1',
        width: 50,
        height: 40,
        snakes: {
            'player1': {
                player_id: 'player1',
                body: [{ x: 10, y: 10 }],
                color: '#22c55e',
                alive: true
            }
        },
        foods: [
            { position: { x: 20, y: 20 } }
        ]
    };

    game.updateState(newState);
    assertEqual(game.state.roomId, 'room1');
    assertEqual(game.state.tick, 100);
    assertEqual(game.state.gameOver, true);
    assertEqual(game.state.winner, 'player1');
    assertEqual(game.state.width, 50);
    assertEqual(game.state.height, 40);
    assertTrue('player1' in game.state.snakes);
    assertEqual(game.state.foods.length, 1);
});

test('game.js - getPlayerSnake returns player snake', () => {
    game.reset();
    game.init('player1', 'Alice', '#22c55e');
    game.state.snakes['player1'] = {
        player_id: 'player1',
        body: [{ x: 10, y: 10 }],
        color: '#22c55e',
        alive: true
    };

    const snake = game.getPlayerSnake();
    assertTrue(snake !== null);
    assertEqual(snake.player_id, 'player1');
});

test('game.js - getPlayerSnake returns null for non-existent player', () => {
    game.reset();
    game.init('player1', 'Alice', '#22c55e');

    const snake = game.getPlayerSnake();
    assertTrue(snake === null);
});

test('game.js - getSnakesArray returns array of snakes', () => {
    game.reset();
    game.state.snakes = {
        'p1': { player_id: 'p1', body: [], color: '#f00', alive: true },
        'p2': { player_id: 'p2', body: [], color: '#0f0', alive: true }
    };

    const snakes = game.getSnakesArray();
    assertTrue(Array.isArray(snakes));
    assertEqual(snakes.length, 2);
});

test('game.js - queueInput validates directions', () => {
    game.reset();
    game.init('player1', 'Alice', '#22c55e');
    game.state.snakes['player1'] = {
        player_id: 'player1',
        body: [{ x: 10, y: 10 }, { x: 9, y: 10 }],
        color: '#22c55e',
        alive: true
    };

    // Valid direction
    assertTrue(game.queueInput('left'));

    // Invalid direction (reversal)
    assertTrue(!game.queueInput('right'));
});

test('game.js - queueInput rejects invalid directions', () => {
    game.reset();
    assertTrue(!game.queueInput('invalid'));
    assertTrue(!game.queueInput(''));
    assertTrue(!game.queueInput('UP')); // Case sensitive
});

test('game.js - getQueuedInputs returns and clears queue', () => {
    game.reset();
    game.queueInput('up');
    game.queueInput('down');

    const inputs = game.getQueuedInputs();
    assertEqual(inputs.length, 2);
    assertEqual(game.inputQueue.length, 0);
});

test('game.js - isPlayerAlive returns correct status', () => {
    game.reset();
    game.init('player1', 'Alice', '#22c55e');

    assertTrue(!game.isPlayerAlive()); // No snake yet

    game.state.snakes['player1'] = {
        player_id: 'player1',
        body: [],
        color: '#22c55e',
        alive: true
    };
    assertTrue(game.isPlayerAlive());

    game.state.snakes['player1'].alive = false;
    assertTrue(!game.isPlayerAlive());
});

test('game.js - getLeaderboard sorts by length', () => {
    game.reset();
    game.state.snakes = {
        'p1': { player_id: 'p1', body: [1, 2, 3], color: '#f00', alive: true },
        'p2': { player_id: 'p2', body: [1, 2], color: '#0f0', alive: true },
        'p3': { player_id: 'p3', body: [1, 2, 3, 4, 5], color: '#00f', alive: true }
    };

    const leaderboard = game.getLeaderboard();
    assertEqual(leaderboard[0].player_id, 'p3'); // Longest
    assertEqual(leaderboard[1].player_id, 'p1');
    assertEqual(leaderboard[2].player_id, 'p2'); // Shortest
});

test('game.js - getGameInfo returns correct info', () => {
    game.reset();
    game.state.roomId = 'room1';
    game.state.tick = 100;
    game.state.gameOver = false;

    const info = game.getGameInfo();
    assertEqual(info.roomId, 'room1');
    assertEqual(info.tick, 100);
    assertEqual(info.gameOver, false);
    assertEqual(info.playerCount, 0);
});

test('game.js - handleGameStart calls onGameStart callback', () => {
    game.reset();
    let called = false;
    game.onGameStart = () => { called = true; };

    game.handleGameStart({ tick: 0 });
    assertTrue(called);
});

test('game.js - updateState calls onStateUpdate callback', () => {
    game.reset();
    let called = false;
    game.onStateUpdate = () => { called = true; };

    game.updateState({ tick: 1 });
    assertTrue(called);
});

// ============ Network Manager Tests (Mock) ============

test('network.js - NetworkManager has correct initial state', () => {
    assertTrue(typeof network !== 'undefined');
    assertTrue(!network.connected);
    assertTrue(typeof network.messageHandlers === 'object');
});

test('network.js - on registers message handler', () => {
    const handler = () => {};
    network.on('test_message', handler);
    assertTrue(typeof network.messageHandlers['test_message'] === 'function');
    network.off('test_message');
});

test('network.js - off removes message handler', () => {
    const handler = () => {};
    network.on('test_message', handler);
    network.off('test_message');
    assertTrue(network.messageHandlers['test_message'] === undefined);
});

test('network.js - isConnected returns connection status', () => {
    assertTrue(!network.isConnected());
});

test('network.js - getReadyState returns CLOSED when not connected', () => {
    assertTrue(network.getReadyState() === WebSocket.CLOSED);
});

// ============ Renderer Tests (Mock) ============

test('renderer.js - GameRenderer initializes with default values', () => {
    const canvas = { width: 800, height: 600, getContext: () => ({ scale: () => {} }) };
    const renderer = new GameRenderer(canvas);

    assertTrue(renderer.backgroundColor === '#1a1a2e');
    assertTrue(renderer.gridColor === '#252540');
    assertTrue(renderer.foodColor === '#f59e0b');
    assertTrue(renderer.gridWidth === 40);
    assertTrue(renderer.gridHeight === 30);
});

// ============ Message Format Tests ============

test('message format - join_room requires all fields', () => {
    const msg = createJoinRoomMessage('room1', 'player1', 'Alice', '#22c55e');
    assertTrue('room_id' in msg.payload);
    assertTrue('player_id' in msg.payload);
    assertTrue('player_name' in msg.payload);
    assertTrue('color' in msg.payload);
});

test('message format - player_input direction is lowercase', () => {
    const directions = ['up', 'down', 'left', 'right'];
    for (const dir of directions) {
        const msg = createPlayerInputMessage(dir);
        assertEqual(msg.payload.direction, dir);
    }
});

test('message format - game_state has required fields', () => {
    const mockState = {
        room_id: 'room1',
        tick: 100,
        game_over: false,
        winner: '',
        width: 40,
        height: 30,
        snakes: {},
        foods: []
    };

    game.updateState(mockState);
    const state = game.state;

    assertTrue('roomId' in state || state.roomId !== undefined);
    assertTrue('tick' in state || state.tick !== undefined);
});

// Run tests
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    runTests().then(success => {
        process.exit(success ? 0 : 1);
    });
} else if (typeof window !== 'undefined') {
    // Browser environment
    window.runFrontendTests = runTests;
}
