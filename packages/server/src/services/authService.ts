import bcrypt from 'bcryptjs';
import { getDb } from '../db/connection.js';

const SALT_ROUNDS = 10;

export interface TokenPayload {
  id: number;
  username: string;
  role: string;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

/** 生成簡單 token（base64 encoded JSON，不需要 JWT_SECRET） */
export function generateToken(user: TokenPayload): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    id: user.id, username: user.username, role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  })).toString('base64url');
  return `${header}.${payload}.nosig`;
}

/** 驗證 token（解析 base64 payload） */
export function verifyToken(token: string): TokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[2] !== 'nosig') throw new Error('Invalid token');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return { id: payload.id, username: payload.username, role: payload.role };
}

export function ensureDefaultAdmin(): void {
  const db = getDb();

  const existing = db
    .prepare('SELECT id FROM users WHERE role = ?')
    .get('admin');

  if (existing) {
    return;
  }

  const username = process.env.DEFAULT_ADMIN_USERNAME ?? 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin';
  const email = process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@localhost';

  const hashed = hashPassword(password);

  db.prepare(
    'INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)',
  ).run(username, hashed, email, 'admin');
}
