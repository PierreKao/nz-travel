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

    test('桌面版語言切換按鈕文字會跟著更新', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await openApp(page);

        const desktopLangBtn = page.locator('#lang-toggle-desktop');
        await expect(desktopLangBtn).toHaveText('English');

        await desktopLangBtn.click();
        await expect(desktopLangBtn).toHaveText('中文');

        await desktopLangBtn.click();
        await expect(desktopLangBtn).toHaveText('English');
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

        await page.locator('#nav-container .day-btn').nth(4).click();

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
        await page.locator('#nav-container .day-btn').nth(4).click();

        await expect(page.locator('#content-display h2').first()).toContainText(newTitle);
    });

    test('每日行程網址在閱讀模式會自動變成連結', async ({ page }) => {
        await openApp(page);

        await page.locator('#edit-mode-btn').click();
        await page.locator('#nav-container .day-btn').nth(4).click();

        const activityField = page.locator('[data-edit-day="0"][data-edit-field="zh"][data-edit-subfield="timeline"][data-edit-item-idx="0"][data-edit-subitem-idx="1"]');
        const noteField = page.locator('[data-edit-day="0"][data-edit-field="zh"][data-edit-subfield="timeline"][data-edit-item-idx="0"][data-edit-subitem-idx="5"]');

        await activityField.fill('官方資訊 https://example.com/plan');
        await noteField.fill('更多資料 www.example.org/guide 與 javascript:alert(1)');

        await page.locator('#edit-mode-btn').click();
        await expect(page.locator('#edit-mode-btn')).not.toHaveClass(/ring-4/);

        const httpLink = page.locator('#content-display a[href="https://example.com/plan"]');
        const wwwLink = page.locator('#content-display a[href="https://www.example.org/guide"]');

        await expect(httpLink).toHaveCount(1);
        await expect(wwwLink).toHaveCount(1);
        await expect(httpLink).toHaveAttribute('target', '_blank');
        await expect(httpLink).toHaveAttribute('rel', /noopener/);
        await expect(httpLink).toHaveText('example.com/plan');
        await expect(wwwLink).toHaveText('example.org/guide');
        await expect(page.locator('#content-display a[href^="javascript:"]')).toHaveCount(0);
        await expect(page.locator('#content-display')).toContainText('javascript:alert(1)');
    });

    test('import 支援 markdown code block JSON（含 customCoords）', async ({ page }) => {
        const dialogs = [];
        page.on('dialog', async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });

        await openApp(page);
        await page.locator('#edit-mode-btn').click();
        await page.evaluate(() => openIOModal());
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
        await page.evaluate(() => openIOModal());
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

    test('費用總覽支援匯入、摘要與匯出', async ({ page }) => {
        const dialogs = [];
        page.on('dialog', async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });

        await openApp(page);
        await page.locator('#edit-mode-btn').click();
        await page.locator('[data-ui-action="open-io-modal"]').first().click();

        const payload = {
            itinerary: [
                {
                    date: 'Day 01',
                    actualDate: '2026-07-01',
                    city: { zh: '皇后鎮', en: 'Queenstown' },
                    mapUrl: 'Queenstown+Airport',
                    stay: { zh: '皇后鎮', en: 'Queenstown' },
                    zh: { title: '💰 預算測試', timeline: [['上午', '檢查費用頁', '步行', '', '', '']] },
                    en: { title: '💰 Budget Test', timeline: [['Morning', 'Open budget page', 'Walk', '', '', '']] }
                }
            ],
            budgetSettings: {
                baseCurrency: 'TWD',
                rateMode: 'fixed',
                nzdToTwdRate: 20
            },
            bookings: [
                {
                    id: 'flight_001',
                    type: 'flight',
                    title: { zh: '台北 -> 奧克蘭來回', en: 'TPE -> AKL return' },
                    vendor: 'Air New Zealand',
                    amount: { currency: 'TWD', total: 18500 },
                    status: 'paid',
                    dayStart: 1,
                    dayEnd: 1,
                    sharedWith: 2,
                    notes: 'NZ78 / NZ77'
                },
                {
                    id: 'hotel_001',
                    type: 'accommodation',
                    title: { zh: '皇后鎮住宿', en: 'Queenstown stay' },
                    vendor: 'Holiday Inn',
                    amount: { currency: 'NZD', total: 420 },
                    status: 'booked',
                    dayStart: 1,
                    dayEnd: 3,
                    sharedWith: 2,
                    notes: '2 晚'
                }
            ],
            expenses: [
                {
                    id: 'expense_001',
                    category: 'food',
                    title: { zh: '超市採買', en: 'Groceries' },
                    amount: { currency: 'NZD', total: 48.5 },
                    day: 1,
                    sharedWith: 2,
                    notes: '牛奶與早餐'
                },
                {
                    id: 'expense_002',
                    category: 'accommodation',
                    title: { zh: '住宿加購早餐', en: 'Hotel breakfast add-on' },
                    amount: { currency: 'NZD', total: 35 },
                    day: 2,
                    sharedWith: 2,
                    notes: 'late add-on'
                }
            ]
        };

        await page.locator('#io-textarea').fill(JSON.stringify(payload, null, 2));
        await page.locator('[data-ui-action="import-itinerary"]').click();

        await expect.poll(async () => {
            return page.locator('#io-modal').getAttribute('class');
        }).toContain('hidden');

        await expect(page.locator('#notice-board')).toContainText('1 NZD ≈ 20.30 TWD');
        await expect(page.locator('#notice-board')).toContainText('固定匯率');

        await page.locator('[data-ui-action="open-converter"]').click();
        await expect(page.locator('#converter-rate-info')).toContainText('1 NZD ≈ 20.30 TWD');
        await expect(page.locator('#converter-rate-info')).toContainText('固定匯率');
        await expect(page.locator('#twd-input')).toHaveValue('20.30');
        await page.evaluate(() => closeConverter());

        await expect(page.locator('#nav-container')).toContainText('費用總覽');
        await page.locator('#nav-container .day-btn').nth(2).click();

        const budgetPanel = page.locator('[data-testid="budget-bookings-panel"]');
        await expect(page.locator('#content-display')).toContainText('旅費管理');
        await expect(page.locator('[data-action="set-budget-filter"][data-budget-filter="car_rental"]')).toBeVisible();
        await expect(page.locator('[data-budget-kind="settings"][data-budget-field="baseCurrency"]')).toHaveValue('TWD');
        await expect(page.locator('[data-budget-kind="settings"][data-budget-field="rateMode"]')).toHaveValue('fixed');
        await expect(budgetPanel.locator('[data-budget-kind="booking"][data-budget-id="flight_001"][data-budget-field="title"]')).toHaveValue('台北 - 奧克蘭來回');
        await expect(budgetPanel.locator('[data-budget-kind="booking"][data-budget-id="hotel_001"][data-budget-field="title"]')).toHaveValue('皇后鎮住宿');
        await expect(page.locator('[data-testid="budget-expenses-panel"] [data-budget-kind="expense"][data-budget-id="expense_001"][data-budget-field="title"]')).toHaveValue('超市採買');
        await expect(page.locator('[data-testid="budget-expenses-panel"] [data-budget-kind="expense"][data-budget-id="expense_002"][data-budget-field="title"]')).toHaveValue('住宿加購早餐');
        await expect(page.locator('[data-budget-summary="grand"]')).toContainText('約 TWD 28,721');
        await expect(page.locator('[data-budget-summary="paid"]')).toContainText('約 TWD 20,195');
        await expect(page.locator('[data-budget-summary="unpaid"]')).toContainText('約 TWD 8,526');
        await expect(page.locator('[data-budget-summary="perPerson"]')).toContainText('約 TWD 14,361');

        await page.locator('[data-action="set-budget-filter"][data-budget-filter="accommodation"]').click();
        await expect(budgetPanel.locator('[data-budget-kind="booking"][data-budget-id="hotel_001"][data-budget-field="title"]')).toHaveValue('皇后鎮住宿');
        await expect(page.locator('[data-testid="budget-expenses-panel"] [data-budget-kind="expense"][data-budget-id="expense_002"][data-budget-field="title"]')).toHaveValue('住宿加購早餐');
        await expect(page.locator('[data-budget-summary="grand"]')).toContainText('約 TWD 9,237');

        await page.locator('[data-action="add-booking-entry"]').click();
        const latestAccommodationBookingType = page.locator('[data-testid="budget-bookings-panel"] [data-budget-kind="booking"][data-budget-field="type"]').last();
        await expect(latestAccommodationBookingType).toHaveValue('accommodation');
        await expect.poll(async () => {
            return page.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('nz_travel_bookings') || '[]');
                return saved[saved.length - 1]?.type || '';
            });
        }).toBe('accommodation');
        await page.locator('[data-testid="budget-bookings-panel"] [data-action="remove-budget-entry"]').last().click();
        await expect(page.locator('#delete-entry-modal')).toHaveClass(/flex/);
        await page.locator('[data-ui-action="execute-delete-entry"]').click();

        await page.locator('[data-action="add-expense-entry"]').click();
        const latestAccommodationExpenseCategory = page.locator('[data-testid="budget-expenses-panel"] [data-budget-kind="expense"][data-budget-field="category"]').last();
        await expect(latestAccommodationExpenseCategory).toHaveValue('accommodation');
        await expect.poll(async () => {
            return page.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('nz_travel_expenses') || '[]');
                return saved[saved.length - 1]?.category || '';
            });
        }).toBe('accommodation');
        await page.locator('[data-testid="budget-expenses-panel"] [data-action="remove-budget-entry"]').last().click();
        await expect(page.locator('#delete-entry-modal')).toHaveClass(/flex/);
        await page.locator('[data-ui-action="execute-delete-entry"]').click();

        await page.locator('[data-action="set-budget-filter"][data-budget-filter="food"]').click();
        await expect(page.locator('[data-testid="budget-expenses-panel"] [data-budget-kind="expense"][data-budget-id="expense_001"][data-budget-field="title"]')).toHaveValue('超市採買');
        await expect(page.locator('[data-budget-summary="grand"]')).toContainText('約 TWD 985');

        await page.locator('[data-action="set-budget-filter"][data-budget-filter="all"]').click();
        await page.locator('[data-action="set-budget-filter"][data-budget-filter="car_rental"]').click();
        await page.locator('[data-action="add-booking-entry"]').click();
        const latestCarBookingType = page.locator('[data-testid="budget-bookings-panel"] [data-budget-kind="booking"][data-budget-field="type"]').last();
        await expect(latestCarBookingType).toHaveValue('car_rental');
        const latestCarBookingCurrency = page.locator('[data-testid="budget-bookings-panel"] [data-budget-kind="booking"][data-budget-field="currency"]').last();
        await expect(latestCarBookingCurrency).toHaveValue('TWD');
        await expect(page.locator('[data-action="add-expense-entry"]')).toBeHidden();
        await page.locator('[data-testid="budget-bookings-panel"] [data-action="remove-budget-entry"]').last().click();
        await expect(page.locator('#delete-entry-modal')).toHaveClass(/flex/);
        await page.locator('[data-ui-action="execute-delete-entry"]').click();
        await page.locator('[data-action="set-budget-filter"][data-budget-filter="all"]').click();

        await page.locator('[data-budget-kind="settings"][data-budget-field="baseCurrency"]').selectOption('NZD');
        await expect(page.locator('[data-budget-summary="grand"]')).toContainText('約 NZD 1,415');
        await expect(budgetPanel.locator('[data-budget-kind="booking"][data-budget-id="flight_001"][data-budget-field="currency"]')).toHaveValue('TWD');
        await expect(budgetPanel.locator('[data-budget-kind="booking"][data-budget-id="flight_001"][data-budget-field="total"]')).toHaveValue('18500');
        await expect(budgetPanel.locator('[data-budget-display-amount="booking"][data-budget-id="flight_001"]')).toContainText('目前顯示');
        await expect(budgetPanel.locator('[data-budget-display-amount="booking"][data-budget-id="flight_001"]')).toContainText('NZD 911.33');
        await expect(page.locator('[data-testid="budget-expenses-panel"] [data-budget-kind="expense"][data-budget-id="expense_001"][data-budget-field="currency"]')).toHaveValue('NZD');
        await expect(page.locator('[data-testid="budget-expenses-panel"] [data-budget-kind="expense"][data-budget-id="expense_001"][data-budget-field="total"]')).toHaveValue('48.5');
        await expect(page.locator('[data-testid="budget-expenses-panel"] [data-budget-display-amount="expense"][data-budget-id="expense_001"]')).toContainText('NZD 48.5');
        await page.locator('[data-budget-kind="settings"][data-budget-field="rateMode"]').selectOption('live');
        await expect(page.locator('[data-budget-kind="settings"][data-budget-field="nzdToTwdRate"]')).toBeDisabled();
        await expect.poll(async () => {
            return page.evaluate(() => {
                const settings = JSON.parse(localStorage.getItem('nz_travel_budget_settings') || '{}');
                return {
                    baseCurrency: settings.baseCurrency,
                    rateMode: settings.rateMode,
                    bookingCurrency: bookings.find(item => item.id === 'flight_001')?.amount?.currency,
                    bookingTotal: bookings.find(item => item.id === 'flight_001')?.amount?.total
                };
            });
        }).toEqual({ baseCurrency: 'NZD', rateMode: 'live', bookingCurrency: 'TWD', bookingTotal: 18500 });

        await page.locator('[data-budget-kind="expense"][data-budget-id="expense_001"][data-budget-field="total"]').fill('60');
        const budgetDayInput = page.locator('[data-testid="budget-expenses-panel"] [data-budget-kind="expense"][data-budget-id="expense_001"][data-budget-field="day"]');
        await budgetDayInput.click();
        await budgetDayInput.press('ControlOrMeta+A');
        await budgetDayInput.pressSequentially('12');
        await expect(budgetDayInput).toHaveValue('12');
        await budgetDayInput.blur();
        await expect.poll(async () => {
            return page.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('nz_travel_expenses') || '[]');
                return {
                    total: saved[0]?.amount?.total || 0,
                    day: saved[0]?.day || 0
                };
            });
        }).toEqual({ total: 60, day: 12 });

        await page.locator('[data-ui-action="open-io-modal"]').first().click();
        const exported = await page.locator('#io-textarea').inputValue();
        expect(exported).toContain('"bookings"');
        expect(exported).toContain('"expenses"');
        expect(exported).toContain('"hotel_001"');
        expect(exported).toContain('"total": 60');

        const excelExport = await page.evaluate(() => ({
            filename: getBudgetExcelFilename(),
            type: buildBudgetExcelBlob().type
        }));
        expect(excelExport.filename).toMatch(/^nz-travel-budget-\d{4}-\d{2}-\d{2}\.xlsx$/);
        expect(excelExport.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const excelBinary = await page.evaluate(async () => {
            const blob = buildBudgetExcelBlob();
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return {
                signature: Array.from(bytes.slice(0, 4)),
                decoded: new TextDecoder().decode(bytes)
            };
        });
        expect(excelBinary.signature).toEqual([80, 75, 3, 4]);
        expect(excelBinary.decoded).toContain('xl/workbook.xml');
        expect(excelBinary.decoded).toContain('Summary');
        expect(excelBinary.decoded).toContain('Bookings');
        expect(excelBinary.decoded).toContain('Expenses');
        expect(excelBinary.decoded).toContain('flight_001');
        expect(excelBinary.decoded).toContain('NZD');

        expect(dialogs.length).toBe(1);
        expect(dialogs[0]).toContain('導入成功');
    });

    test('每日行程可直接新增、修改、刪除今天支出', async ({ page }) => {
        const dialogs = [];
        page.on('dialog', async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });

        await openApp(page);
        await page.locator('#edit-mode-btn').click();
        await page.locator('[data-ui-action="open-io-modal"]').first().click();

        const payload = {
            itinerary: [
                {
                    date: 'Day 01',
                    actualDate: '2026-07-01',
                    city: { zh: '蒂卡波', en: 'Tekapo' },
                    mapUrl: 'Lake+Tekapo',
                    stay: { zh: '蒂卡波', en: 'Tekapo' },
                    zh: { title: '🧾 今日支出測試', timeline: [['上午', '抵達後採買', '步行', '', '', '']] },
                    en: { title: '🧾 Day Expense Test', timeline: [['Morning', 'Shop after arrival', 'Walk', '', '', '']] }
                }
            ],
            expenses: []
        };

        await page.locator('#io-textarea').fill(JSON.stringify(payload, null, 2));
        await page.locator('[data-ui-action="import-itinerary"]').click();

        await expect.poll(async () => page.locator('#io-modal').getAttribute('class')).toContain('hidden');

        await page.locator('#edit-mode-btn').click();
        await expect(page.locator('#edit-mode-btn')).not.toHaveClass(/ring-4/);

        await page.locator('#nav-container .day-btn').last().click();
        await expect(page.locator('[data-testid="day-expenses-panel"]')).toContainText('這一天還沒有支出紀錄。');

        await page.locator('[data-action="add-day-expense"]').click();
        const titleInput = page.locator('[data-testid="day-expenses-panel"] [data-budget-kind="expense"][data-budget-field="title"]').first();
        await titleInput.fill('Lake Tekapo dinner');
        await page.locator('[data-testid="day-expenses-panel"] [data-budget-kind="expense"][data-budget-field="total"]').first().fill('42');
        await page.locator('[data-testid="day-expenses-panel"] [data-budget-kind="expense"][data-budget-field="category"]').first().selectOption('food');
        await page.locator('[data-testid="day-expenses-panel"] [data-budget-kind="expense"][data-budget-field="notes"]').first().fill('Ramen + drink');

        await expect.poll(async () => {
            return page.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('nz_travel_expenses') || '[]');
                return saved.map(item => ({
                    day: item.day,
                    total: item.amount?.total,
                    title: item.title?.zh,
                    notes: item.notes
                }));
            });
        }).toEqual([
            {
                day: 1,
                total: 42,
                title: 'Lake Tekapo dinner',
                notes: 'Ramen + drink'
            }
        ]);

        await page.locator('[data-testid="day-expenses-panel"] [data-action="remove-budget-entry"]').first().click();
        await expect(page.locator('#delete-entry-modal')).toHaveClass(/flex/);
        await page.locator('[data-ui-action="execute-delete-entry"]').click();
        await expect(page.locator('[data-testid="day-expenses-panel"]')).toContainText('這一天還沒有支出紀錄。');

        expect(dialogs.length).toBe(1);
        expect(dialogs[0]).toContain('導入成功');
    });

    test('手機版既有支出預設唯讀，點編輯後才可修改', async ({ page }) => {
        const dialogs = [];
        page.on('dialog', async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });

        await page.setViewportSize({ width: 390, height: 844 });
        await openApp(page);

        await expect(page.locator('#edit-mode-btn')).toBeHidden();

        await page.locator('[data-ui-action="open-drawer"]').click();
        await page.locator('[data-ui-action="drawer-open-io-modal"]').click();

        const payload = {
            itinerary: [
                {
                    date: 'Day 01',
                    actualDate: '2026-07-01',
                    city: { zh: '蒂卡波', en: 'Tekapo' },
                    mapUrl: 'Lake+Tekapo',
                    stay: { zh: '蒂卡波', en: 'Tekapo' },
                    zh: { title: '📱 手機支出測試', timeline: [['上午', '先匯入一筆住宿預訂', '步行', '', '', '']] },
                    en: { title: '📱 Mobile Expense Test', timeline: [['Morning', 'Import one booking first', 'Walk', '', '', '']] }
                }
            ],
            bookings: [
                {
                    id: 'stay_001',
                    type: 'accommodation',
                    title: { zh: '蒂卡波住宿', en: 'Tekapo stay' },
                    amount: { currency: 'NZD', total: 200 },
                    status: 'booked',
                    dayStart: 1,
                    dayEnd: 2,
                    sharedWith: 4,
                    notes: ''
                }
            ],
            expenses: [
                {
                    id: 'expense_mobile_001',
                    category: 'food',
                    title: { zh: '既有晚餐', en: 'Existing dinner' },
                    amount: { currency: 'NZD', total: 28 },
                    day: 1,
                    sharedWith: 2,
                    notes: 'locked by default'
                }
            ]
        };

        await page.locator('#io-textarea').fill(JSON.stringify(payload, null, 2));
        await page.locator('[data-ui-action="import-itinerary"]').click();
        await expect.poll(async () => page.locator('#io-modal').getAttribute('class')).toContain('hidden');

        await page.locator('#nav-container .day-btn').nth(2).click();
        const mobileBookingTitle = page.locator('[data-testid="budget-bookings-panel"] [data-budget-kind="booking"][data-budget-id="stay_001"][data-budget-field="title"]');
        await expect(mobileBookingTitle).toBeDisabled();
        await expect(page.locator('[data-action="add-booking-entry"]')).toBeHidden();
        await expect(page.locator('[data-action="remove-budget-entry"][data-budget-kind="booking"][data-budget-id="stay_001"]')).toBeHidden();
        await page.locator('[data-action="toggle-booking-edit"][data-budget-id="stay_001"]').click();
        await expect(mobileBookingTitle).toBeEnabled();
        await expect(page.locator('[data-action="remove-budget-entry"][data-budget-kind="booking"][data-budget-id="stay_001"]')).toBeVisible();
        await mobileBookingTitle.fill('蒂卡波湖景住宿');
        await expect.poll(async () => {
            return page.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('nz_travel_bookings') || '[]');
                return saved.find(item => item.id === 'stay_001')?.title?.zh || '';
            });
        }).toBe('蒂卡波湖景住宿');
        const mobileBudgetExpenseTitle = page.locator('[data-testid="budget-expenses-panel"] [data-budget-kind="expense"][data-budget-id="expense_mobile_001"][data-budget-field="title"]');
        await expect(mobileBudgetExpenseTitle).toBeDisabled();
        await expect(page.locator('[data-action="remove-budget-entry"][data-budget-kind="expense"][data-budget-id="expense_mobile_001"]')).toBeHidden();
        await page.locator('[data-action="toggle-expense-edit"][data-budget-id="expense_mobile_001"]').click();
        await expect(mobileBudgetExpenseTitle).toBeEnabled();
        await expect(page.locator('[data-action="remove-budget-entry"][data-budget-kind="expense"][data-budget-id="expense_mobile_001"]')).toBeVisible();
        await mobileBudgetExpenseTitle.fill('修改後晚餐');
        await expect.poll(async () => {
            return page.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('nz_travel_expenses') || '[]');
                return saved.find(item => item.id === 'expense_mobile_001')?.title?.zh || '';
            });
        }).toBe('修改後晚餐');

        await page.locator('#nav-container .day-btn').last().click();
        await page.locator('[data-action="add-day-expense"]').click();
        const dayExpenseCards = page.locator('[data-testid="day-expenses-panel"] [data-budget-kind="expense"][data-budget-field="title"]');
        await expect(dayExpenseCards).toHaveCount(2);
        await dayExpenseCards.nth(1).fill('Mobile coffee');
        await page.locator('[data-testid="day-expenses-panel"] [data-budget-kind="expense"][data-budget-field="total"]').nth(1).fill('12');

        await expect.poll(async () => {
            return page.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('nz_travel_expenses') || '[]');
                return {
                    count: saved.length,
                    existingTitle: saved.find(item => item.id === 'expense_mobile_001')?.title?.zh || '',
                    newTitle: saved.find(item => item.id !== 'expense_mobile_001')?.title?.zh || '',
                    newTotal: saved.find(item => item.id !== 'expense_mobile_001')?.amount?.total || 0
                };
            });
        }).toEqual({ count: 2, existingTitle: '修改後晚餐', newTitle: 'Mobile coffee', newTotal: 12 });

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

        await page.locator('#nav-container .day-btn').last().click();
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
        }).toBe(4);

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
