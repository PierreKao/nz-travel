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

        await page.locator('#nav-container .day-btn').nth(3).click();

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
        await page.locator('#nav-container .day-btn').nth(3).click();

        await expect(page.locator('#content-display h2').first()).toContainText(newTitle);
    });

    test('import 支援 markdown code block JSON（含 customCoords）', async ({ page }) => {
        const dialogs = [];
        page.on('dialog', async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });

        await openApp(page);
        await page.locator('#edit-mode-btn').click();
        await page.locator('[data-ui-action="open-io-modal"]').first().click();
        await expect(page.locator('#io-modal')).toHaveClass(/flex/);

        const importPayload = {
            itinerary: [
                {
                    date: 'Day 01',
                    actualDate: '2026-07-01',
                    city: { zh: '蒂卡波', en: 'Tekapo' },
                    mapUrl: 'Lake+Tekapo',
                    stay: { zh: '蒂卡波', en: 'Tekapo' },
                    zh: { title: '🧪 匯入測試日', timeline: [['上午', '測試活動', '30 分 車程', '', '', '來自 code fence']] },
                    en: { title: '🧪 Import Test Day', timeline: [['Morning', 'Import test activity', '30 min drive', '', '', 'from markdown code fence']] }
                }
            ],
            customCoords: {
                'Test Custom Spot': { lat: -44.01, lon: 170.5, zh: '測試觀星點', en: 'Test Spot' }
            }
        };
        const wrappedJson = `Please import this payload:\n\`\`\`json\n${JSON.stringify(importPayload, null, 2)}\n\`\`\`\nThanks!`;

        await page.locator('#io-textarea').fill(wrappedJson);
        await page.locator('[data-ui-action="import-itinerary"]').click();

        await expect.poll(async () => {
            return page.locator('#io-modal').getAttribute('class');
        }).toContain('hidden');

        await expect.poll(async () => {
            return page.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('itinerary_custom') || '[]');
                return saved[0]?.zh?.title || '';
            });
        }).toBe('🧪 匯入測試日');

        await expect.poll(async () => {
            return page.evaluate(() => {
                const coords = JSON.parse(localStorage.getItem('nz_travel_custom_city_coords') || '{}');
                return coords['Test Custom Spot']?.lat;
            });
        }).toBe(-44.01);

        expect(dialogs.length).toBe(1);
        expect(dialogs[0]).toContain('導入成功');
    });

    test('import/export 支援 JSON 檔案', async ({ page }) => {
        const dialogs = [];
        page.on('dialog', async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });

        await openApp(page);
        await page.locator('#edit-mode-btn').click();
        await page.locator('[data-ui-action="open-io-modal"]').first().click();
        await expect(page.locator('#io-modal')).toHaveClass(/flex/);

        const filePayload = {
            itinerary: [
                {
                    date: 'Day 01',
                    actualDate: '2026-07-01',
                    city: { zh: '瓦納卡', en: 'Wanaka' },
                    mapUrl: 'That+Wanaka+Tree',
                    stay: { zh: '瓦納卡', en: 'Wanaka' },
                    zh: { title: '📁 檔案匯入測試', timeline: [['上午', '從檔案匯入', '步行', '', '', 'file import path']] },
                    en: { title: '📁 File Import Test', timeline: [['Morning', 'Imported from file', 'Walk', '', '', 'file import path']] }
                }
            ],
            customCoords: {
                'File Import Spot': { lat: -44.7, lon: 169.13, zh: '檔案匯入點', en: 'File Import Spot' }
            }
        };

        await page.locator('#io-file-input').setInputFiles({
            name: 'sample-import.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(filePayload, null, 2))
        });

        await expect(page.locator('#io-file-status')).toContainText('sample-import.json');
        await expect(page.locator('#io-textarea')).toHaveValue(/檔案匯入測試/);

        const downloadPromise = page.waitForEvent('download');
        await page.locator('[data-ui-action="download-io-json"]').click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/^nz-travel-itinerary-\d{4}-\d{2}-\d{2}\.json$/);

        await page.locator('[data-ui-action="import-itinerary"]').click();

        await expect.poll(async () => {
            return page.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('itinerary_custom') || '[]');
                return saved[0]?.zh?.title || '';
            });
        }).toBe('📁 檔案匯入測試');

        expect(dialogs.length).toBe(1);
        expect(dialogs[0]).toContain('導入成功');
    });

    test('匯入時會把標題中的路程時間拆到預估時間欄', async ({ page }) => {
        const dialogs = [];
        page.on('dialog', async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });

        await openApp(page);
        await page.locator('#edit-mode-btn').click();
        await page.locator('[data-ui-action="open-io-modal"]').first().click();
        await expect(page.locator('#io-modal')).toHaveClass(/flex/);

        const payload = [
            {
                date: 'Day 01',
                actualDate: '2026-07-01',
                city: { zh: '但尼丁', en: 'Dunedin' },
                mapUrl: 'Dunedin+Railway+Station',
                stay: { zh: '但尼丁', en: 'Dunedin' },
                zh: {
                    title: '⛪ 米爾頓（1 小時）→ 但尼丁',
                    timeline: [['上午', '出發前往但尼丁', '1 小時 車程', '', '', '']]
                },
                en: {
                    title: '⛪ Milton (1 hr) → Dunedin',
                    timeline: [['Morning', 'Drive to Dunedin', '1 hr drive', '', '', '']]
                }
            }
        ];

        await page.locator('#io-textarea').fill(JSON.stringify(payload, null, 2));
        await page.locator('[data-ui-action="import-itinerary"]').click();

        await expect.poll(async () => {
            return page.locator('#io-modal').getAttribute('class');
        }).toContain('hidden');

        await page.locator('#nav-container .day-btn').nth(2).click();
        await expect(page.locator('#content-display h2').first()).toContainText('⛪ 米爾頓 → 但尼丁');
        await expect(page.locator('#content-display h2').first()).not.toContainText('1 小時');
        await expect(page.locator('#content-display')).toContainText('預估車程: 1 小時');

        await expect.poll(async () => {
            return page.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('itinerary_custom') || '[]');
                return {
                    title: saved[0]?.zh?.title || '',
                    drive: saved[0]?.drive || ''
                };
            });
        }).toEqual({ title: '⛪ 米爾頓 → 但尼丁', drive: '1 小時' });

        expect(dialogs.length).toBe(1);
        expect(dialogs[0]).toContain('導入成功');
    });

    test('匯入較短行程時會自動校正目前天數並刷新畫面', async ({ page }) => {
        const dialogs = [];
        page.on('dialog', async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });

        await openApp(page);
        await page.locator('#edit-mode-btn').click();

        const dayButtons = page.locator('#nav-container .day-btn');
        const totalButtons = await dayButtons.count();
        await dayButtons.nth(totalButtons - 1).click();

        const shortPayload = [
            {
                date: 'Day 01',
                actualDate: '2026-07-01',
                city: { zh: '基督城', en: 'Christchurch' },
                mapUrl: 'Christchurch+Airport',
                stay: { zh: '基督城', en: 'Christchurch' },
                zh: { title: '✅ 匯入後刷新成功', timeline: [['上午', '短行程測試', '步行', '', '', 'Auto refresh check']] },
                en: { title: '✅ Import Refresh Works', timeline: [['Morning', 'Short itinerary test', 'Walk', '', '', 'Auto refresh check']] }
            }
        ];

        await page.locator('[data-ui-action="open-io-modal"]').first().click();
        await expect(page.locator('#io-modal')).toHaveClass(/flex/);
        await page.locator('#io-textarea').fill(JSON.stringify(shortPayload, null, 2));
        await page.locator('[data-ui-action="import-itinerary"]').click();

        await expect.poll(async () => {
            return page.locator('#io-modal').getAttribute('class');
        }).toContain('hidden');

        await expect.poll(async () => {
            return page.locator('#content-display h2').first().innerText();
        }).toContain('匯入後刷新成功');

        await expect.poll(async () => {
            return page.locator('#nav-container .day-btn').count();
        }).toBe(3);

        await expect(page.locator('#nav-container')).not.toContainText('航班總覽');

        expect(dialogs.length).toBe(1);
        expect(dialogs[0]).toContain('導入成功');
    });

    test('航班頁會集中列出所有航班內容', async ({ page }) => {
        const dialogs = [];
        page.on('dialog', async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });

        await openApp(page);
        await page.locator('#edit-mode-btn').click();

        const flightHeavyPayload = [
            {
                date: 'Day 01',
                actualDate: '2026-06-25',
                city: { zh: '台北/奧克蘭', en: 'Taipei/Auckland' },
                mapUrl: 'Auckland+Airport',
                stay: { zh: '過夜航班', en: 'Overnight Flight' },
                zh: {
                    title: '✈️ 台北 → 奧克蘭（NZ 78 18:35 - 09:15）',
                    timeline: [
                        ['18:35', '桃園機場起飛', '11 小時 航程', '', '', '紐西蘭航空 NZ78'],
                        ['機上', '休息與調整時差', '過夜航班', '', '', '']
                    ]
                },
                en: {
                    title: '✈️ Taipei → Auckland (NZ 78 18:35 - 09:15)',
                    timeline: [
                        ['18:35', 'Depart from TPE', '11 hr flight', '', '', 'Air New Zealand NZ78'],
                        ['On board', 'Rest on board', 'Overnight flight', '', '', '']
                    ]
                }
            },
            {
                date: 'Day 02',
                actualDate: '2026-06-26',
                city: { zh: '皇后鎮', en: 'Queenstown' },
                mapUrl: 'Queenstown+Airport',
                stay: { zh: '皇后鎮', en: 'Queenstown' },
                zh: {
                    title: '🏔️ 奧克蘭 → 皇后鎮（NZ 637 12:25 - 14:20）',
                    timeline: [
                        ['09:15', '奧克蘭轉國內線', '機場轉乘', '', '', '先完成入境與領行李'],
                        ['12:25', '飛往皇后鎮', '1 小時 55 分 航程', '', '', '']
                    ]
                },
                en: {
                    title: '🏔️ Auckland → Queenstown (NZ 637 12:25 - 14:20)',
                    timeline: [
                        ['09:15', 'Transfer to domestic terminal', 'Airport transfer', '', '', ''],
                        ['12:25', 'Flight to Queenstown', '1 hr 55 min flight', '', '', '']
                    ]
                }
            },
            {
                date: 'Day 03',
                actualDate: '2026-07-06',
                city: { zh: '奧克蘭', en: 'Auckland' },
                mapUrl: 'Christchurch+Airport',
                stay: { zh: '奧克蘭', en: 'Auckland' },
                zh: {
                    title: '🚗 蒂卡波 → 基督城 → 奧克蘭（NZ 566 18:10 - 19:35）',
                    timeline: [
                        ['08:30', '由蒂卡波出發前往基督城機場', '3 小時 車程', '', '', '保留還車與報到緩衝'],
                        ['18:10', '基督城 → 奧克蘭（NZ 566）', '1 小時 25 分 航程', '', '', '']
                    ]
                },
                en: {
                    title: '🚗 Tekapo → Christchurch → Auckland (NZ 566 18:10 - 19:35)',
                    timeline: [
                        ['08:30', 'Leave Tekapo for Christchurch Airport', '3 hr drive', '', '', ''],
                        ['18:10', 'Christchurch → Auckland (NZ 566)', '1 hr 25 min flight', '', '', '']
                    ]
                }
            },
            {
                date: 'Day 04',
                actualDate: '2026-07-07',
                city: { zh: '台北', en: 'Taipei' },
                mapUrl: 'Taipei+101',
                stay: { zh: '返程日（不住宿）', en: 'Return day (no stay)' },
                zh: {
                    title: '✈️ 奧克蘭 → 台北（NZ77 09:40 - 17:05）',
                    timeline: [
                        ['09:40', '奧克蘭起飛', '國際線航程', '', '', ''],
                        ['17:05', '抵達台北', '', '', '', '']
                    ]
                },
                en: {
                    title: '✈️ Auckland → Taipei (NZ77 09:40 - 17:05)',
                    timeline: [
                        ['09:40', 'Depart from Auckland', 'International flight', '', '', ''],
                        ['17:05', 'Arrive in Taipei', '', '', '', '']
                    ]
                }
            },
            {
                date: 'Day 05',
                actualDate: '2026-07-08',
                city: { zh: '基督城', en: 'Christchurch' },
                mapUrl: 'Christchurch+Airport',
                stay: { zh: '基督城', en: 'Christchurch' },
                zh: {
                    title: '🚗 基督城市區移動',
                    timeline: [
                        ['上午', '先去機場附近確認還車地點', '機場接駁', '', '', '沒有搭飛機'],
                        ['下午', '市區散步', '步行', '', '', '']
                    ]
                },
                en: {
                    title: '🚗 Christchurch City Day',
                    timeline: [
                        ['Morning', 'Check the car return location near the airport', 'Airport shuttle', '', '', 'No flight today'],
                        ['Afternoon', 'City walk', 'Walk', '', '', '']
                    ]
                }
            }
        ];

        await page.locator('[data-ui-action="open-io-modal"]').first().click();
        await page.locator('#io-textarea').fill(JSON.stringify(flightHeavyPayload, null, 2));
        await page.locator('[data-ui-action="import-itinerary"]').click();

        await expect.poll(async () => {
            return page.locator('#io-modal').getAttribute('class');
        }).toContain('hidden');

        await page.locator('#nav-container .day-btn').nth(2).click();

        const overview = page.locator('#content-display');
        const flightPanel = page.locator('[data-testid="flight-overview-panel"]');
        await expect(overview).toContainText('航班總覽');
        await expect(flightPanel).toContainText('台北 → 奧克蘭');
        await expect(flightPanel).toContainText('奧克蘭轉國內線');
        await expect(flightPanel).toContainText('基督城 → 奧克蘭');
        await expect(flightPanel).toContainText('奧克蘭 → 台北');
        await expect(flightPanel).not.toContainText('基督城市區移動');

        expect(dialogs.length).toBe(1);
        expect(dialogs[0]).toContain('導入成功');
    });

    test('sky conditions 互動（展開、切換 stop、收合）', async ({ page }) => {
        await openApp(page);

        await page.evaluate(() => {
            const skyToggle = document.querySelector('[data-action="toggle-sky-conditions"]');
            if (skyToggle) skyToggle.click();
        });

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

        await page.evaluate(() => {
            const skyToggle = document.querySelector('[data-action="toggle-sky-conditions"]');
            if (skyToggle) skyToggle.click();
        });
        await expect(page.locator('[data-action="set-sky-stop"]')).toHaveCount(0);
    });
});
