# NZ Travel 專案安全修補（第六步，事件委派收尾）

## 目標
完成事件層收斂收尾，把 remaining dynamic section 的 inline 事件全部移除，達成事件屬性 0。

## 本次完成項目
- Notice board
  - 卡片 click 由 inline 改為 `data-ui-action="show-notice-modal"`。
- Sky conditions / Aurora / Milky Way
  - 展開、refresh、stop 切換、銀河時段詳情按鈕改為 `data-action`。
- Overview day cards
  - 卡片切換改為 `data-action="open-overview-day"`。
- Checklist
  - Group 切換改為 `data-action="toggle-checklist-group"`。
  - Checkbox `onchange` 改為 `data-action="toggle-checklist-item"` + `change` 事件委派。
- Password Enter
  - 移除 `onkeydown`，新增 `handleGlobalUIKeydown()` 監聽 Enter 提交。
- 委派處理器擴充
  - `handleContentDisplayClick()` 支援 sky/overview/checklist action。
  - `handleContentDisplayChange()` 處理 checklist checkbox。
  - `handleGlobalUIClick()` 支援 notice board action。

## 影響檔案
- `/Users/pierre.kao/Repositories/nz-travel/index.html`

## 驗收建議
1. 總覽卡片可以切換到對應 Day。
2. Notice 卡片可開啟對應 modal。
3. Sky conditions 展開、refresh、stop 切換正常。
4. Milky Way 時段按鈕可開 detail modal。
5. Checklist 勾選、全選/全不選都正常且會更新進度。
6. 密碼輸入框按 Enter 可提交。

## 最終統計
- `onclick=...`：0
- `oninput=...`：0
- `onchange=...`：0
- `onkeydown=...`：0

## 後續建議
- 把目前 `if (action === ...)` 轉為 action map，降低維護成本。
- 補 E2E 回歸（尤其 checklist checkbox + modal close/backdrop）。
