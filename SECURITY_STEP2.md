# NZ Travel 專案安全修補（第二步，第一批）

## 目標
延續第一步，優先把「日程頁高風險互動」從 inline handler 改成事件委派，降低屬性注入與維護風險。

## 本次完成項目
- 將 `renderDay()` 中下列互動改為 `data-action` + 統一事件處理：
  - 新增行程（含插入與 append）
  - 上下移動行程項目
  - 開啟記憶上傳
  - 開啟地圖/圖片設定
  - 刪除行程項目
- 將 timeline 地圖卡片改為資料屬性驅動：
  - 由 `onclick="updateMapQuery(...)"` 改為 `data-map-query` / `data-custom-img`
  - 透過集中 click handler 觸發 `updateMapQuery`
- 新增安全解碼 helper：
  - `decodeInlineArg()`，避免 malformed URI 造成 runtime 例外
- 新增集中處理器：
  - `handleContentDisplayClick()`
  - 僅在 `#content-display` 範圍內處理，避免污染其他區塊
- 第二批：移除 `handleEdit` 相關 inline `oninput`
  - `renderOverview()` / `renderDay()` 的 `contenteditable` 欄位改為 `data-edit-*` 屬性
  - 新增 `handleContentDisplayInput()` 事件委派，統一呼叫 `handleEdit(...)`
  - click handler 會忽略 `contenteditable="true"`，避免編輯時誤觸地圖卡
  - 使用 capture 階段攔截 editable click 冒泡，避免觸發總覽卡片導頁

## 影響檔案
- `/Users/pierre.kao/Repositories/nz-travel/index.html`

## 驗收建議
1. 在日程頁操作「新增/移動/刪除」仍正常。
2. 點擊 timeline 卡片仍可更新右側地圖/景點圖。
3. 點擊相機按鈕仍可開啟上傳。
4. 在總覽與日程頁編輯標題/城市/timeline，確認內容可即時存檔。
5. 開啟瀏覽器 console，確認上述互動沒有新錯誤。

## 後續建議
- 將 converter 的 `oninput` 也收斂到事件委派（目前仍是 inline）。
- 逐步將其餘 `onclick`（header / modal / drawer）收斂到統一事件層。
