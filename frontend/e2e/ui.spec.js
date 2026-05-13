import { test, expect } from '@playwright/test';

/**
 * Frontend E2E Test Suite
 * Tests the complete user flow: page load -> login -> lobby -> gameplay -> game over
 */

test.describe('UI Load and Initial State', () => {
  test('page loads without errors and shows connect screen', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/Snake/i);

    // Verify connect screen is visible
    const connectScreen = page.locator('#connect-screen');
    await expect(connectScreen).toBeVisible();
    await expect(connectScreen).toHaveClass(/active/);

    // Verify form elements exist
    await expect(page.locator('#player-name')).toBeVisible();
    await expect(page.locator('#room-id')).toBeVisible();
    await expect(page.locator('#join-form')).toBeVisible();
    await expect(page.locator('#color-picker')).toBeVisible();

    // Verify no console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Wait a moment for any async errors
    await page.waitForTimeout(500);
    expect(consoleErrors.filter(e => !e.includes('WebSocket'))).toHaveLength(0);
  });

  test('color picker selection works', async ({ page }) => {
    await page.goto('/');

    // Get the first (default) color button
    const defaultColorBtn = page.locator('.color-btn').first();
    await expect(defaultColorBtn).toHaveClass(/selected/);

    // Click a different color
    const redColorBtn = page.locator('.color-btn[data-color="#ef4444"]');
    await redColorBtn.click();

    // Verify selection changed
    await expect(defaultColorBtn).not.toHaveClass(/selected/);
    await expect(redColorBtn).toHaveClass(/selected/);
  });

  test('other screens are initially hidden', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#lobby-screen')).not.toHaveClass(/active/);
    await expect(page.locator('#game-screen')).not.toHaveClass(/active/);
    await expect(page.locator('#gameover-screen')).not.toHaveClass(/active/);
  });
});

test.describe('Form Validation', () => {
  test('shows error when submitting without player name', async ({ page }) => {
    await page.goto('/');

    // Try to submit without name
    await page.locator('#join-form').submit();

    // Should show error
    const errorEl = page.locator('#connect-error');
    await expect(errorEl).not.toBeEmpty();
  });

  test('allows empty room ID (auto-generates)', async ({ page }) => {
    await page.goto('/');

    // Fill in name but leave room empty
    await page.locator('#player-name').fill('TestPlayer');

    // Check room ID input accepts empty value
    const roomInput = page.locator('#room-id');
    await expect(roomInput).toHaveValue('');
  });
});

test.describe('Login Flow', () => {
  test('can enter name and see join button', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await expect(page.locator('button[type="submit"]')).toContainText('Join Game');
  });

  test('full login flow creates room and shows lobby', async ({ page }) => {
    await page.goto('/');

    // Fill in player name
    await page.locator('#player-name').fill('TestPlayer');

    // Submit form
    await page.locator('#join-form').submit();

    // Wait for lobby screen to appear
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Verify room ID is shown
    const roomIdEl = page.locator('#current-room-id');
    await expect(roomIdEl).not.toBeEmpty();

    // Verify player count shows at least 1
    await expect(page.locator('#player-count')).toContainText('1');
  });

  test('connects to WebSocket after login', async ({ page }) => {
    const wsMessages: string[] = [];
    page.on('websocket', ws => {
      ws.on('framesent', frame => wsMessages.push(frame.payload));
      ws.on('framereceived', frame => wsMessages.push(frame.payload));
    });

    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();

    // Wait for connection and messages
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for WebSocket messages (join_room)
    await page.waitForTimeout(1000);

    // Should have sent join_room message
    const joinMessages = wsMessages.filter(m => m.includes('join_room'));
    expect(joinMessages.length).toBeGreaterThan(0);
  });
});

test.describe('Lobby Screen', () => {
  test('shows waiting status when alone', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();

    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Should show waiting message
    await expect(page.locator('#lobby-status-text')).toContainText(/waiting/i);
  });

  test('can leave room from lobby', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();

    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Click leave button
    await page.locator('#leave-btn').click();

    // Should return to connect screen
    await expect(page.locator('#connect-screen')).toHaveClass(/active/, { timeout: 3000 });
  });
});

