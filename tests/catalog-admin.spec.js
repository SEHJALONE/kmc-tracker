// @ts-check
import { test, expect } from '@playwright/test';

const CATALOG_WRITE_URL = 'https://script.google.com/macros/s/**';
const CATALOG_READ_URL  = 'https://docs.google.com/spreadsheets/**';

// Shared login helper
async function loginAsAdmin(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByPlaceholder(/username/i).fill('kmcadmin');
  await page.getByPlaceholder(/password/i).fill('KMC1234!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByText(/bus production tracker/i).waitFor({ timeout: 5000 });
}

// Navigate to the Bus Tracker module and open the Catalog modal
async function openCatalogModal(page) {
  // Click the Bus Tracker card on HomeScreen
  await page.getByText(/bus tracker/i).first().click();

  // Wait for the tracker header to appear
  await page.waitForSelector('[title="Edit catalog"]', { timeout: 5000 });

  // Click the Catalog button
  await page.click('[title="Edit catalog"]');

  // Modal should open
  await expect(page.getByText('Catalog Admin')).toBeVisible({ timeout: 3000 });
}

test.describe('Catalog Admin — edit and persist', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the catalog READ (gviz) — return a minimal empty CSV so useCatalog
    // settles immediately without depending on Google connectivity.
    await page.route(CATALOG_READ_URL, route =>
      route.fulfill({ status: 200, contentType: 'text/csv', body: 'key,value\n' })
    );

    // Mock the catalog WRITE (Apps Script POST) — return opaque-style 200.
    await page.route(CATALOG_WRITE_URL, route =>
      route.fulfill({ status: 200, body: 'ok' })
    );

    await loginAsAdmin(page);
  });

  // ── 1. Modal opens and shows the Projects tab by default ───────────────────
  test('Catalog modal opens on Projects tab', async ({ page }) => {
    await openCatalogModal(page);
    await expect(page.getByText('Projects', { exact: true })).toBeVisible();
    await expect(page.getByText('+ Add project')).toBeVisible();
  });

  // ── 2. Add a project and save — status message confirms success ────────────
  test('Adding a project and saving shows success status', async ({ page }) => {
    await openCatalogModal(page);

    // Add a new project row
    await page.getByText('+ Add project').click();

    // Fill in the new project name (last "Project name" placeholder input)
    const nameInputs = page.getByPlaceholder('Project name');
    await nameInputs.last().fill('Test Project Alpha');

    // Save all button should now be enabled (dirty state)
    const saveBtn = page.getByRole('button', { name: 'Save all' });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Success status should appear
    await expect(page.getByText(/Saved.*visible to everyone/i)).toBeVisible({ timeout: 5000 });
  });

  // ── 3. Edits persist locally after close and reopen ────────────────────────
  test('Saved project name persists after closing and reopening the modal', async ({ page }) => {
    await openCatalogModal(page);

    // Add and name a project
    await page.getByText('+ Add project').click();
    await page.getByPlaceholder('Project name').last().fill('Persist Check Project');

    // Save
    await page.getByRole('button', { name: 'Save all' }).click();
    await expect(page.getByText(/Saved.*visible to everyone/i)).toBeVisible({ timeout: 5000 });

    // Close the modal
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('Catalog Admin')).not.toBeVisible({ timeout: 2000 });

    // Reopen
    await page.click('[title="Edit catalog"]');
    await expect(page.getByText('Catalog Admin')).toBeVisible({ timeout: 3000 });

    // The project we added should still be there — check the input's value
    await expect(page.locator('input[placeholder="Project name"]').first()).toHaveValue('Persist Check Project', { timeout: 3000 });
  });

  // ── 4. Save button is disabled until a change is made ─────────────────────
  test('Save all button is disabled when no changes have been made', async ({ page }) => {
    await openCatalogModal(page);
    const saveBtn = page.getByRole('button', { name: 'Save all' });
    await expect(saveBtn).toBeDisabled();
  });

  // ── 5. Editing an existing project name enables Save ──────────────────────
  test('Editing a project name marks the form dirty and enables Save', async ({ page }) => {
    // First: add a project and save so there is something to edit
    await openCatalogModal(page);
    await page.getByText('+ Add project').click();
    await page.getByPlaceholder('Project name').last().fill('Original Name');
    await page.getByRole('button', { name: 'Save all' }).click();
    await page.getByRole('button', { name: 'Close' }).click();

    // Reopen
    await page.click('[title="Edit catalog"]');
    await expect(page.getByText('Catalog Admin')).toBeVisible({ timeout: 3000 });

    // Save should be disabled (no changes yet after reopen)
    await expect(page.getByRole('button', { name: 'Save all' })).toBeDisabled();

    // Edit the name — find the input that currently holds 'Original Name'
    await page.locator('input[placeholder="Project name"]').first().fill('Updated Name');

    // Now Save should be enabled
    await expect(page.getByRole('button', { name: 'Save all' })).toBeEnabled();
  });

  // ── 6. Tabs switch correctly ───────────────────────────────────────────────
  test('All catalog tabs are accessible', async ({ page }) => {
    await openCatalogModal(page);

    for (const tabName of ['Lines', 'Stations', 'Activities', 'Resources']) {
      await page.getByRole('button', { name: tabName, exact: true }).click();
      // Each tab has at least one "+ Add …" button confirming the tab loaded
      await expect(page.getByRole('button', { name: /\+ Add/i }).first()).toBeVisible({ timeout: 2000 });
    }
  });

  // ── 7. Closing without saving does not persist changes ────────────────────
  test('Closing without saving does not persist unsaved changes', async ({ page }) => {
    await openCatalogModal(page);

    // Add a project but do NOT save
    await page.getByText('+ Add project').click();
    await page.getByPlaceholder('Project name').last().fill('Unsaved Project');

    // Close without saving
    await page.getByRole('button', { name: 'Close' }).click();

    // Reopen
    await page.click('[title="Edit catalog"]');
    await expect(page.getByText('Catalog Admin')).toBeVisible({ timeout: 3000 });

    // Confirm no project name input holds 'Unsaved Project'
    const inputs = page.locator('input[placeholder="Project name"]');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      await expect(inputs.nth(i)).not.toHaveValue('Unsaved Project');
    }
  });
});
