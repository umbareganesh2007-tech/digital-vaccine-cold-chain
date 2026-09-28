import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Primary Health Centre</p>
          <h1>Vaccine Cold Chain</h1>
        </div>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/log">Log reading</NavLink>
          <NavLink to="/trends">Trends</NavLink>
          <NavLink to="/reports">Reports</NavLink>
        </nav>
        <div className="session">
          <span>
            {user.displayName} · {user.role}
          </span>
          <button type="button" className="ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
