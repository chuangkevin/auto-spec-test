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
