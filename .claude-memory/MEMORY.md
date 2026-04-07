# auto-spec-test — Claude Memory

Project memory for AI agents working on this codebase.

---

## Project Identity

- **Name:** auto-spec-test
- **Purpose:** AI-driven spec testing platform. PMs/QA upload specs → system auto-generates and executes Playwright tests using Gemini multi-agent collaboration.
- **Version:** 0.1.7 (see root `package.json`)
- **Docker Image:** `kevin950805/auto-spec-test` (linux/arm64)
- **Production port:** 8223 (nginx) → 3001 (Fastify) / 3002 (Next.js)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 + React 19 + Tailwind CSS 4 (App Router) |
| Backend | Fastify 5 (ESM, TypeScript) |
| Database | SQLite via `better-sqlite3` |
| AI | Gemini 2.5 Flash via `@google/generative-ai` + `@kevinsisi/ai-core` |
| Browser | Playwright 1.58.2 (Chromium) |
| Package Manager | pnpm workspaces |

---

## Key Files

| File | Role |
|------|------|
| `packages/server/src/services/skillService.ts` | Skill CRUD, AI filtering (`selectRelevant`), prompt injection, `dream()` learning loop |
| `packages/server/src/services/pageScannerService.ts` | Multi-agent test generation + judgment |
| `packages/server/src/services/explorerService.ts` | Page element discovery + deep navigation |
| `packages/server/src/services/browserService.ts` | Playwright session pool (`MAX_BROWSER_SESSIONS`) |
| `packages/server/src/services/geminiKeys.ts` | API key pool management + usage tracking |
| `packages/server/src/db/migrations/` | SQL migrations (001–009), run on startup in numeric order |
| `playwright.config.ts` | Root E2E config |
| `openspec/changes/` | Active design proposals |

---

## Critical Rules (Never Violate)

1. **Do not upgrade existing packages** — `better-sqlite3` (native) and `@kevinsisi/ai-core` (GitHub dep) are fragile.
2. **pnpm only** — no npm/yarn.
3. **ESM server** — `"type": "module"`. Use `.js` extensions in imports even for `.ts` source.
4. **dream() is fire-and-forget** — never `await` it in the test-runner hot path.
5. **Gemini temperature discipline** — 0 for classification, ≤0.2 for generation.
6. **Playwright pool discipline** — always return browser sessions to the pool.
7. **Next.js 16 has breaking changes** — read `node_modules/next/dist/docs/` before editing frontend code.
8. **New DB columns → new migration file** — never edit existing migration files.

---

## AI Subsystem Summary

### Skill Loading Flow
```
spec upload → generateFromSpec() → [verify against spec text] → agent_skills table
test run start → selectRelevant(url, title) → formatSkillsForPrompt() → injected into agent prompt
```

### AI Filtering (selectRelevant)
- ≤3 active skills: inject all
- >3: lightweight Gemini call (name+description only, `maxOutputTokens: 50`)
- Fallback: first 3 on error
- Filter rule: frontend/C-side UX only, exclude backend internals

### Dream Feedback Loop
- Triggered post-test-run with failed test results
- Categories: `selector_issue`, `url_format_issue`, `spec_mismatch`, `real_bug`
- Only updates skill content for non-`real_bug` categories
- Appends dated learning note to `agent_skills.content`

### Playwright Scanning
- `explorerService` discovers elements + deep links
- `pageScannerService` runs multi-agent: Explorer → Echo → Lisa → Bob
- Real-time streaming via WebSocket to frontend

---

## OpenSpec Changes In Progress

| Change | Focus |
|--------|-------|
| `agent-skill-system` | Skill injection + management overhaul |
| `claude-code-patterns-integration` | auto-dream, skeptical evaluation, skill validation, test-plan versioning |
| `qa-agent-overhaul` | Flow-based test generation, state-aware evaluation |
| `stability-and-quality` | DOM-based scanning, production server |
| `project-skill-auto-generation` | Auto-generate project skills from spec |

---

## Dev Commands

```bash
pnpm dev                # server (3001) + web (Next.js dev)
pnpm build              # compile server TS + Next.js build
pnpm test               # Vitest unit tests
pnpm test:e2e           # Vitest E2E
pnpm lint               # ESLint (server + web)
pnpm format             # Prettier write
pnpm format:check       # Prettier check (CI)
```

---

## Deployment

- CI: GitHub Actions `docker-publish.yml` → builds arm64 image on push to main
- Deploy: `deploy.yml` → Tailscale SSH → `docker compose pull && up -d`
- Health check: 24 retries against `http://localhost:8223`
- Data persistence: `./data:/app/packages/server/data` volume (SQLite)
