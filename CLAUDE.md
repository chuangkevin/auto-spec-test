# auto-spec-test — Harness Engineering Guide

AI 驅動的規格測試平台。PM/QA 上傳規格書，系統自動生成 Playwright 測試並執行，透過 Gemini 多 Agent 協作完成整個測試生命週期。

## Architecture Overview

```
pnpm monorepo
├── packages/server/   Fastify 5 backend (ESM, TypeScript)
├── packages/web/      Next.js 16 frontend (React 19, App Router)
└── e2e/               Playwright E2E tests
```

**Runtime stack:** Node 24 + Playwright Chromium, behind nginx reverse proxy, deployed as Docker image (`kevin950805/auto-spec-test`).

**Database:** SQLite via `better-sqlite3` — migrations in `packages/server/src/db/migrations/`. Run automatically on startup.

---

## Core Subsystems

### 1. Skill Loading

`skillService.ts` manages domain knowledge chunks stored in the `agent_skills` table.

- **Load:** `skillService.getActive()` — returns enabled skills ordered by `order_index`.
- **Inject:** `skillService.formatSkillsForPrompt(skills)` / `formatProjectSkillsForPrompt(projectId)` — formats skills into prompt blocks.
- **Project skills:** Auto-generated from spec content via `generateFromSpec(projectId, specContent)`.
- **Verification:** Skills extracted from specs are cross-checked against the spec text (≥50% URL pattern match → `verified=1`). Unverified skills show a ⚠ warning in prompts.

### 2. AI Filtering (selectRelevant)

`skillService.selectRelevant(pageUrl, pageTitle)` uses Gemini to filter which skills are relevant before injection:

- ≤3 active skills → inject all.
- >3 → lightweight Gemini call (name + description only, `maxOutputTokens: 50`) returns comma-separated indices.
- Falls back to first 3 on API error.
- Rule: only inject **frontend/C-side UX skills**; exclude backend cron jobs, DB sync, admin panel internals.

### 3. Dream Feedback Loop

`skillService.dream(projectId, testResults)` — called after a test run completes:

1. Collects failed test cases.
2. Calls Gemini to classify each failure:
   - `selector_issue` — wrong selector, update skill
   - `url_format_issue` — bad URL pattern, update skill
   - `spec_mismatch` — test expectation wrong, update skill
   - `real_bug` — actual page bug, **do not** modify skill
3. Appends a dated learning note to the relevant project skill (`content || ?`).
4. Never modifies skills for `real_bug` category.

### 4. Playwright Scanning Pipeline

`pageScannerService.ts` + `explorerService.ts`:

1. **explorerService** discovers page elements and navigates deep links.
2. **pageScannerService** orchestrates multi-agent collaboration:
   - Agent roles: Explorer, Echo, Lisa, Bob (judge personas)
   - Generates test cases → executes → judges results
3. **browserService** pools Playwright browser instances (limit: `MAX_BROWSER_SESSIONS` env, default 3).
4. Test execution streams via WebSocket (`/api/ws`) to the frontend in real-time.

### 5. Gemini Key Pool

`geminiKeys.ts` manages a pool of API keys (comma-separated `GEMINI_API_KEY`). Round-robin selection with usage tracking (`trackUsage`). Model: `GEMINI_MODEL` (default `gemini-2.5-flash`). Retry on 503 via `@kevinsisi/ai-core`.

---

## API Routes (`packages/server/src/routes/`)

| Route | Purpose |
|-------|---------|
| `POST /api/auth/login` | JWT login |
| `GET /api/projects` | List projects |
| `POST /api/projects` | Create project |
| `GET /api/specifications/:id` | Fetch parsed spec |
| `POST /api/specifications` | Upload spec (DOCX/XLSX/text) |
| `GET /api/test-scripts/:projectId` | List generated test scripts |
| `POST /api/test-runner/run` | Start test execution |
| `GET /api/test-runner/status/:runId` | Check run status |
| `GET /api/skills` | List all agent skills |
| `POST /api/skills` | Create skill |
| `POST /api/skills/batch` | Batch import skills |
| `PATCH /api/skills/:id/toggle` | Enable/disable skill |
| `GET /api/settings` | System settings |
| `WS /api/ws` | Real-time test stream |

