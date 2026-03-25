import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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

export function generateToken(user: TokenPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    secret,
    { expiresIn: '7d' },
  );
}

export function verifyToken(token: string): TokenPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }
  return jwt.verify(token, secret) as TokenPayload;
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
    'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
  ).run(username, hashed, email, 'admin');
}
