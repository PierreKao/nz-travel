# NZ Travel 專案安全修補（第四步，Modal 收斂）

## 目標
把 modal 系列的 inline `onclick` 全部改為統一事件委派，降低注入面並集中行為控制。

## 本次完成項目
- Password modal
  - backdrop 關閉、右上角關閉、確認解鎖按鈕改為 `data-ui-action`。
- Print choice modal
  - backdrop、關閉、列印（含照片/僅行程）按鈕改為 `data-ui-action`。
- Date modal
  - backdrop、確認設定按鈕改為 `data-ui-action`。
- Notice modal
  - backdrop、右上角關閉、內文「我知道了」按鈕改為 `data-ui-action`。
- Converter modal
  - backdrop、右上角關閉按鈕改為 `data-ui-action`。
- Flight modal
  - backdrop、右上角關閉、官網按鈕（`window.open`）改為 `data-ui-action`。
- Import/Export modal
  - backdrop、右上角關閉、複製、確認導入按鈕改為 `data-ui-action`。
- Reset modal
  - backdrop、確認重置、取消按鈕改為 `data-ui-action`。
- Milky Way detail modal
  - backdrop、右上角關閉按鈕改為 `data-ui-action`。
- Spot visual overlay
  - 「查看地圖」按鈕（原 `hideSpotVisual()`）改為 `data-ui-action`。
- 擴充全域 click 委派 `handleGlobalUIClick()`
  - 新增上述 action 的完整分派處理。

## 影響檔案
- `/Users/pierre.kao/Repositories/nz-travel/index.html`

## 驗收建議
1. 逐一開啟各 modal，測試 backdrop 與右上角關閉按鈕。
2. Password modal 確認按鈕可正常觸發解鎖。
3. Print modal 兩個列印按鈕都可正常動作。
4. IO modal 的「複製內容 / 確認導入」可正常執行。
5. Reset modal 的「確認重置 / 取消」可正常執行。
6. Flight modal 官網按鈕可開啟紐航官網新分頁。

## 進度說明
- inline `onclick`：`37 -> 10`
- inline `oninput`：`0`

## 後續建議
- 下一批優先處理 overview / sky conditions / checklist 的動態 `onclick`。
