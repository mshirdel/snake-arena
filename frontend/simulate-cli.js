#!/usr/bin/env node

/**
 * Lightweight CLI simulator for the Snake backend.
 *
 * Usage:
 *   node simulate-cli.js --players 4 --duration 120 --url ws://localhost:8080/ws
 */

const MessageType = {
    JoinRoom: 'join_room',
    PlayerInput: 'player_input',
    LeaveRoom: 'leave_room',
    PlayAgain: 'play_again',
    GameState: 'game_state',
    Error: 'error',
    PlayerDied: 'player_died',
    Ack: 'ack',
    Ping: 'ping',
    Pong: 'pong'
};

const DIRECTIONS = ['up', 'right', 'down', 'left'];
const OPPOSITE = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
};
const COLORS = ['#22c55e', '#3b82f6', '#ef4444', '#f59e0b', '#a855f7', '#06b6d4'];
const MAX_PLAYERS_PER_ROOM = 4;

function parseArgs(argv) {
    const options = {
        url: 'ws://localhost:8080/ws',
        players: 2,
        duration: 120,
        roomId: '',
        inputInterval: 150,
        namePrefix: 'cli-bot',
        verbose: false
    };

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
        if (arg === '--verbose') {
            options.verbose = true;
            continue;
        }
        if (!arg.startsWith('--')) {
            continue;
        }

        const key = arg.slice(2);
        if (next === undefined || next.startsWith('--')) {
            throw new Error(`Missing value for ${arg}`);
        }

        i++;
        if (key === 'players') options.players = Number.parseInt(next, 10);
        else if (key === 'duration') options.duration = Number.parseFloat(next);
        else if (key === 'input-interval') options.inputInterval = Number.parseInt(next, 10);
        else if (key === 'url') options.url = next;
        else if (key === 'room-id') options.roomId = next;
        else if (key === 'name-prefix') options.namePrefix = next;
        else throw new Error(`Unknown option: ${arg}`);
    }

    if (!Number.isInteger(options.players) || options.players < 1) {
        throw new Error('--players must be a positive integer');
    }
    if (!Number.isFinite(options.duration) || options.duration <= 0) {
        throw new Error('--duration must be a positive number of seconds');
    }
    if (!Number.isInteger(options.inputInterval) || options.inputInterval < 50) {
        throw new Error('--input-interval must be an integer >= 50 milliseconds');
    }
    if (options.roomId && options.players > MAX_PLAYERS_PER_ROOM) {
        throw new Error(`--room-id targets one existing room, so --players cannot exceed ${MAX_PLAYERS_PER_ROOM}`);
    }

    return options;
}

function printHelp() {
    console.log(`Snake CLI simulator

Options:
  --url <ws-url>              Backend WebSocket URL (default: ws://localhost:8080/ws)
  --players <count>           Number of concurrent players (default: 2)
  --duration <seconds>        Run duration in seconds (default: 120)
  --room-id <room>            Room to join. Empty auto-creates rooms, max 4 players each.
  --input-interval <ms>       Direction send interval (default: 150)
  --name-prefix <name>        Bot name prefix (default: cli-bot)
  --verbose                   Log every server error and death
  --help                      Show this help

Examples:
  npm run simulate -- --players 4 --duration 120
  npm run simulate -- --players 8 --duration 120
  node simulate-cli.js --room-id test-room --players 2 --duration 30
`);
}

function createMessage(type, payload) {
    return { type, payload };
}

function joinRoomMessage(roomId, playerId, playerName, color) {
    return createMessage(MessageType.JoinRoom, {
        room_id: roomId,
        player_id: playerId,
        player_name: playerName,
        color
    });
}

function inputMessage(direction, clientTick, lastServerTick, inputSeq) {
    return createMessage(MessageType.PlayerInput, {
        direction,
        client_tick: clientTick,
        last_server_tick: lastServerTick,
        input_seq: inputSeq
    });
}

