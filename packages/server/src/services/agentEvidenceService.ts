export interface AgentEvidenceBlockInput {
  rawSpecText?: string;
  specContent?: string;
  skillsContent?: string;
  discussionText?: string;
  includeLivePageEvidence?: boolean;
}

export function buildEvidenceHierarchyBlock({
  rawSpecText,
  specContent,
  skillsContent,
  discussionText,
  includeLivePageEvidence = true,
}: AgentEvidenceBlockInput): string {
  const availableSources: string[] = [];

  if (includeLivePageEvidence) availableSources.push('Live page evidence（截圖 / DOM / explored behaviors）');
  if (rawSpecText) availableSources.push('Raw spec text');
  if (specContent) availableSources.push('Parsed spec outline');
  if (skillsContent) availableSources.push('Skills');
  if (discussionText) availableSources.push('Discussion summary');

  if (availableSources.length === 0) return '';

  return `## Evidence Hierarchy（證據優先順序）

請按以下優先順序理解上下文，不要把所有資訊視為同等可信：

1. **Live page evidence**：截圖、DOM、實際探索到的互動行為
2. **Raw spec text**：使用者上傳的規格書原文
3. **Parsed spec outline**：AI 解析出的規格書大綱
4. **Skills**：領域知識與既有 learnings（若內容標示未驗證，僅供參考）
5. **Discussion summary**：AI 討論整理出的測試建議與風險

如果高優先級證據與低優先級證據衝突，**一律以高優先級證據為準**。

目前可用來源：${availableSources.join(' > ')}
`;
}

export function buildJudgeEvidenceBlock(): string {
  return `## Evidence Hierarchy（Judge）

請按以下優先順序評判，不要把所有資訊視為同等可信：

1. **Step execution record**：每一步是否成功、錯在哪裡
2. **Final page observation**：最終截圖中的 URL、內容、畫面狀態
3. **Test case expectation**：此案例原本想驗證的結果

如果步驟記錄、截圖觀察與上游假設衝突，**以步驟記錄與最終頁面觀察為準**。
Judge 不需要重新相信 skills 或 discussion，只需要根據執行後證據做判斷。
`;
}

export function buildLearningEvidenceBlock(skillNames: string[]): string {
  const availableSkills = skillNames.length > 0 ? skillNames.join(', ') : '（無可用 project skills）';

  return `## Evidence Hierarchy（Dream Learning）

請按以下優先順序分析失敗並決定是否更新 skill：

1. **Failed test evidence**：失敗案例的 actualResult 與 error
2. **Current project skills**：目前可更新的 skill 清單與命名

如果失敗證據顯示是真正頁面 bug，**不得為了迎合既有 skill 而修改 skill**。
可用 skills：${availableSkills}
`;
}
