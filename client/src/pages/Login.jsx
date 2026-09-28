import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('staff');
  const [password, setPassword] = useState('phc-staff');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={onSubmit}>
        <p className="eyebrow">PHC vaccine store</p>
        <h1>Sign in to cold chain</h1>
        <p className="lede">
          Manual temperature log for ice-lined refrigerators. Keep vaccines between 2°C and 8°C.
        </p>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="demo-creds">
          <h2>Demo accounts</h2>
          <p>
            Staff: <code>staff</code> / <code>phc-staff</code>
          </p>
          <p>
            Supervisor: <code>supervisor</code> / <code>phc-super</code>
          </p>
        </div>
      </form>
    </div>
  );
}
