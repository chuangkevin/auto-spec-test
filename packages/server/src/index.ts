import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. 載入 dotenv（從專案根目錄的 .env）
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { runMigrations } from './db/migrate.js';
import { ensureDefaultAdmin } from './services/authService.js';
import { authHook } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import productRoutes from './routes/products.js';
import projectRoutes from './routes/projects.js';
import specificationRoutes from './routes/specifications.js';
import testScriptRoutes from './routes/testScripts.js';
import settingsRoutes from './routes/settings.js';
import giteaRoutes from './routes/gitea.js';

// 2. 建立 Fastify 實例
const app = Fastify({ logger: true });

// 不需要認證的路徑
const PUBLIC_PATHS = ['/api/auth/users', '/api/auth/select', '/api/auth/register', '/api/health', '/api/gitea/callback'];

async function start(): Promise<void> {
  // 3. 註冊 plugins
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  });

  // 4. 執行資料庫遷移
  runMigrations();

  // 5. 確保預設管理員存在
  ensureDefaultAdmin();

  // 6. 註冊全域認證 middleware（排除公開路徑）
  app.addHook('onRequest', async (request, reply) => {
    if (PUBLIC_PATHS.some((p) => request.url === p || request.url.startsWith(p + '?'))) {
      return;
    }
    await authHook(request, reply);
  });

  // 7. 註冊路由
  await app.register(authRoutes);
  await app.register(productRoutes);
  await app.register(projectRoutes);
  await app.register(specificationRoutes);
  await app.register(testScriptRoutes);
  await app.register(settingsRoutes);
  await app.register(giteaRoutes);

  // 8. Health check
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // 9. 監聽
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen({ port, host });
  console.log(`Server listening on http://${host}:${port}`);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
