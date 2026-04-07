# CI/CD Fix for Hybrid Environments

## Problem Statement
自 `8adf391` commit 以後，Gitea CI 與 GitHub CD 出現失敗。
主要原因：
1. `ai-core` 依賴 URL 指向 Gitea，造成 Docker build 內部無法存取。
2. 部署時發生容器名稱衝突（`autospectest` 與 `auto-spec-test`）。

## Proposed Solution
- **依賴管理**: 統一使用 GitHub URL，並透過 `INTERNAL_GIT_MIRROR` (Git insteadOf) 支援內網鏡像。
- **清理與穩定**: 在部署腳本中增加對舊容器名稱的清理，並確保 Dockerfile 支援鏡像 ARG。

## Success Criteria
- [x] Gitea CI 成功建置並 Push
- [x] GitHub Actions CD 成功部署至伺服器
- [x] 內外網環境共用同一套代碼配置
