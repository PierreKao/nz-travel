const { test, expect } = require('@playwright/test');
const path = require('path');

const APP_URL = `file://${path.resolve(__dirname, 'index.html')}`;
const SEEDED_START_DATE = '2026-07-01';

async function openApp(page) {
    await page.addInitScript((startDate) => {
        localStorage.setItem('nz_trip_start_date', startDate);
    }, SEEDED_START_DATE);

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#content-display');
    await page.waitForFunction(() => document.querySelectorAll('#nav-container .day-btn').length > 2);
}

test.describe('Itinerary editor real-flow E2E', () => {
    test('modal 開關 + drawer 動作', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openApp(page);

        const headerTitle = page.locator('#ui-header-title');
        const beforeTitle = (await headerTitle.innerText()).trim();

        await page.locator('[data-ui-action="open-drawer"]').click();
        await expect(page.locator('#drawer-container')).not.toHaveClass(/hidden/);

        await page.locator('[data-ui-action="drawer-toggle-lang"]').click();
        await expect(page.locator('#drawer-container')).toHaveClass(/hidden/);
        await expect(headerTitle).not.toHaveText(beforeTitle);

        await page.locator('[data-ui-action="open-drawer"]').click();
        await page.locator('[data-ui-action="drawer-open-date-modal"]').click();

        await expect(page.locator('#date-modal')).toHaveClass(/flex/);
        await expect(page.locator('#drawer-container')).toHaveClass(/hidden/);

        await page.evaluate(() => {
            const backdrop = document.getElementById('date-modal-backdrop');
            if (backdrop) backdrop.click();
        });
        await expect(page.locator('#date-modal')).toHaveClass(/hidden/);
    });

    test('checklist 勾選與全選切換', async ({ page }) => {
        await openApp(page);

        await page.locator('#nav-container .day-btn').nth(1).click();

        const firstCheckbox = page.locator('input[data-action="toggle-checklist-item"]').first();
        const checkId = await firstCheckbox.getAttribute('data-check-id');
        await firstCheckbox.check();
        await expect(firstCheckbox).toBeChecked();

        const storedSingle = await page.evaluate((id) => {
            const saved = JSON.parse(localStorage.getItem('nz_travel_checklist') || '{}');
            return Boolean(saved[id]);
        }, checkId);
        expect(storedSingle).toBe(true);

        const firstGroupButton = page.locator('button[data-action="toggle-checklist-group"]').first();
        const groupId = await firstGroupButton.getAttribute('data-group-id');

        await firstGroupButton.click();
        const groupCheckboxes = page.locator(`input[type="checkbox"][id^="chk_${groupId}_"]`);
        const count = await groupCheckboxes.count();
        for (let i = 0; i < count; i += 1) {
            await expect(groupCheckboxes.nth(i)).toBeChecked();
        }

        await firstGroupButton.click();
        for (let i = 0; i < count; i += 1) {
            await expect(groupCheckboxes.nth(i)).not.toBeChecked();
        }
    });

    test('day 編輯與儲存（reload 後仍存在）', async ({ page }) => {
        await openApp(page);

        await page.locator('#edit-mode-btn').click();
        await expect(page.locator('#edit-mode-btn')).toHaveClass(/ring-4/);

        await page.locator('#nav-container .day-btn').nth(2).click();

        const newTitle = `E2E Day Title ${Date.now()}`;
        const dayTitleEditable = page.locator('h2[data-edit-day="0"][data-edit-field="zh"][data-edit-subfield="title"]');
        await dayTitleEditable.fill(newTitle);

        await expect.poll(async () => {
            return page.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('itinerary_custom') || '[]');
                return saved[0]?.zh?.title || '';
            });
        }).toBe(newTitle);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelectorAll('#nav-container .day-btn').length > 2);
        await page.locator('#nav-container .day-btn').nth(2).click();

        await expect(page.locator('#content-display h2').first()).toContainText(newTitle);
    });

    test('sky conditions 互動（展開、切換 stop、收合）', async ({ page }) => {
        await openApp(page);

        const skyToggle = page.locator('[data-action="toggle-sky-conditions"]').first();
        await skyToggle.click();

        await expect.poll(async () => page.locator('[data-action="set-sky-stop"]').count()).toBeGreaterThan(1);

        const stopMeta = await page.locator('[data-action="set-sky-stop"]').evaluateAll((els) => {
            return els.map((el) => ({
                id: el.dataset.stopId,
                active: el.classList.contains('aurora-city-chip-active')
            }));
        });

        const targetStop = stopMeta.find((item) => !item.active) || stopMeta[0];
        const targetStopBtn = page.locator(`[data-action="set-sky-stop"][data-stop-id="${targetStop.id}"]`);
        await targetStopBtn.click();
        await expect(targetStopBtn).toHaveClass(/aurora-city-chip-active/);

        await skyToggle.click();
        await expect(page.locator('[data-action="set-sky-stop"]')).toHaveCount(0);
    });
});
