# DOM-Based Scanning

## 需求
- AI 掃描頁面時，提供完整 DOM 結構（不只元素列表）
- 每個元素包含：id、class、data-testid、aria-label、父子關係
- DOM tree 限制：深度 3 層、每層最多 20 個元素
- AI 產出的 selector 優先使用 id > data-testid > aria-label > class
- selector 準確率目標：80%（10 個 TC 中 8 個能正確操作目標元素）

## 驗收條件
- [ ] `getInteractiveElements` 回傳完整 DOM 結構（含 id/class/parent）
- [ ] AI prompt 包含 DOM tree 而非只有 flat list
- [ ] 對 example.com 掃描：所有 selector 有效
- [ ] 對 buy.houseprice.tw 掃描：80% selector 有效
- [ ] DOM tree 不超過 Gemini token limit（32K output）