All routes except `/api/auth/*` require `Authorization: Bearer <jwt>`.

---

## Deployment

### Local Dev

```bash
pnpm install
cp .env.example .env   # fill GEMINI_API_KEY, JWT_SECRET
pnpm dev               # concurrently: server (3001) + web (3000 via Next.js)
```

### Docker (Production)

```bash
docker compose up -d
# Exposes port 8223 → nginx:3000 → Fastify:3001 / Next.js:3002
```

Data volume: `./data:/app/packages/server/data` (SQLite db lives here).

### CI/CD (GitHub & Gitea)

- **GitHub Actions**:
  - `docker-publish.yml`: 推送 Docker Hub (`kevin950805/auto-spec-test`)。
  - `deploy.yml`: 透過 Tailscale SSH 部署。
- **Gitea Actions**:
  - `docker-build.yaml`: 推送內部 Registry 並同步 ArgoCD。
- **Network Compatibility**: `package.json` 指向 GitHub。Gitea CI 透過 `INTERNAL_GIT_MIRROR` (ARG) 使用 Git `insteadOf` 重導向至內網鏡像。
- **Docker build**: Gitea Runner 需加 `--network=host`。
- **Cleanup**: 部署前需清理 `auto-spec-test` 與舊的 `autospectest` 容器避免命名衝突。

### Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | — (comma-separated pool) |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` |
| `JWT_SECRET` | Yes | — |
| `PORT` | No | `3001` |
| `MAX_BROWSER_SESSIONS` | No | `3` |
| `TZ` | No | `Asia/Taipei` |
| `DEFAULT_ADMIN_USERNAME` | No | `admin` |
| `DEFAULT_ADMIN_PASSWORD` | No | `admin123` |

---

## Development Constraints

- **Do not upgrade existing packages** — use exact versions as committed. The `better-sqlite3` native module and `@kevinsisi/ai-core` GitHub dep are sensitive to version changes.
- **pnpm only** — do not use npm or yarn. Run `pnpm install` from root.
- **ESM throughout** — server package uses `"type": "module"`. Use `.js` extensions in imports even for `.ts` source files.
- **No default admin in production** — set strong `DEFAULT_ADMIN_PASSWORD` and `JWT_SECRET` via environment.
- **SQLite migrations** — add new migrations as `packages/server/src/db/migrations/0NN-description.sql`. They run in numeric order on startup.
- **Playwright sessions** — always return sessions to the pool; leaking a session will block test runs when the pool is exhausted.
- **dream() is async fire-and-forget** — do not await it in the test-runner hot path.
- **Gemini prompts** — temperature 0 for deterministic classification tasks, 0.2 max for generation. Keep prompt tokens low for skill filtering (no content, only name+description).
- **Next.js 16 breaking changes** — read `node_modules/next/dist/docs/` before touching frontend; APIs differ significantly from Next.js 13/14.

---

## Testing

```bash
pnpm test              # Vitest unit tests (server)
pnpm test:e2e          # Vitest E2E (starts server, runs against it)
pnpm test:e2e:ui       # Playwright UI mode
pnpm test:e2e:headed   # Playwright headed mode
```

E2E tests use `playwright.config.ts` at repo root. The server webServer config auto-starts Fastify before tests run.

---

## OpenSpec Changes

Active design proposals live in `openspec/changes/`. Key in-flight changes:

- `agent-skill-system` — skill injection + management overhaul
- `claude-code-patterns-integration` — auto-dream, skeptical evaluation, skill validation, test-plan versioning
- `qa-agent-overhaul` — flow-based test generation, state-aware evaluation
- `stability-and-quality` — DOM-based scanning, production server improvements

Use `/openspec-apply-change` to implement tasks from a change.
