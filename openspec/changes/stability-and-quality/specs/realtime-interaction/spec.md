# Realtime Interaction

## 需求
- 點擊截圖後 200ms 內看到更新（不再等 500ms polling）
- 支援在截圖上打字（所有可列印字元 + Enter/Tab/Escape/Backspace）
- 手動模式下 WS 即時推送每次操作後的截圖
- 非手動模式維持原有 interval 串流（不增加頻寬）

## 驗收條件
- [ ] 點擊後截圖透過 WS push 更新（不再用 setTimeout + GET）
- [ ] 在 input 欄位打字能即時反映在截圖中
- [ ] Backspace 能刪除字元
- [ ] Enter 能送出表單
- [ ] 手動登入我們自己的系統（選 admin → 進到首頁）全程流暢
- [ ] 手動登入需要密碼的網站（輸入帳密 → 點登入）全程流暢