function leaveRoomMessage(roomId, playerId) {
    return createMessage(MessageType.LeaveRoom, {
        room_id: roomId,
        player_id: playerId
    });
}

class SnakeBot {
    constructor(index, options, roomIdProvider) {
        this.index = index;
        this.options = options;
        this.roomIdProvider = roomIdProvider;
        this.playerId = `cli_${process.pid}_${Date.now()}_${index}`;
        this.playerName = `${options.namePrefix}-${index + 1}`;
        this.color = COLORS[index % COLORS.length];
        this.ws = null;
        this.roomId = options.roomId || '';
        this.state = null;
        this.inputSeq = 0;
        this.lastDirection = '';
        this.alive = false;
        this.connected = false;
        this.messages = 0;
        this.states = 0;
        this.deaths = 0;
        this.errors = 0;
        this.inputTimer = null;
        this.pingTimer = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.options.url);
            this.ws = ws;

            const timeout = setTimeout(() => {
                reject(new Error(`${this.playerName} timed out connecting to ${this.options.url}`));
                this.close();
            }, 10000);

            ws.onopen = () => {
                clearTimeout(timeout);
                this.connected = true;
                const roomId = this.roomId || this.roomIdProvider();
                this.send(joinRoomMessage(roomId, this.playerId, this.playerName, this.color));
                this.startLoops();
                resolve(this);
            };

            ws.onmessage = (event) => this.handleMessage(event.data);
            ws.onerror = () => {
                this.errors++;
                reject(new Error(`${this.playerName} WebSocket error`));
            };
            ws.onclose = () => {
                this.connected = false;
                this.stopLoops();
            };
        });
    }

    handleMessage(data) {
        this.messages++;

        let message;
        try {
            message = JSON.parse(data);
        } catch (error) {
            this.errors++;
            return;
        }

        if (message.type === MessageType.Ack) {
            const payload = message.payload || {};
            if (payload.action === MessageType.JoinRoom && payload.room_id) {
                this.roomId = payload.room_id;
            }
            return;
        }

        if (message.type === MessageType.GameState) {
            this.state = message.payload || null;
            this.states++;
            const snake = this.getSnake();
            this.alive = Boolean(snake && snake.alive);
            if (snake && snake.direction) {
                this.lastDirection = snake.direction;
            }
            return;
        }

        if (message.type === MessageType.PlayerDied) {
            this.deaths++;
            this.alive = false;
            if (this.options.verbose) {
                console.log(`${this.playerName} died: ${(message.payload || {}).reason || 'unknown'}`);
            }
            this.send(createMessage(MessageType.PlayAgain, { play_again: true }));
            return;
        }

        if (message.type === MessageType.Pong) {
            return;
        }

        if (message.type === MessageType.Error) {
            this.errors++;
            if (this.options.verbose) {
                console.error(`${this.playerName} server error:`, message.payload);
            }
        }
    }

    startLoops() {
        this.inputTimer = setInterval(() => this.sendDirection(), this.options.inputInterval);
        this.pingTimer = setInterval(() => {
            this.send(createMessage(MessageType.Ping, { timestamp: Date.now() }));
        }, 2000);
    }

    stopLoops() {
        if (this.inputTimer) clearInterval(this.inputTimer);
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.inputTimer = null;
        this.pingTimer = null;
    }

    sendDirection() {
        const direction = this.chooseDirection();
        if (!direction) return;

        const tick = (this.state && this.state.tick) || 0;
        this.inputSeq++;
        this.lastDirection = direction;
        this.send(inputMessage(direction, tick + 1, tick, this.inputSeq));
    }

    chooseDirection() {
        const snake = this.getSnake();
        if (!this.state || !snake || snake.alive === false) {
            return null;
        }

        const current = this.lastDirection || snake.direction || randomItem(DIRECTIONS);
        const safeDirections = DIRECTIONS.filter((direction) => {
            if (OPPOSITE[direction] === current) return false;
            return this.isSafe(direction, snake);
        });

        if (safeDirections.length === 0) {
            return current;
        }
        if (safeDirections.includes(current) && Math.random() > 0.25) {
            return current;
        }
        return randomItem(safeDirections);
    }

    isSafe(direction, snake) {
        const head = Array.isArray(snake.body) ? snake.body[0] : null;
        if (!head) return true;

        const next = { x: head.x, y: head.y };
        if (direction === 'up') next.y--;
        else if (direction === 'down') next.y++;
        else if (direction === 'left') next.x--;
        else if (direction === 'right') next.x++;

        const width = this.state.width || 40;
        const height = this.state.height || 30;
        if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height) {
            return false;
        }

        return !Object.values(this.state.snakes || {}).some((other) => {
            if (!Array.isArray(other.body)) return false;
            return other.body.some((part) => part.x === next.x && part.y === next.y);
        });
    }

    getSnake() {
        return this.state && this.state.snakes
            ? this.state.snakes[this.playerId]
            : null;
    }

    send(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        this.ws.send(JSON.stringify(message));
        return true;
    }

    close() {
        this.stopLoops();
        if (this.connected && this.roomId) {
            this.send(leaveRoomMessage(this.roomId, this.playerId));
        }
        if (this.ws) {
            this.ws.close();
        }
    }
}

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRoomAssignment(bot, timeoutMs = 5000) {
    const startedAt = Date.now();
    while (!bot.roomId && Date.now() - startedAt < timeoutMs) {
        await sleep(50);
    }

    if (!bot.roomId) {
        throw new Error(`${bot.playerName} did not receive a room assignment within ${timeoutMs}ms`);
    }
}

