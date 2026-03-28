const { test, expect } = require('@playwright/test');
const path = require('path');

const APP_URL = `file://${path.resolve(__dirname, 'index.html')}`;
const SEEDED_START_DATE = '2026-07-01';
const XSS_PAYLOAD = '<img src=x onerror="window.__xssExecuted=(window.__xssExecuted||0)+1">';

function buildMaliciousImportJson() {
    const item = ['09:00', XSS_PAYLOAD, '1 hr drive', XSS_PAYLOAD, '', XSS_PAYLOAD];
    return JSON.stringify([
        {
            date: 'Day 01',
            actualDate: '2026-07-01',
            city: { zh: XSS_PAYLOAD, en: XSS_PAYLOAD },
            mapUrl: XSS_PAYLOAD,
            mapQuery: XSS_PAYLOAD,
            zh: { title: XSS_PAYLOAD, timeline: [item] },
            en: { title: XSS_PAYLOAD, timeline: [item] }
        }
    ], null, 2);
}

test('XSS 安全回歸：匯入 JSON、編輯輸入、貼上內容均不執行 payload', async ({ page }) => {
    page.on('dialog', async (dialog) => {
        await dialog.accept();
    });

    await page.addInitScript((startDate) => {
        localStorage.setItem('nz_trip_start_date', startDate);
        window.__xssExecuted = 0;
    }, SEEDED_START_DATE);

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#content-display');
    await page.waitForFunction(() => document.querySelectorAll('#nav-container .day-btn').length > 2);

    await page.locator('#edit-mode-btn').click();
    await page.locator('[data-ui-action="open-io-modal"]').first().click();
    await expect(page.locator('#io-modal')).toHaveClass(/flex/);

    await page.locator('#io-textarea').fill(buildMaliciousImportJson());
    await page.locator('[data-ui-action="import-itinerary"]').click();

    await expect.poll(async () => {
        return page.locator('#io-modal').getAttribute('class');
    }).toContain('hidden');

    const importedTitle = await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('itinerary_custom') || '[]');
        return saved[0]?.zh?.title || '';
    });
    expect(importedTitle).not.toContain('<');
    expect(importedTitle).not.toContain('>');

    await expect.poll(async () => {
        return page.evaluate(() => window.__xssExecuted || 0);
    }).toBe(0);

    await page.locator('#nav-container .day-btn').last().click();

    const dayTitleEditable = page.locator('h2[data-edit-day="0"][data-edit-field="zh"][data-edit-subfield="title"]');
    await dayTitleEditable.fill(XSS_PAYLOAD);

    const editedTitle = await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('itinerary_custom') || '[]');
        return saved[0]?.zh?.title || '';
    });
    expect(editedTitle).not.toContain('<');
    expect(editedTitle).not.toContain('>');

    const firstDescription = page.locator('[data-edit-day="0"][data-edit-field="zh"][data-edit-subfield="timeline"][data-edit-item-idx="0"][data-edit-subitem-idx="5"]');
    await firstDescription.fill('');
    await firstDescription.click();

    await page.evaluate((payload) => {
        const target = document.querySelector('[data-edit-day="0"][data-edit-field="zh"][data-edit-subfield="timeline"][data-edit-item-idx="0"][data-edit-subitem-idx="5"]');
        if (!target) return;
        target.focus();

        const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(pasteEvent, 'clipboardData', {
            value: {
                getData: (type) => (type === 'text' ? payload : '')
            }
        });

        target.dispatchEvent(pasteEvent);
    }, XSS_PAYLOAD);

    await expect(firstDescription).toContainText('img src=x onerror=');
    const pastedText = await firstDescription.innerText();
    expect(pastedText).not.toContain('<');
    expect(pastedText).not.toContain('>');

    await expect.poll(async () => {
        return page.evaluate(() => window.__xssExecuted || 0);
    }).toBe(0);
});
