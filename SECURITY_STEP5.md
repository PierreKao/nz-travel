# NZ Travel 專案安全修補（第五步，清空剩餘 inline 事件）

## 目標
把剩餘動態區塊（overview / sky conditions / checklist / notice board）的 inline 事件全部收斂，完成「零 inline 事件屬性」。

## 本次完成項目
- Notice board 卡片
  - `onclick="showNoticeModal(idx)"` 改為 `data-ui-action="show-notice-modal" + data-notice-idx`。
- Sky conditions / Aurora / Milky Way 區塊
  - 切換、refresh、stop 選擇、開啟銀河視窗等按鈕改為 `data-action`。
- Overview 卡片
  - 切換 day 的卡片 click 改為 `data-action="open-overview-day"`。
- Checklist
  - Group toggle 按鈕改為 `data-action="toggle-checklist-group"`。
  - Checkbox `onchange` 改為 `data-action="toggle-checklist-item"` + `change` 委派。
- Password Enter 提交
  - 移除 input 的 inline `onkeydown`。
  - 改由 `handleGlobalUIKeydown()` 監聽 `#modal-password-input` 的 Enter。
- 擴充委派處理器
  - `handleContentDisplayClick()` 新增 sky/overview/checklist 相關 action 分派。
  - `handleContentDisplayChange()` 新增 checklist checkbox 分派。
  - `handleGlobalUIClick()` 新增 notice card action 分派。

## 影響檔案
- `/Users/pierre.kao/Repositories/nz-travel/index.html`

## 驗收建議
1. 總覽卡片可點擊進入對應 Day。
2. Notice board 卡片可打開對應說明視窗。
3. Sky conditions 展開/收合、日期切換、refresh 都可運作。
4. Milky Way 時段按鈕可打開細節視窗。
5. Checklist 單項與全選/全不選皆可運作且進度更新。
6. 密碼輸入框按 Enter 可提交解鎖。

## 進度說明
- inline 事件屬性統計：
  - `onclick=...`：`0`
  - `oninput=...`：`0`
  - `onchange=...`：`0`
  - `onkeydown=...`：`0`

## 後續建議
- 進一步把 `innerHTML` 大片段模板拆成更可測試的 component/render helper。
- 補 E2E 測試覆蓋委派事件（特別是 modal 行為與 checklist）。
