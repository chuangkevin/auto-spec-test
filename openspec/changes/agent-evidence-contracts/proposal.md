## Why

`auto-spec-test` 已經具備多 Agent 討論、測試生成、評判與 dream 學習，但各 Agent 之間的上下文仍主要靠自由文字 prompt 串接。這讓證據優先順序、討論重點可追溯性、以及後續除錯成本都偏高。

目前系統已經在局部採用 evidence-first / skeptical-memory 思路，但還缺少一個一致的 agent contract：
- 討論 Agent 的輸出缺少結構化重點與依據
- scanPage prompt 雖然同時吃 raw spec / parsed spec / skills / discussion，但沒有統一的證據層級說明
- 後續 agent 想引用前序結論時，無法明確區分「觀察到的證據」與「推測性建議」

## What Changes

- 新增 `agent-evidence-contracts` capability，定義 Agent 討論輸出的結構化 contract
- 定義 scan/test generation 階段的 evidence hierarchy，明確規定 raw runtime evidence、raw spec、parsed spec、skills、discussion 的優先順序
- 後端討論流程改為產出結構化欄位（focus areas / risks / evidence basis），並在掃描 prompt 中以標準化 evidence block 注入

## Impact

- 讓測試生成更可追溯：能看出某個測試方向是從哪個 Agent、哪類證據來的
- 降低 prompt 漂移：不同 agent 使用相同的 evidence ordering 規則
- 為後續擴充 judge / dream / history provenance 奠定基礎
