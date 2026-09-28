import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function LogReading() {
  const [freezers, setFreezers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [freezerId, setFreezerId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [celsius, setCelsius] = useState('5.0');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/freezers').then(setFreezers);
  }, []);

  useEffect(() => {
    if (!freezerId) {
      setBatches([]);
      setBatchId('');
      return;
    }
    api(`/api/batches?freezerId=${freezerId}`).then((rows) => {
      setBatches(rows);
      setBatchId(rows[0] ? String(rows[0].id) : '');
    });
  }, [freezerId]);

  useEffect(() => {
    if (freezers.length && !freezerId) setFreezerId(String(freezers[0].id));
  }, [freezers, freezerId]);

  const preview = useMemo(() => {
    const t = Number(celsius);
    if (!Number.isFinite(t)) return null;
    if (t >= 2 && t <= 8) return 'safe';
    if ((t >= 1 && t < 2) || (t > 8 && t <= 10)) return 'warning';
    return 'critical';
  }, [celsius]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const data = await api('/api/readings', {
        method: 'POST',
        body: {
          freezerId: Number(freezerId),
          batchId: Number(batchId),
          celsius: Number(celsius),
        },
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <div className="page-head">
        <div>
          <h2>Log freezer temperature</h2>
          <p>Enter the stem thermometer reading. Alerts are created automatically if out of range.</p>
        </div>
      </div>
      <form className="card form-card" onSubmit={onSubmit}>
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
        <label>
          Vaccine batch
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.vaccineName} ({b.lotCode})
              </option>
            ))}
          </select>
        </label>
        <label>
          Temperature (°C)
          <input
            type="number"
            step="0.1"
            value={celsius}
            onChange={(e) => setCelsius(e.target.value)}
            required
          />
        </label>
        <p className="preview">
          Will record as <StatusBadge status={preview} />
        </p>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy || !batchId}>
          {busy ? 'Saving…' : 'Save reading'}
        </button>
      </form>
      {result ? (
        <div className="card result-card">
          <h3>Saved</h3>
          <p className="big-temp">{result.reading.celsius.toFixed(1)}°C</p>
          <StatusBadge status={result.reading.status} />
          {result.alert ? (
            <p className="alert-count">Alert created: {result.alert.message}</p>
          ) : (
            <p className="muted">No alert — temperature is in range.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
