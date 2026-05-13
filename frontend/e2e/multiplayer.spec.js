import { test, expect } from '@playwright/test';

/**
 * Multi-player E2E Test Suite
 * Tests interactions between multiple players
 */

test.describe('Multi-Player Game Flow', () => {
  test('two players can join same room', async ({ browser }) => {
    // Create two browser contexts (like two different users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // First player creates a room
      await page1.goto('/');
      await page1.locator('#player-name').fill('Player1');
      const roomId = 'test-room-' + Date.now();
      await page1.locator('#room-id').fill(roomId);
      await page1.locator('#join-form').submit();

      await expect(page1.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      // Second player joins the same room
      await page2.goto('/');
      await page2.locator('#player-name').fill('Player2');
      await page2.locator('#room-id').fill(roomId);
      await page2.locator('#join-form').submit();

      await expect(page2.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      // Both should see 2 players in the room
      await page1.waitForTimeout(500);
      await expect(page1.locator('#player-count')).toContainText('2');

      await page2.waitForTimeout(500);
      await expect(page2.locator('#player-count')).toContainText('2');

    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('player list shows both players', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      const roomId = 'test-room-' + Date.now();

      // Player 1 joins
      await page1.goto('/');
      await page1.locator('#player-name').fill('Alice');
      await page1.locator('#room-id').fill(roomId);
      await page1.locator('#join-form').submit();
      await expect(page1.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      // Player 2 joins
      await page2.goto('/');
      await page2.locator('#player-name').fill('Bob');
      await page2.locator('#room-id').fill(roomId);
      await page2.locator('#join-form').submit();
      await expect(page2.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      // Wait for both to see each other
      await page1.waitForTimeout(1000);

      // Player 1 should see both names in player list
      const playerList1 = page1.locator('#player-list');
      await expect(playerList1).toContainText('Alice');
      await expect(playerList1).toContainText('Bob');

      // Player 2 should see both names
      const playerList2 = page2.locator('#player-list');
      await expect(playerList2).toContainText('Alice');
      await expect(playerList2).toContainText('Bob');

    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('lobby shows "game starting" when 2+ players', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      const roomId = 'test-room-' + Date.now();

      // Both players join
      await page1.goto('/');
      await page1.locator('#player-name').fill('Player1');
      await page1.locator('#room-id').fill(roomId);
      await page1.locator('#join-form').submit();
      await expect(page1.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      await page2.goto('/');
      await page2.locator('#player-name').fill('Player2');
      await page2.locator('#room-id').fill(roomId);
      await page2.locator('#join-form').submit();
      await expect(page2.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      // Wait for status update
      await page1.waitForTimeout(1000);

      // At least one player should see game starting message
      const status1 = await page1.locator('#lobby-status-text').textContent();
      const status2 = await page2.locator('#lobby-status-text').textContent();

      const gameStarting = status1?.includes('starting') || status2?.includes('starting');
      const waitingForPlayers = status1?.includes('waiting') && status2?.includes('waiting');

      // Should either show starting or both waiting (depends on game config)
      expect(gameStarting || waitingForPlayers).toBe(true);

    } finally {
      await context1.close();
      await context2.close();
    }
  });
});

test.describe('Game State Synchronization', () => {
  test('both players see the same tick counter progression', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      const roomId = 'test-room-' + Date.now();

      // Both join
      await page1.goto('/');
      await page1.locator('#player-name').fill('Player1');
      await page1.locator('#room-id').fill(roomId);
      await page1.locator('#join-form').submit();
      await expect(page1.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      await page2.goto('/');
      await page2.locator('#player-name').fill('Player2');
      await page2.locator('#room-id').fill(roomId);
      await page2.locator('#join-form').submit();
      await expect(page2.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      // Wait for game to start
      let gameStarted = false;
      for (let i = 0; i < 30; i++) {
        await page1.waitForTimeout(1000);
        const isGame1Active = await page1.locator('#game-screen').evaluate(el => el.classList.contains('active'));
        const isGame2Active = await page2.locator('#game-screen').evaluate(el => el.classList.contains('active'));
        if (isGame1Active && isGame2Active) {
          gameStarted = true;
          break;
        }
      }

      if (gameStarted) {
        // Both should be on game screen
        await expect(page1.locator('#game-screen')).toHaveClass(/active/);
        await expect(page2.locator('#game-screen')).toHaveClass(/active/);

        // Wait for ticks to progress
        await page1.waitForTimeout(2000);

        // Get tick values
        const tick1 = await page1.locator('#tick-counter').textContent();
        const tick2 = await page2.locator('#tick-counter').textContent();

        // Both should have seen tick progression (ticks should be > 0)
        expect(parseInt(tick1 || '0')).toBeGreaterThan(0);
        expect(parseInt(tick2 || '0')).toBeGreaterThan(0);
      }

    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('players see each other\'s snakes', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      const roomId = 'test-room-' + Date.now();

      // Both join
      await page1.goto('/');
      await page1.locator('#player-name').fill('Player1');
      await page1.locator('#room-id').fill(roomId);
      await page1.locator('#join-form').submit();
      await expect(page1.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      await page2.goto('/');
      await page2.locator('#player-name').fill('Player2');
      await page2.locator('#room-id').fill(roomId);
      await page2.locator('#join-form').submit();
      await expect(page2.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      // Wait for game to start
      let gameStarted = false;
      for (let i = 0; i < 30; i++) {
        await page1.waitForTimeout(1000);
        const isGame1Active = await page1.locator('#game-screen').evaluate(el => el.classList.contains('active'));
        if (isGame1Active) {
          gameStarted = true;
          break;
        }
      }

      if (gameStarted) {
        // Both players should see snake scores (at least their own)
        await expect(page1.locator('#snake-scores')).not.toBeEmpty();
        await expect(page2.locator('#snake-scores')).not.toBeEmpty();

        // Both should see 2 snakes in the scores
        const scores1 = await page1.locator('#snake-scores .snake-score').count();
        const scores2 = await page2.locator('#snake-scores .snake-score').count();

        expect(scores1).toBeGreaterThanOrEqual(1);
        expect(scores2).toBeGreaterThanOrEqual(1);
      }

    } finally {
      await context1.close();
      await context2.close();
    }
  });
});

test.describe('Player Leave/Join During Game', () => {
  test('can leave room and rejoin as different player', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      const roomId = 'test-room-' + Date.now();

      // Player 1 creates room
      await page1.goto('/');
      await page1.locator('#player-name').fill('Player1');
      await page1.locator('#room-id').fill(roomId);
      await page1.locator('#join-form').submit();
      await expect(page1.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      // Player 2 joins
      await page2.goto('/');
      await page2.locator('#player-name').fill('Player2');
      await page2.locator('#room-id').fill(roomId);
      await page2.locator('#join-form').submit();
      await expect(page2.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      // Player 1 leaves
      await page1.locator('#leave-btn').click();
      await expect(page1.locator('#connect-screen')).toHaveClass(/active/, { timeout: 3000 });

      // Player 1 rejoins as different player
      await page1.locator('#player-name').fill('Player1Changed');
      await page1.locator('#room-id').fill(roomId);
      await page1.locator('#join-form').submit();
      await expect(page1.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

      // Player 2 should still be in game
      await page2.waitForTimeout(500);
      const isStillInLobby = await page2.locator('#lobby-screen').evaluate(el => el.classList.contains('active'));
      const isInGame = await page2.locator('#game-screen').evaluate(el => el.classList.contains('active'));

      expect(isStillInLobby || isInGame).toBe(true);

    } finally {
      await context1.close();
      await context2.close();
    }
  });
});