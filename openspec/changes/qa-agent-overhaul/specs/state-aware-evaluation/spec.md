## ADDED Requirements

### Requirement: 評判接收完整步驟執行記錄
測試評判（法官 A/B/C）SHALL 接收完整的步驟執行摘要，而非僅最終截圖。摘要包含每步的動作、目標 selector、成功/失敗狀態。

#### Scenario: 步驟全部成功時的評判
- **WHEN** 測試案例的所有步驟都成功執行（click 成功、fill 成功、頁面跳轉正確）
- **THEN** 法官 SHALL 基於步驟記錄 + 最終截圖綜合判斷 PASS/FAIL，而非僅看最終截圖

#### Scenario: 步驟執行失敗時的評判
- **WHEN** 測試案例的某個步驟執行失敗（selector timeout、元素不可點擊）
- **THEN** 法官 SHALL 判定 FAIL，且 actualResult 中 SHALL 明確指出是哪個步驟失敗及原因

### Requirement: 頁面狀態上下文
評判 prompt SHALL 包含頁面狀態上下文（當前 URL、頁面標題、已知的使用者登入狀態），協助法官做出正確判斷。

#### Scenario: 正確行為不誤判為 FAIL
- **WHEN** 測試預期「未登入被重導至登入頁」但使用者已登入且能正常訪問
- **THEN** 法官 SHALL 基於狀態上下文判定此為測試案例設計問題，而非標記為 Bug

#### Scenario: 導航後 URL 變化的評判
- **WHEN** 測試步驟包含點擊導航連結，URL 從 /page-a 變為 /page-b
- **THEN** 法官 SHALL 在 actualResult 中描述 URL 變化，而非僅說「頁面發生變化」

### Requirement: 評判結果格式改進
actualResult SHALL 包含具體的觀察描述，不使用模糊語句。

#### Scenario: 具體的 PASS 描述
- **WHEN** 法官判定 PASS
- **THEN** actualResult SHALL 描述具體觀察（如「點擊登入後跳轉至 /dashboard，顯示歡迎訊息」），而非「測試通過」

#### Scenario: 具體的 FAIL 描述
- **WHEN** 法官判定 FAIL
- **THEN** actualResult SHALL 描述具體差異（如「預期跳轉至 /dashboard，實際停留在 /login，頁面顯示錯誤訊息 '帳號不存在'」）
