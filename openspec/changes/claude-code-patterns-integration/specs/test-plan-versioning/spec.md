## ADDED Requirements

### Requirement: 測試計畫版本記錄
系統 SHALL 在每次 scan 產出測試計畫時，自動存為一個版本記錄。

#### Scenario: 自動存版
- **WHEN** scan 完成產出 testPlan
- **THEN** SHALL 儲存 test_plan_versions 記錄，包含 project_id、version 號（遞增）、testPlan JSON、components JSON、URL

#### Scenario: 查看版本歷史
- **WHEN** 使用者在專案頁面查看測試計畫歷史
- **THEN** SHALL 顯示所有版本（版號、建立時間、測試案例數量），可點擊查看詳情

#### Scenario: 回滾使用舊版
- **WHEN** 使用者選擇歷史版本並點擊「使用此版本」
- **THEN** SHALL 把該版本的 testPlan 載入到執行面板，可直接開始測試
