import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { db, migrate } from './db.js';
import { seedIfEmpty } from './seed.js';
import {
  login,
  requireAuth,
  setAuthCookie,
  clearAuthCookie,
  signUser,
  publicUser,
} from './auth.js';
import { registerRoutes } from './routes.js';

migrate();
seedIfEmpty(db);

const app = express();
const PORT = Number(process.env.PORT || 3001);
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(
  cors({
    origin,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const user = login(req.body?.username, req.body?.password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = signUser(user);
  setAuthCookie(res, token);
  res.json({ user: publicUser(user), token });
});

app.post('/api/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const row = db
    .prepare('SELECT id, username, role, display_name AS displayName FROM users WHERE id = ?')
    .get(req.user.id);
  if (!row) return res.status(401).json({ error: 'Unknown user' });
  res.json({ user: publicUser(row) });
});

app.use('/api', requireAuth, (req, res, next) => next());
registerRoutes(app);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Cold chain API listening on http://localhost:${PORT}`);
});
