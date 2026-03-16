# NZ Travel 專案安全修補（第三步，header/drawer + converter）

## 目標
持續收斂 inline 事件，先處理高頻入口（header、drawer）與 converter 的 inline `oninput`。

## 本次完成項目
- Header 靜態區塊改為 `data-ui-action`
  - 包含：總覽切換、換算、列印、極光模式、編輯模式、匯入匯出、同步、匯出、重置、解鎖、日期、開啟抽屜、語言切換、地圖模式切換。
- Drawer 靜態區塊改為 `data-ui-action`
  - overlay 關閉、右上角關閉按鈕。
- `renderDrawerMenu()` 動態按鈕改為 `data-ui-action`
  - 語言切換、極光模式、日期、換算、匯入匯出、重置。
- 新增全域 UI 委派處理器
  - `handleGlobalUIClick(event)`：統一分派 `data-ui-action`。
  - `handleGlobalUIInput(event)`：統一處理 converter 匯率輸入。
- Converter `oninput` 移除
  - `#nzd-input` / `#twd-input` 改為 `data-currency-source`。

## 影響檔案
- `/Users/pierre.kao/Repositories/nz-travel/index.html`

## 驗收建議
1. Header 各按鈕可正常動作（特別是編輯模式、匯入匯出、重置）。
2. 手機版可正常開關 drawer，drawer 內按鈕可正常執行。
3. 匯率換算輸入 NZD/TWD，對向欄位會即時更新。
4. 確認 map mode toggle（overview 地圖右上按鈕）仍可切換。

## 進度說明
- 這一批完成後，inline `onclick` 從 61 降到 37。
- `oninput` 只剩非 `handleEdit` 的 converter，已在本批移除。

## 後續建議
- 下一批優先收斂 modal 系列 `onclick`（關閉、確認、取消）。
- 再下一批處理 overview/sky-condition/checklist 的動態 `onclick` 生成點。
