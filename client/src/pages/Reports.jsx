import { useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAuth } from '../AuthContext.jsx';

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const { user } = useAuth();
  const [freezers, setFreezers] = useState([]);
  const [freezerId, setFreezerId] = useState('all');
  const [level, setLevel] = useState('all');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(todayInput());
  const [rows, setRows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (freezerId !== 'all') params.set('freezerId', freezerId);
    if (level !== 'all') params.set('level', level);
    params.set('from', new Date(from).toISOString());
    params.set('to', new Date(`${to}T23:59:59`).toISOString());
    return params.toString();
  }, [freezerId, level, from, to]);

  useEffect(() => {
    api('/api/freezers').then(setFreezers);
  }, []);

  useEffect(() => {
    api(`/api/reports?${query}`)
      .then((data) => setRows(data.rows))
      .catch((err) => setError(err.message));
    api('/api/alerts')
      .then(setAlerts)
      .catch(() => {});
  }, [query]);

  async function ack(id) {
    await api(`/api/alerts/${id}/ack`, { method: 'POST' });
    setAlerts(await api('/api/alerts'));
  }

  const csvHref = `/api/reports.csv?${query}`;

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Deviation reports</h2>
          <p>Count of out-of-range logs, estimated hours outside 2–8°C, and batches on those freezers.</p>
        </div>
        <a className="button" href={csvHref} onClick={(e) => {
          e.preventDefault();
          fetch(csvHref, {
            headers: { Authorization: `Bearer ${getToken()}` },
            credentials: 'include',
          })
            .then((r) => r.blob())
            .then((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'cold-chain-report.csv';
              a.click();
              URL.revokeObjectURL(url);
            });
        }}>
          Export CSV
        </a>
      </div>
      <div className="toolbar wrap">
        <label>
          Freezer
          <select value={freezerId} onChange={(e) => setFreezerId(e.target.value)}>
            <option value="all">All freezers</option>
            {freezers.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} — {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">Warning + critical</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Freezer</th>
            <th>Level</th>
            <th>Deviations</th>
            <th>Hours out of range</th>
            <th>Affected batches</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.freezerId}-${r.level}`}>
              <td>
                {r.freezerCode} {r.freezerName}
              </td>
              <td>
                <StatusBadge status={r.level} />
              </td>
              <td>{r.deviationCount}</td>
              <td>{r.hoursOutOfRange}</td>
              <td>{r.affectedBatches.length ? r.affectedBatches.join(', ') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="section-title">Recent alerts</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Level</th>
            <th>Message</th>
            <th>Acknowledged</th>
          </tr>
        </thead>
        <tbody>
          {alerts.slice(0, 20).map((a) => (
            <tr key={a.id}>
              <td>{new Date(a.createdAt).toLocaleString()}</td>
              <td>
                <StatusBadge status={a.level} />
              </td>
              <td>{a.message}</td>
              <td>
                {a.acknowledgedAt ? (
                  new Date(a.acknowledgedAt).toLocaleString()
                ) : user.role === 'supervisor' ? (
                  <button type="button" className="ghost" onClick={() => ack(a.id)}>
                    Acknowledge
                  </button>
                ) : (
                  'Open'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
