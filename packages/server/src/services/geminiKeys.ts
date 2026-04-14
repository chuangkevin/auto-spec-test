import db from '../db/connection.js';

export interface GeminiPoolState {
  id: number;
  key: string;
  isActive: boolean;
  cooldownUntil: number;
  usageCount: number;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';

const AI_KEYS_SETTING_KEYS = ['ai_runtime_api_keys', 'gemini_api_keys', 'gemini_api_key'] as const;
const AI_MODEL_SETTING_KEYS = ['ai_runtime_model', 'gemini_model'] as const;

let cachedKeys: string[] = [];
let keyIndex = 0;
let lastLoadTime = 0;
const CACHE_TTL = 60_000; // reload from DB every 60s

/** 追蹤每把 key 的 429 cooldown（key → cooldown 結束時間） */
const keyCooldowns = new Map<string, number>();
const COOLDOWN_MS = 60_000; // 429 後冷卻 60 秒

/** Check if a key looks like a real API key (not a placeholder) */
export function isValidKeyFormat(key: string): boolean {
  // Gemini keys start with "AIza" and are 39 chars
  // Reject obvious placeholders like "your-api-key-here", "xxx", "placeholder", etc.
  if (key.length < 20) return false;
  if (/^(your|placeholder|test|example|dummy|fake|xxx|change.?me)/i.test(key)) return false;
  return true;
}

/** Load blocked key suffixes from DB */
function loadBlockedSuffixes(): Set<string> {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'blocked_api_keys'").get() as any;
  if (!row?.value) return new Set();
  return new Set(row.value.split(',').map((s: string) => s.trim()).filter(Boolean));
}

function saveBlockedSuffixes(blocked: Set<string>): void {
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES ('blocked_api_keys', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run([...blocked].join(','));
}

export function loadKeys(): string[] {
  const now = Date.now();
  if (cachedKeys.length > 0 && now - lastLoadTime < CACHE_TTL) return cachedKeys;

  const blocked = loadBlockedSuffixes();
  const keys: string[] = [];

  // 1. Environment variable (comma-separated) — skip placeholders & blocked
  if (process.env.GEMINI_API_KEY) {
    const envKeys = process.env.GEMINI_API_KEY.split(',')
      .map(k => k.trim())
      .filter(k => k && isValidKeyFormat(k) && !blocked.has(k.slice(-4)));
    keys.push(...envKeys);
  }

  // 2. DB: ai_runtime_api_keys / gemini_api_keys / gemini_api_key（兼容舊資料）
  for (const keyName of AI_KEYS_SETTING_KEYS) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyName) as any;
    if (!row?.value) continue;
    if (keyName === 'gemini_api_key') {
      keys.push(String(row.value).trim());
    } else {
      keys.push(...String(row.value).split(',').map((k: string) => k.trim()).filter(Boolean));
    }
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  cachedKeys = keys.filter(k => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  lastLoadTime = now;
  return cachedKeys;
}

export function getGeminiPoolState(): GeminiPoolState[] {
  const blocked = loadBlockedSuffixes();
  return loadKeys().map((key, index) => ({
    id: index + 1,
    key,
    isActive: !blocked.has(key.slice(-4)),
    cooldownUntil: keyCooldowns.get(key) || 0,
    usageCount: 0,
  }));
}

export function updateGeminiPoolState(next: GeminiPoolState): void {
  const blocked = loadBlockedSuffixes();
  if (next.isActive) {
    blocked.delete(next.key.slice(-4));
  } else {
    blocked.add(next.key.slice(-4));
  }
  saveBlockedSuffixes(blocked);

  if (next.cooldownUntil > Date.now()) {
    keyCooldowns.set(next.key, next.cooldownUntil);
  } else {
    keyCooldowns.delete(next.key);
  }

  invalidateKeyCache();
}

/** Force reload keys from DB (call after add/delete) */
export function invalidateKeyCache(): void {
  lastLoadTime = 0;
  cachedKeys = [];
}

/** 取得可用的 key（跳過在 cooldown 中的） */
function getAvailableKeys(): string[] {
  const now = Date.now();
  return loadKeys().filter(k => {
    const cooldownEnd = keyCooldowns.get(k);
    return !cooldownEnd || now >= cooldownEnd;
  });
}

/** 取得 API key — 隨機選但跳過 cooldown 中的 key */
export function getGeminiApiKey(): string | null {
  let available = getAvailableKeys();
  if (available.length === 0) {
    // 全部在 cooldown，清除最舊的強制使用
    console.warn(`[geminiKeys] 所有 ${loadKeys().length} 把 key 都在 cooldown，清除最舊的`);
    keyCooldowns.clear();
    available = loadKeys();
  }
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/** 標記 key 為 429 進入 cooldown，回傳另一把可用的 */
export function getGeminiApiKeyExcluding(failedKey: string): string | null {
  keyCooldowns.set(failedKey, Date.now() + COOLDOWN_MS);
  const avail = getAvailableKeys();
  console.warn(`[geminiKeys] key ...${failedKey.slice(-4)} cooldown ${COOLDOWN_MS / 1000}s, 可用: ${avail.length}/${loadKeys().length}`);
  if (avail.length === 0) return null;
  return avail[Math.floor(Math.random() * avail.length)];
}

/** Get configured model name */
export function getGeminiModel(): string {
  for (const keyName of AI_MODEL_SETTING_KEYS) {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyName) as any;
    if (setting?.value) return setting.value;
  }
  return DEFAULT_MODEL;
}

/** Get all keys count (for diagnostics) */
export function getKeyCount(): number {
  return loadKeys().length;
}

// ─── Token Usage Tracking ───────────────────────────

/** Record token usage from a Gemini API response */
export function trackUsage(
  apiKey: string,
  model: string,
  callType: string,
  usageMetadata: any,
  projectId?: string
): void {
  try {
    const suffix = apiKey.slice(-4);
    const prompt = usageMetadata?.promptTokenCount || 0;
    const completion = usageMetadata?.candidatesTokenCount || 0;
    const total = usageMetadata?.totalTokenCount || 0;
    db.prepare(
      'INSERT INTO api_key_usage (api_key_suffix, model, call_type, prompt_tokens, completion_tokens, total_tokens, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(suffix, model, callType, prompt, completion, total, projectId || null);
  } catch {
    // Non-fatal — don't break the caller if tracking fails
  }
}

// ─── Key Management ─────────────────────────────────

/** Get all keys (masked) with per-key usage stats */
export function getKeyList(): Array<{
  suffix: string;
  todayCalls: number;
  todayTokens: number;
  totalCalls: number;
  totalTokens: number;
  fromEnv: boolean;
}> {
  const keys = loadKeys();
  const envKeys = new Set(
    (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
  );
  return keys.map(k => {
    const suffix = k.slice(-4);
    const today = db.prepare(
      `SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens
       FROM api_key_usage WHERE api_key_suffix = ? AND date(created_at) = date('now')`
    ).get(suffix) as any;
    const total = db.prepare(
      `SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens
       FROM api_key_usage WHERE api_key_suffix = ?`
    ).get(suffix) as any;
    return {
      suffix,
      todayCalls: today?.calls || 0,
      todayTokens: today?.tokens || 0,
      totalCalls: total?.calls || 0,
      totalTokens: total?.tokens || 0,
      fromEnv: envKeys.has(k),
    };
  });
}

/** Add a new API key */
export function addApiKey(newKey: string): void {
  const keys = loadKeys();
  if (keys.includes(newKey)) return; // Already exists
  keys.push(newKey);
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES ('ai_runtime_api_keys', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run(keys.join(','));
  invalidateKeyCache();
}

/** Remove an API key by its last 4 chars. ENV keys get blocked instead of deleted. */
export function removeApiKey(suffix: string): boolean {
  const keys = loadKeys();
  const target = keys.find(k => k.slice(-4) === suffix);
  if (!target) return false;

  // Check if this key comes from env
  const envKeys = new Set(
    (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
  );
  if (envKeys.has(target)) {
    // Can't delete from env — add to blocked list
    const blocked = loadBlockedSuffixes();
    blocked.add(suffix);
    db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('blocked_api_keys', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    ).run([...blocked].join(','));
  } else {
    // DB key — remove from stored list
    const filtered = keys.filter(k => k.slice(-4) !== suffix);
    db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('ai_runtime_api_keys', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    ).run(filtered.join(','));
  }

  invalidateKeyCache();
  return true;
}

/** Get aggregated usage stats (today, 7 days, 30 days) */
export function getUsageStats(): {
  today: { calls: number; tokens: number };
  week: { calls: number; tokens: number };
  month: { calls: number; tokens: number };
} {
  const today = db.prepare(
    `SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens
     FROM api_key_usage WHERE date(created_at) = date('now')`
  ).get() as any;
  const week = db.prepare(
    `SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens
     FROM api_key_usage WHERE created_at >= datetime('now', '-7 days')`
  ).get() as any;
  const month = db.prepare(
    `SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens
     FROM api_key_usage WHERE created_at >= datetime('now', '-30 days')`
  ).get() as any;
  return {
    today: { calls: today?.calls || 0, tokens: today?.tokens || 0 },
    week: { calls: week?.calls || 0, tokens: week?.tokens || 0 },
    month: { calls: month?.calls || 0, tokens: month?.tokens || 0 },
  };
}
