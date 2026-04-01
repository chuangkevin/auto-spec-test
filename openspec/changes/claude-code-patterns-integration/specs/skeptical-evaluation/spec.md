## ADDED Requirements

### Requirement: 法官以截圖為準，skill 僅供參考
評判 AI SHALL 把 skill 領域知識視為參考而非絕對真理，以截圖實際觀察為最終判斷依據。

#### Scenario: 截圖與 skill 一致
- **WHEN** 截圖顯示的頁面行為符合 skill 描述的規則
- **THEN** 法官 SHALL 判定 PASS 並引用 skill 佐證

#### Scenario: 截圖與 skill 矛盾
- **WHEN** 截圖顯示的頁面行為與 skill 描述矛盾
- **THEN** 法官 SHALL 以截圖為準，在 actualResult 中標注「與領域知識不符」而非直接判 FAIL

#### Scenario: skill 聲稱功能存在但截圖沒有
- **WHEN** skill 說「頁面應有分頁功能」但截圖中看不到分頁元件
- **THEN** 法官 SHALL 標注「截圖中未觀察到」而非判定為 bug
