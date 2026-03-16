# NZ Travel 專案安全修補（第一步）

## 目標
先完成高風險區域的最小可行防護：
1. 匯入資料 schema 驗證與資料正規化
2. 主要使用者輸入淨化（文字、地圖查詢、圖片 URL）
3. 修補最關鍵的 template/inline 參數注入點

## 本次完成項目
- 新增共用安全工具函式（`index.html`）
  - `sanitizeTextInput` / `sanitizeMapQuery` / `sanitizeImageUrl`
  - `sanitizeMemoryImageSource`
  - `encodeInlineArg`
  - `buildGoogleMapsEmbedUrl` / `buildGoogleMapsSearchUrl`
- 導入 itinerary 正規化流程
  - 新增 `normalizeItineraryPayload` 與相關 helper
  - 啟動時改用 `loadInitialItinerary()` 讀取並淨化 `localStorage`
  - `saveItinerary()` 改為先 normalize 再寫入
- 匯入流程強化
  - `importItinerary()` 不再直接信任 JSON，改為 normalize 後才套用
- 編輯流程強化
  - `handleEdit()` 依欄位套用對應的長度/格式淨化
  - `editMapSettings()` 套用 map query 與 image URL 淨化
- 記憶照片區塊改為安全 DOM 渲染
  - `loadSpotMemories()` 不再用字串 `innerHTML` 拼接使用者內容
  - 刪除按鈕改 `addEventListener` 綁定，避開 inline 注入風險
  - `handleMemoryUpload()` 新增上傳型別檢查（阻擋 SVG）
- 地圖動態參數注入點修補
  - timeline 卡片 `onclick` 參數改為 `encodeURIComponent/decodeURIComponent` 流程
  - day map 連結/iframe 改走 URL builder，避免拼接未淨化 query
- 內容貼上防護
  - 新增 contenteditable `paste` 攔截，僅保留純文字並先淨化

## 影響檔案
- `/Users/pierre.kao/Repositories/nz-travel/index.html`

## 驗收建議
1. 進入編輯模式，嘗試輸入 `<img src=x onerror=alert(1)>`，確認不會被當成 HTML 執行。
2. 在「導入/導出」貼入異常 JSON（例如錯誤欄位型別），應顯示導入失敗。
3. timeline 地圖點擊仍能正常開地圖，包含中文與帶符號文字。
4. 上傳記憶照片：PNG/JPG 可用，SVG 應被阻擋。

## 下一步（第二步）
- 全面移除 inline handler（`onclick/oninput`）改成事件委派。
- 把大段 `innerHTML` 渲染逐步改成 DOM API 或受控 template。
- 補 UI/E2E 測試，覆蓋匯入驗證與 XSS 回歸測試案例。
