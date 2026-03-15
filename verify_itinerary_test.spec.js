const { test, expect } = require('@playwright/test');
const path = require('path');

test('驗證行程編輯器新功能', async ({ page }) => {
    // 1. 開啟本地檔案
    const filePath = 'file://' + path.resolve(__dirname, 'index.html');
    await page.goto(filePath);

    // 2. 點擊編輯按鈕進入編輯模式
    const editBtn = page.locator('#edit-mode-btn');
    await editBtn.click();
    await expect(editBtn).toHaveClass(/ring-4/); // 確認進入編輯模式

    // 3. 驗證側邊欄同步功能
    // 切換到 Day 2
    await page.locator('.day-btn:has-text("D2")').click();
    
    // 修改城市名稱
    const cityInput = page.locator('span[contenteditable="true"]').nth(1); // 假設城市在標題後的第二個 span
    await cityInput.focus();
    await page.keyboard.type('NewCity');
    
    // 檢查側邊欄是否同步更新
    const sidebarDay2 = page.locator('.day-btn:has-text("D2")');
    await expect(sidebarDay2).toContainText('NewCity');

    // 4. 驗證景點描述欄位
    const descriptionArea = page.locator('div[contenteditable="true"][placeholder*="詳細說明"]').first();
    await expect(descriptionArea).toBeVisible();
    await descriptionArea.focus();
    await page.keyboard.type('這是一個自動化測試生成的說明文字。');
    
    // 5. 驗證 AI 翻譯按鈕
    await page.locator('.day-btn:has-text("D1")').click();
    const aiTranslateBtn = page.locator('button:has-text("AI 翻譯")');
    await expect(aiTranslateBtn).toBeVisible();

    // 6. 驗證導入/導出視窗
    const ioBtn = page.locator('#import-export-btn');
    await ioBtn.click();
    await expect(page.locator('#io-modal')).toBeVisible();
    await page.locator('#io-modal button >> i.fa-times').click(); // 關閉視窗
    await expect(page.locator('#io-modal')).toBeHidden();

    console.log('✅ 所有功能測試通過！');
});
