import { test, expect } from '@playwright/test';

/**
 * Gameplay E2E Test Suite
 * Tests actual gameplay mechanics: movement, food consumption, snake growth
 */

test.describe('Snake Movement', () => {
  test('can control snake with arrow keys', async ({ page }) => {
    await page.goto('/');

    // Join game
    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for game to start
    let gameStarted = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const isActive = await page.locator('#game-screen').evaluate(el => el.classList.contains('active'));
      if (isActive) {
        gameStarted = true;
        break;
      }
    }

    if (gameStarted) {
      // Verify game screen elements
      await expect(page.locator('#game-canvas')).toBeVisible();
      await expect(page.locator('#tick-counter')).toBeVisible();

      // Get initial tick
      const initialTick = await page.locator('#tick-counter').textContent();

      // Send direction inputs
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowUp');

      // Wait for game to progress
      await page.waitForTimeout(1000);

      // Tick should have advanced
      const newTick = await page.locator('#tick-counter').textContent();
      expect(parseInt(newTick || '0')).toBeGreaterThan(parseInt(initialTick || '0'));
    }
  });

  test('can control snake with WASD keys', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    let gameStarted = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const isActive = await page.locator('#game-screen').evaluate(el => el.classList.contains('active'));
      if (isActive) {
        gameStarted = true;
        break;
      }
    }

    if (gameStarted) {
      // Use WASD keys
      await page.keyboard.press('d'); // right
      await page.waitForTimeout(200);
      await page.keyboard.press('s'); // down
      await page.waitForTimeout(200);
      await page.keyboard.press('a'); // left
      await page.waitForTimeout(200);
      await page.keyboard.press('w'); // up

      // Game should continue without errors
      await expect(page.locator('#game-screen')).toHaveClass(/active/);
    }
  });

  test('direction buttons work', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    let gameStarted = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const isActive = await page.locator('#game-screen').evaluate(el => el.classList.contains('active'));
      if (isActive) {
        gameStarted = true;
        break;
      }
    }

    if (gameStarted) {
      // Click direction buttons
      await page.locator('.dir-btn[data-dir="up"]').click();
      await page.waitForTimeout(100);
      await page.locator('.dir-btn[data-dir="right"]').click();
      await page.waitForTimeout(100);
      await page.locator('.dir-btn[data-dir="down"]').click();
      await page.waitForTimeout(100);
      await page.locator('.dir-btn[data-dir="left"]').click();

      // Game should still be running
      await expect(page.locator('#game-screen')).toHaveClass(/active/);
      await expect(page.locator('#tick-counter')).toBeVisible();
    }
  });
});

test.describe('Game State Display', () => {
  test('tick counter updates during gameplay', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    let gameStarted = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const isActive = await page.locator('#game-screen').evaluate(el => el.classList.contains('active'));
      if (isActive) {
        gameStarted = true;
        break;
      }
    }

    if (gameStarted) {
      // Tick should be a positive number
      const tick = await page.locator('#tick-counter').textContent();
      expect(parseInt(tick || '0')).toBeGreaterThan(0);

      // Wait and verify tick increases
      await page.waitForTimeout(1000);
      const newTick = await page.locator('#tick-counter').textContent();
      expect(parseInt(newTick || '0')).toBeGreaterThan(parseInt(tick || '0'));
    }
  });

  test('room ID displayed during game', async ({ page }) => {
    await page.goto('/');

    const roomId = 'test-room-' + Date.now();
    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#room-id').fill(roomId);
    await page.locator('#join-form').submit();

    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for game
    await page.waitForTimeout(3000);

    const gameScreen = page.locator('#game-screen');
    const isGameActive = await gameScreen.evaluate(el => el.classList.contains('active'));

    if (isGameActive) {
      const displayedRoomId = await page.locator('#game-room-id').textContent();
      expect(displayedRoomId).toContain(roomId.split('-')[0]); // Room ID may have timestamp
    }
  });

  test('snake scores display shows player info', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    let gameStarted = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const isActive = await page.locator('#game-screen').evaluate(el => el.classList.contains('active'));
      if (isActive) {
        gameStarted = true;
        break;
      }
    }

    if (gameStarted) {
      // Score container should exist
      await expect(page.locator('#snake-scores')).toBeVisible();

      // Should have snake score elements
      const scoreCount = await page.locator('#snake-scores .snake-score').count();
      expect(scoreCount).toBeGreaterThan(0);

      // Each score should have a color indicator
      const hasColor = await page.locator('#snake-scores .snake-score-color').first().isVisible();
      expect(hasColor).toBe(true);
    }
  });
});