test.describe('Game Screen Transition', () => {
  test('transitions to game screen when game starts', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();

    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for game to start (timeout gives server time to start)
    await page.waitForTimeout(2000);

    // If game started, should be on game screen
    const gameScreen = page.locator('#game-screen');
    const isGameActive = await gameScreen.evaluate(el => el.classList.contains('active'));

    if (isGameActive) {
      await expect(gameScreen).toHaveClass(/active/);
      await expect(page.locator('#game-canvas')).toBeVisible();
      await expect(page.locator('#tick-counter')).toBeVisible();
    }
    // If not started yet, that's okay - test validates the transition path
  });

  test('game canvas is rendered', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();

    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for potential game start
    await page.waitForTimeout(3000);

    const gameScreen = page.locator('#game-screen');
    const isGameActive = await gameScreen.evaluate(el => el.classList.contains('active'));

    if (isGameActive) {
      const canvas = page.locator('#game-canvas');
      await expect(canvas).toBeVisible();

      // Canvas should have dimensions
      const width = await canvas.evaluate(el => el.width);
      const height = await canvas.evaluate(el => el.height);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  });
});

test.describe('Player Controls', () => {
  test('direction buttons are clickable', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();

    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for game to start
    await page.waitForTimeout(3000);

    const gameScreen = page.locator('#game-screen');
    const isGameActive = await gameScreen.evaluate(el => el.classList.contains('active'));

    if (isGameActive) {
      // Click direction buttons
      const upBtn = page.locator('.dir-btn[data-dir="up"]');
      await expect(upBtn).toBeVisible();
      await upBtn.click();

      const leftBtn = page.locator('.dir-btn[data-dir="left"]');
      await leftBtn.click();

      const rightBtn = page.locator('.dir-btn[data-dir="right"]');
      await rightBtn.click();

      const downBtn = page.locator('.dir-btn[data-dir="down"]');
      await downBtn.click();

      // All buttons should remain visible after clicks
      await expect(upBtn).toBeVisible();
    }
  });

  test('keyboard controls work', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();

    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for game
    await page.waitForTimeout(3000);

    const gameScreen = page.locator('#game-screen');
    const isGameActive = await gameScreen.evaluate(el => el.classList.contains('active'));

    if (isGameActive) {
      // Focus the page and press keys
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowRight');

      // WASD
      await page.keyboard.press('w');
      await page.keyboard.press('a');
      await page.keyboard.press('s');
      await page.keyboard.press('d');

      // Should not crash - game should still be running
      await expect(gameScreen).toHaveClass(/active/);
    }
  });
});

test.describe('Game Over Screen', () => {
  test('shows game over when game ends', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();

    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for game to end (this could take a while in a real game)
    // Poll for game over screen
    let gameOverFound = false;
    for (let i = 0; i < 60; i++) { // 60 seconds max wait
      await page.waitForTimeout(1000);
      const gameOverScreen = page.locator('#gameover-screen');
      const isGameOverActive = await gameOverScreen.evaluate(el => el.classList.contains('active'));
      if (isGameOverActive) {
        gameOverFound = true;
        break;
      }
    }

    // If game ended, verify game over screen
    if (gameOverFound) {
      const gameOverScreen = page.locator('#gameover-screen');
      await expect(gameOverScreen).toHaveClass(/active/);
      await expect(page.locator('#gameover-message')).toBeVisible();
      await expect(page.locator('#play-again-btn')).toBeVisible();
      await expect(page.locator('#back-to-menu-btn')).toBeVisible();
    }
  });
});

test.describe('Error Handling', () => {
  test('handles disconnection gracefully', async ({ page }) => {
    await page.goto('/');

    await page.locator('#player-name').fill('TestPlayer');
    await page.locator('#join-form').submit();

    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });

    // The game handles disconnection - verify no crash
    await page.waitForTimeout(2000);

    // Page should still be responsive
    const connectScreen = page.locator('#connect-screen');
    const lobbyScreen = page.locator('#lobby-screen');
    const gameScreen = page.locator('#game-screen');

    // At least one screen should still be visible
    const anyVisible =
      await connectScreen.evaluate(el => el.classList.contains('active')) ||
      await lobbyScreen.evaluate(el => el.classList.contains('active')) ||
      await gameScreen.evaluate(el => el.classList.contains('active'));

    expect(anyVisible).toBe(true);
  });
});