import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'phc-coldchain-demo-secret';
const COOKIE = 'coldchain_token';

export function signUser(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.cookies?.[COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Sign in required' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}

export function login(username, password) {
  const user = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(String(username || '').trim());
  if (!user) return null;
  if (!bcrypt.compareSync(password || '', user.password_hash)) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
  };
}

export function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.displayName || row.display_name,
  };
}