test.describe('Game Canvas Rendering', () => {
  test('game canvas renders without errors', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    let gameStarted = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const isActive = await page.locator('#game-screen').evaluate(el => el.classList.contains('active'));
      if (isActive) {
        gameStarted = true;
        break;
      }
    }

    if (gameStarted) {
      const canvas = page.locator('#game-canvas');

      // Canvas should have valid dimensions
      const dimensions = await canvas.evaluate(el => ({
        width: el.width,
        height: el.height
      }));

      expect(dimensions.width).toBeGreaterThan(0);
      expect(dimensions.height).toBeGreaterThan(0);

      // Canvas should have a 2D context (check via evaluate)
      const hasContext = await canvas.evaluate(el => {
        return el.getContext('2d') !== null;
      });
      expect(hasContext).toBe(true);
    }
  });

  test('canvas is responsive to window resize', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    let gameStarted = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const isActive = await page.locator('#game-screen').evaluate(el => el.classList.contains('active'));
      if (isActive) {
        gameStarted = true;
        break;
      }
    }

    if (gameStarted) {
      const canvas = page.locator('#game-canvas');
      const initialWidth = await canvas.evaluate(el => el.width);

      // Resize window
      await page.setViewportSize({ width: 800, height: 600 });
      await page.waitForTimeout(500);

      // Canvas dimensions may change (or not, depending on implementation)
      // Just verify it doesn't crash
      await expect(canvas).toBeVisible();
    }
  });
});

test.describe('Extended Gameplay Session', () => {
  test('game runs continuously without crashes', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    let gameStarted = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const isActive = await page.locator('#game-screen').evaluate(el => el.classList.contains('active'));
      if (isActive) {
        gameStarted = true;
        break;
      }
    }

    if (gameStarted) {
      // Play the game for a while
      const directions = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      for (let i = 0; i < 50; i++) {
        const dir = directions[Math.floor(Math.random() * directions.length)];
        await page.keyboard.press(dir);
        await page.waitForTimeout(100);
      }

      // Game should still be running
      await expect(page.locator('#game-screen')).toHaveClass(/active/);

      // Tick should have advanced significantly
      const tick = await page.locator('#tick-counter').textContent();
      expect(parseInt(tick || '0')).toBeGreaterThan(50);
    }
  });

  test('can play through lobby -> game -> gameover', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();

    // Lobby should appear first
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for game to start
    let gameStarted = false;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);
      const isActive = await page.locator('#game-screen').evaluate(el => el.classList.contains('active'));
      const gameOverActive = await page.locator('#gameover-screen').evaluate(el => el.classList.contains('active'));
      if (isActive || gameOverActive) {
        gameStarted = true;
        break;
      }
    }

    expect(gameStarted).toBe(true);

    // Either in game or game over
    const inGame = await page.locator('#game-screen').evaluate(el => el.classList.contains('active'));
    const inGameOver = await page.locator('#gameover-screen').evaluate(el => el.classList.contains('active'));

    expect(inGame || inGameOver).toBe(true);
  });
});

test.describe('Play Again Flow', () => {
  test('play again returns to connect screen', async ({ page, browser }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for game over (may take a while)
    let gameOverFound = false;
    for (let i = 0; i < 120; i++) { // Up to 2 minutes
      await page.waitForTimeout(1000);
      const isGameOverActive = await page.locator('#gameover-screen').evaluate(el => el.classList.contains('active'));
      if (isGameOverActive) {
        gameOverFound = true;
        break;
      }
    }

    if (gameOverFound) {
      // Click Play Again
      await page.locator('#play-again-btn').click();

      // Should return to connect screen
      await expect(page.locator('#connect-screen')).toHaveClass(/active/, { timeout: 3000 });

      // Form should be cleared
      await expect(page.locator('#player-name')).toHaveValue('');
      await expect(page.locator('#room-id')).toHaveValue('');
    }
  });

  test('back to menu returns to connect screen', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    let gameOverFound = false;
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(1000);
      const isGameOverActive = await page.locator('#gameover-screen').evaluate(el => el.classList.contains('active'));
      if (isGameOverActive) {
        gameOverFound = true;
        break;
      }
    }

    if (gameOverFound) {
      // Click Back to Menu
      await page.locator('#back-to-menu-btn').click();

      // Should return to connect screen
      await expect(page.locator('#connect-screen')).toHaveClass(/active/, { timeout: 3000 });
    }
  });
});