import { describe, expect, it } from 'vitest';

import { buildEvidenceHierarchyBlock, buildJudgeEvidenceBlock, buildLearningEvidenceBlock } from '../agentEvidenceService.js';
import { TestOrchestrator } from '../testOrchestrator.js';

describe('agentEvidenceService', () => {
  it('buildEvidenceHierarchyBlock describes ordered evidence sources', () => {
    const block = buildEvidenceHierarchyBlock({
      rawSpecText: 'raw spec',
      specContent: 'parsed spec',
      skillsContent: 'skills',
      discussionText: 'discussion',
    });

    expect(block).toContain('Evidence Hierarchy');
    expect(block).toContain('1. **Live page evidence**');
    expect(block).toContain('2. **Raw spec text**');
    expect(block).toContain('5. **Discussion summary**');
    expect(block).toContain('Raw spec text > Parsed spec outline > Skills > Discussion summary');
  });

  it('formatDiscussionForPrompt emits structured coverage checklist', () => {
    const orchestrator = new TestOrchestrator();
    const prompt = orchestrator.formatDiscussionForPrompt([
      {
        name: 'Echo',
        role: 'QA 策略師',
        avatar: '🎯',
        message: '先看主要流程。',
        focusAreas: ['主要使用者流程', '權限控制'],
        risks: ['流程只驗表面'],
        evidenceBasis: ['規格書', '截圖'],
      },
      {
        name: 'Lisa',
        role: '前端技術專家',
        avatar: '💻',
        message: '注意 selector。',
        focusAreas: ['權限控制', '導航行為'],
        risks: ['selector 不穩定'],
        evidenceBasis: ['DOM'],
      },
    ]);

    expect(prompt).toContain('## 聚合後的 Focus Areas');
    expect(prompt).toContain('主要使用者流程');
    expect(prompt).toContain('權限控制');
    expect(prompt).toContain('selector 不穩定');
    expect(prompt).toContain('各 Agent 主要證據依據');
    expect(prompt).toContain('Echo: 規格書、截圖');
    expect(prompt).toContain('Lisa: DOM');
  });

  it('buildJudgeEvidenceBlock prefers execution record and final observation', () => {
    const block = buildJudgeEvidenceBlock();

    expect(block).toContain('Evidence Hierarchy（Judge）');
    expect(block).toContain('1. **Step execution record**');
    expect(block).toContain('2. **Final page observation**');
  });

  it('buildLearningEvidenceBlock prefers failed evidence over current skills', () => {
    const block = buildLearningEvidenceBlock(['url-format-rules', 'selector-rules']);

    expect(block).toContain('Evidence Hierarchy（Dream Learning）');
    expect(block).toContain('1. **Failed test evidence**');
    expect(block).toContain('2. **Current project skills**');
    expect(block).toContain('url-format-rules, selector-rules');
  });
});
