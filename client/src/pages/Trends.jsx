import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

function tick(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
}

export default function Trends() {
  const [freezers, setFreezers] = useState([]);
  const [freezerId, setFreezerId] = useState('');
  const [range, setRange] = useState('daily');
  const [points, setPoints] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/freezers').then((rows) => {
      setFreezers(rows);
      if (rows[0]) setFreezerId(String(rows[0].id));
    });
  }, []);

  useEffect(() => {
    if (!freezerId) return;
    api(`/api/readings?freezerId=${freezerId}&range=${range}`)
      .then((data) => setPoints(data.points))
      .catch((err) => setError(err.message));
  }, [freezerId, range]);

  const chartData = points.map((p) => ({
    ...p,
    time: tick(p.recordedAt),
    ts: p.recordedAt,
  }));

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Temperature trends</h2>
          <p>Daily, weekly, or monthly view of logged readings. Band shows the 2°C–8°C safe range.</p>
        </div>
      </div>
      <div className="toolbar">
        <label>
          Freezer
          <select value={freezerId} onChange={(e) => setFreezerId(e.target.value)}>
            {freezers.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} — {f.name}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented">
          {['daily', 'weekly', 'monthly'].map((r) => (
            <button
              key={r}
              type="button"
              className={range === r ? 'active' : ''}
              onClick={() => setRange(r)}
            >
              {r[0].toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card chart-card">
        {chartData.length === 0 ? (
          <p className="muted">No readings in this window.</p>
        ) : (
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#d7e0ea" strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 12 }} minTickGap={24} />
              <YAxis domain={[-2, 14]} unit="°C" tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name) =>
                  name === 'celsius' ? [`${value}°C`, 'Temperature'] : [value, name]
                }
              />
              <Legend />
              <ReferenceArea y1={2} y2={8} fill="#1f7a4d" fillOpacity={0.08} />
              <Line
                type="monotone"
                dataKey="celsius"
                name="Temperature"
                stroke="#0b3d91"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>When</th>
            <th>°C</th>
            <th>Status</th>
            <th>Batch</th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().slice(0, 12).map((p) => (
            <tr key={p.id}>
              <td>{new Date(p.recordedAt).toLocaleString()}</td>
              <td>{p.celsius.toFixed(1)}</td>
              <td>
                <StatusBadge status={p.status} />
              </td>
              <td>
                {p.vaccineName} ({p.lotCode})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
