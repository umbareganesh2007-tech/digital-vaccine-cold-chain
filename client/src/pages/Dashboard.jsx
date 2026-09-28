import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

function formatWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function Dashboard() {
  const [cards, setCards] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [dash, open] = await Promise.all([
        api('/api/dashboard'),
        api('/api/alerts?open=1'),
      ]);
      setCards(dash.cards);
      setAlerts(open);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Freezer status</h2>
          <p>Latest logged temperatures. Safe range is 2°C–8°C.</p>
        </div>
        <Link className="button" to="/log">
          Log a reading
        </Link>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card-grid">
        {cards.map((card) => (
          <article key={card.id} className={`freezer-card ${card.latest?.status || 'unknown'}`}>
            <header>
              <span className="code">{card.code}</span>
              <StatusBadge status={card.latest?.status} />
            </header>
            <h3>{card.name}</h3>
            <p className="muted">{card.location}</p>
            <p className="big-temp">
              {card.latest ? `${card.latest.celsius.toFixed(1)}°C` : '—'}
            </p>
            <p className="muted">
              {card.latest
                ? `${card.latest.vaccineName} · ${card.latest.lotCode}`
                : 'No readings yet'}
            </p>
            <p className="muted">Logged {formatWhen(card.latest?.recordedAt)}</p>
            {card.openAlerts > 0 ? (
              <p className="alert-count">{card.openAlerts} open alert(s)</p>
            ) : (
              <p className="muted">No open alerts</p>
            )}
          </article>
        ))}
      </div>

      <h2 className="section-title">Open alerts</h2>
      {alerts.length === 0 ? (
        <p className="muted">No unacknowledged excursions.</p>
      ) : (
        <ul className="alert-list">
          {alerts.map((a) => (
            <li key={a.id} className={a.level}>
              <strong>{a.level}</strong> {a.message}
              <span className="muted">
                {a.freezerName} · {a.lotCode} · {formatWhen(a.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
