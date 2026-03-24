# API Key Pool 管理

參考 project-bridge 的 `geminiKeys.ts` 設計。

## Key 儲存
- 支援從環境變數 `GEMINI_API_KEY` 載入（逗號分隔多個）
- 支援從資料庫 settings 表載入
- 去重 + 格式驗證（Gemini key 以 `AIza` 開頭，長度 39）

## 輪替策略
- Round-robin 輪替分配
- 記憶體快取，60 秒 TTL
- 支援即時失效重載

## 限流處理
- 偵測 429 / RESOURCE_EXHAUSTED 錯誤
- 自動排除失敗 key，隨機選擇其他可用 key
- 最多重試 2 次，間隔 3 秒

## 用量追蹤
- 記錄每次 API 呼叫的 token 使用量（prompt / completion / total）
- 按 key 後綴（末 4 碼）聚合統計
- 支援按日 / 週 / 月查看用量

## 管理介面
- 新增 key（驗證後加入 pool）
- 刪除 key（環境變數 key 只能封鎖，資料庫 key 可直接移除）
- 查看各 key 的用量統計
