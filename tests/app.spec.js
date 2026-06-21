// @ts-check
import { test, expect } from '@playwright/test';

// ─── Login Page ────────────────────────────────────────────────────────────────

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear any saved session so we always land on login
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('shows login form on first load', async ({ page }) => {
    await expect(page.getByPlaceholder(/username/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
  });

  test('shows error for empty submit', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/please enter your username and password/i)).toBeVisible();
  });

  test('shows error for wrong credentials', async ({ page }) => {
    await page.getByPlaceholder(/username/i).fill('baduser');
    await page.getByPlaceholder(/password/i).fill('badpass');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/incorrect username or password/i)).toBeVisible({ timeout: 3000 });
  });

  test('logs in as user role and reaches HomeScreen', async ({ page }) => {
    await page.getByPlaceholder(/username/i).fill('kmc');
    await page.getByPlaceholder(/password/i).fill('kmc1234!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/bus production tracker/i)).toBeVisible({ timeout: 5000 });
  });

  test('logs in as admin role and reaches HomeScreen', async ({ page }) => {
    await page.getByPlaceholder(/username/i).fill('kmcadmin');
    await page.getByPlaceholder(/password/i).fill('KMC1234!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/bus production tracker/i)).toBeVisible({ timeout: 5000 });
  });

  test('Enter key submits the login form', async ({ page }) => {
    await page.getByPlaceholder(/username/i).fill('kmc');
    await page.getByPlaceholder(/password/i).fill('kmc1234!');
    await page.getByPlaceholder(/password/i).press('Enter');
    await expect(page.getByText(/bus production tracker/i)).toBeVisible({ timeout: 5000 });
  });
});

// ─── HomeScreen ────────────────────────────────────────────────────────────────

test.describe('HomeScreen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Log in as user
    await page.getByPlaceholder(/username/i).fill('kmc');
    await page.getByPlaceholder(/password/i).fill('kmc1234!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByText(/bus production tracker/i).waitFor({ timeout: 5000 });
  });

  test('shows Travel Card and Bus Tracker buttons', async ({ page }) => {
    await expect(page.getByText(/travel card/i)).toBeVisible();
    await expect(page.getByText(/bus tracker/i)).toBeVisible();
  });

  test('Sign Out returns to login screen', async ({ page }) => {
    await page.getByText(/sign out/i).click();
    await expect(page.getByPlaceholder(/username/i)).toBeVisible({ timeout: 3000 });
  });

  test('theme toggle switches between light and dark', async ({ page }) => {
    // Button shows the opposite mode label: "Light" when dark, "Dark" when light
    const isDark = await page.getByText(/^Light$/i).isVisible();
    if (isDark) {
      await page.getByText(/^Light$/i).click();
      await expect(page.getByText(/^Dark$/i)).toBeVisible();
    } else {
      await page.getByText(/^Dark$/i).click();
      await expect(page.getByText(/^Light$/i)).toBeVisible();
    }
  });

  test('clicking Travel Card opens the Travel Card module', async ({ page }) => {
    await page.getByText(/travel card/i).first().click();
    // The Travel Card module should be visible (not the HomeScreen)
    await expect(page.getByText(/bus production tracker/i)).not.toBeVisible({ timeout: 3000 });
  });

  test('clicking Bus Tracker opens the tracker module', async ({ page }) => {
    await page.getByText(/bus tracker/i).first().click();
    await expect(page.getByText(/bus production tracker/i)).not.toBeVisible({ timeout: 3000 });
  });
});
