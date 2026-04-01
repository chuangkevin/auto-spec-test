## ADDED Requirements

### Requirement: 測試完成後自動分析失敗並更新 skill
系統 SHALL 在測試完成且有失敗案例時，自動分析失敗原因並更新 project skill。

#### Scenario: 觸發條件
- **WHEN** 測試執行完成且 failed_cases > 0
- **THEN** SHALL 非同步觸發 dream 流程

#### Scenario: 全 PASS 不觸發
- **WHEN** 測試執行完成且所有案例 PASS
- **THEN** SHALL NOT 觸發 dream

#### Scenario: 分類失敗原因
- **WHEN** dream 分析失敗的測試案例
- **THEN** SHALL 分類為：selector_issue / url_format_issue / spec_mismatch / real_bug

#### Scenario: 自動更新 skill
- **WHEN** 失敗原因為 selector_issue 或 url_format_issue
- **THEN** SHALL 在對應 project skill 的 content 尾部附加學習到的資訊（如「注意：此 selector 在實際頁面中無效」）

#### Scenario: 真正的 bug 不動 skill
- **WHEN** 失敗原因為 real_bug
- **THEN** SHALL NOT 修改 skill，保留原始報告