async function main() {
    const options = parseArgs(process.argv);
    const bots = [];
    const roomIds = options.roomId ? [options.roomId] : [];
    const roomCount = Math.ceil(options.players / MAX_PLAYERS_PER_ROOM);

    console.log(`Connecting ${options.players} player(s) to ${options.url}`);
    console.log(`Duration: ${options.duration}s, rooms: ${options.roomId || `${roomCount} auto-created`}`);

    for (let i = 0; i < options.players; i++) {
        const roomIndex = Math.floor(i / MAX_PLAYERS_PER_ROOM);
        const bot = new SnakeBot(i, options, () => roomIds[roomIndex] || '');
        await bot.connect();
        bots.push(bot);

        if (!roomIds[roomIndex] && bot.roomId) {
            roomIds[roomIndex] = bot.roomId;
            console.log(`Created room ${roomIndex + 1}/${roomCount}: ${bot.roomId}`);
        }
        if (!roomIds[roomIndex]) {
            await waitForRoomAssignment(bot);
            roomIds[roomIndex] = bot.roomId;
            console.log(`Created room ${roomIndex + 1}/${roomCount}: ${bot.roomId}`);
        }

        await sleep(100);
    }

    const startedAt = Date.now();
    const statsTimer = setInterval(() => {
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        const alive = bots.filter((bot) => bot.alive).length;
        const deaths = bots.reduce((sum, bot) => sum + bot.deaths, 0);
        const errors = bots.reduce((sum, bot) => sum + bot.errors, 0);
        process.stdout.write(`\r${elapsed}s/${options.duration}s alive=${alive}/${bots.length} deaths=${deaths} errors=${errors}`);
    }, 1000);

    await sleep(options.duration * 1000);
    clearInterval(statsTimer);
    process.stdout.write('\n');

    bots.forEach((bot) => bot.close());
    await sleep(500);

    console.log('Simulation finished');
    bots.forEach((bot) => {
        console.log(`${bot.playerName}: states=${bot.states}, deaths=${bot.deaths}, errors=${bot.errors}, room=${bot.roomId || '-'}`);
    });
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
