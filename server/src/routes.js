import { db } from './db.js';
import { classifyTemperature, isOutOfRange } from './status.js';

function parseDate(value, fallback) {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

export function registerRoutes(app) {
  app.get('/api/freezers', (_req, res) => {
    const rows = db
      .prepare('SELECT id, code, name, location FROM freezers ORDER BY code')
      .all();
    res.json(rows);
  });

  app.get('/api/batches', (req, res) => {
    const freezerId = req.query.freezerId;
    const sql = freezerId
      ? 'SELECT id, freezer_id AS freezerId, lot_code AS lotCode, vaccine_name AS vaccineName, doses FROM batches WHERE freezer_id = ? ORDER BY vaccine_name'
      : 'SELECT id, freezer_id AS freezerId, lot_code AS lotCode, vaccine_name AS vaccineName, doses FROM batches ORDER BY vaccine_name';
    const rows = freezerId ? db.prepare(sql).all(Number(freezerId)) : db.prepare(sql).all();
    res.json(rows);
  });

  app.get('/api/dashboard', (_req, res) => {
    const freezers = db.prepare('SELECT id, code, name, location FROM freezers ORDER BY code').all();
    const latestStmt = db.prepare(`
      SELECT r.id, r.celsius, r.status, r.recorded_at AS recordedAt,
             b.lot_code AS lotCode, b.vaccine_name AS vaccineName
      FROM readings r
      JOIN batches b ON b.id = r.batch_id
      WHERE r.freezer_id = ?
      ORDER BY r.recorded_at DESC, r.id DESC
      LIMIT 1
    `);
    const openAlertsStmt = db.prepare(`
      SELECT COUNT(*) AS n FROM alerts
      WHERE freezer_id = ? AND acknowledged_at IS NULL
    `);

    const cards = freezers.map((f) => {
      const latest = latestStmt.get(f.id) || null;
      const openAlerts = openAlertsStmt.get(f.id).n;
      return { ...f, latest, openAlerts };
    });
    res.json({ cards });
  });

  app.post('/api/readings', (req, res) => {
    const freezerId = Number(req.body?.freezerId);
    const batchId = Number(req.body?.batchId);
    const celsius = Number(req.body?.celsius);
    if (!freezerId || !batchId || !Number.isFinite(celsius)) {
      return res.status(400).json({ error: 'freezer, batch, and celsius are required' });
    }

    const freezer = db.prepare('SELECT * FROM freezers WHERE id = ?').get(freezerId);
    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId);
    if (!freezer || !batch) {
      return res.status(400).json({ error: 'Unknown freezer or batch' });
    }
    if (batch.freezer_id !== freezerId) {
      return res.status(400).json({ error: 'Batch is not stored in that freezer' });
    }

    let status;
    try {
      status = classifyTemperature(celsius);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const recordedAt = new Date().toISOString();
    const result = db.transaction(() => {
      const readingId = db
        .prepare(
          `INSERT INTO readings (freezer_id, batch_id, celsius, status, recorded_at, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(freezerId, batchId, celsius, status, recordedAt, req.user.id).lastInsertRowid;

      let alert = null;
      if (isOutOfRange(status)) {
        const message =
          status === 'critical'
            ? `Critical temperature ${celsius}°C in ${freezer.name} (batch ${batch.lot_code})`
            : `Warning temperature ${celsius}°C in ${freezer.name} (batch ${batch.lot_code})`;
        const alertId = db
          .prepare(
            `INSERT INTO alerts (reading_id, freezer_id, batch_id, level, message, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(readingId, freezerId, batchId, status, message, recordedAt).lastInsertRowid;
        alert = db
          .prepare(
            `SELECT id, level, message, created_at AS createdAt, acknowledged_at AS acknowledgedAt
             FROM alerts WHERE id = ?`
          )
          .get(alertId);
      }

      const reading = db
        .prepare(
          `SELECT id, freezer_id AS freezerId, batch_id AS batchId, celsius, status,
                  recorded_at AS recordedAt FROM readings WHERE id = ?`
        )
        .get(readingId);
      return { reading, alert };
    })();

    res.status(201).json(result);
  });

  app.get('/api/readings', (req, res) => {
    const freezerId = Number(req.query.freezerId);
    if (!freezerId) {
      return res.status(400).json({ error: 'freezerId is required' });
    }
    const range = req.query.range || 'daily';
    const now = new Date();
    let from;
    if (range === 'weekly') from = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    else if (range === 'monthly') from = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    else from = new Date(now.getTime() - 24 * 3600 * 1000);
    from = parseDate(req.query.from, from);
    const to = parseDate(req.query.to, now);

    const rows = db
      .prepare(
        `SELECT r.id, r.celsius, r.status, r.recorded_at AS recordedAt,
                b.lot_code AS lotCode, b.vaccine_name AS vaccineName
         FROM readings r
         JOIN batches b ON b.id = r.batch_id
         WHERE r.freezer_id = ? AND r.recorded_at >= ? AND r.recorded_at <= ?
         ORDER BY r.recorded_at ASC`
      )
      .all(freezerId, from.toISOString(), to.toISOString());
    res.json({ range, from: from.toISOString(), to: to.toISOString(), points: rows });
  });

  app.get('/api/alerts', (req, res) => {
    const open = req.query.open === '1';
    const sql = open
      ? `SELECT a.id, a.level, a.message, a.created_at AS createdAt,
                a.acknowledged_at AS acknowledgedAt,
                f.name AS freezerName, b.lot_code AS lotCode
         FROM alerts a
         JOIN freezers f ON f.id = a.freezer_id
         JOIN batches b ON b.id = a.batch_id
         WHERE a.acknowledged_at IS NULL
         ORDER BY a.created_at DESC`
      : `SELECT a.id, a.level, a.message, a.created_at AS createdAt,
                a.acknowledged_at AS acknowledgedAt,
                f.name AS freezerName, b.lot_code AS lotCode
         FROM alerts a
         JOIN freezers f ON f.id = a.freezer_id
         JOIN batches b ON b.id = a.batch_id
         ORDER BY a.created_at DESC
         LIMIT 100`;
    res.json(db.prepare(sql).all());
  });

  app.post('/api/alerts/:id/ack', (req, res) => {
    if (req.user.role !== 'supervisor') {
      return res.status(403).json({ error: 'Only supervisors can acknowledge alerts' });
    }
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Alert not found' });
    const at = new Date().toISOString();
    db.prepare(
      `UPDATE alerts SET acknowledged_at = ?, acknowledged_by = ? WHERE id = ? AND acknowledged_at IS NULL`
    ).run(at, req.user.id, id);
    const row = db
      .prepare(
        `SELECT id, level, message, created_at AS createdAt, acknowledged_at AS acknowledgedAt
         FROM alerts WHERE id = ?`
      )
      .get(id);
    res.json(row);
  });

  app.get('/api/reports', (req, res) => {
    const report = buildReport(req.query);
    res.json(report);
  });

  app.get('/api/reports.csv', (req, res) => {
    const report = buildReport(req.query);
    const header = [
      'freezer',
      'code',
      'level',
      'deviationCount',
      'hoursOutOfRange',
      'affectedBatches',
    ];
    const lines = [header.join(',')];
    for (const row of report.rows) {
      lines.push(
        [
          csv(row.freezerName),
          csv(row.freezerCode),
          csv(row.level),
          row.deviationCount,
          row.hoursOutOfRange,
          csv(row.affectedBatches.join('; ')),
        ].join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="cold-chain-report.csv"');
    res.send(lines.join('\n'));
  });
}

function csv(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function buildReport(query) {
  const now = new Date();
  const from = parseDate(query.from, new Date(now.getTime() - 30 * 24 * 3600 * 1000));
  const to = parseDate(query.to, now);
  const freezerId = query.freezerId ? Number(query.freezerId) : null;
  const level = query.level && query.level !== 'all' ? query.level : null;

  let freezerSql = 'SELECT id, code, name FROM freezers';
  const freezerParams = [];
  if (freezerId) {
    freezerSql += ' WHERE id = ?';
    freezerParams.push(freezerId);
  }
  freezerSql += ' ORDER BY code';
  const freezers = db.prepare(freezerSql).all(...freezerParams);

  const rows = [];
  for (const freezer of freezers) {
    const readings = db
      .prepare(
        `SELECT r.id, r.celsius, r.status, r.recorded_at AS recordedAt,
                b.lot_code AS lotCode, b.vaccine_name AS vaccineName
         FROM readings r
         JOIN batches b ON b.id = r.batch_id
         WHERE r.freezer_id = ? AND r.recorded_at >= ? AND r.recorded_at <= ?
         ORDER BY r.recorded_at ASC`
      )
      .all(freezer.id, from.toISOString(), to.toISOString());

    const levels = level ? [level] : ['warning', 'critical'];
    for (const lvl of levels) {
      const matching = readings.filter((r) => r.status === lvl);
      if (matching.length === 0) {
        rows.push({
          freezerId: freezer.id,
          freezerCode: freezer.code,
          freezerName: freezer.name,
          level: lvl,
          deviationCount: 0,
          hoursOutOfRange: 0,
          affectedBatches: [],
        });
        continue;
      }

      let ms = 0;
      for (let i = 0; i < readings.length; i += 1) {
        const r = readings[i];
        if (r.status !== lvl) continue;
        const start = new Date(r.recordedAt).getTime();
        const end =
          i + 1 < readings.length
            ? new Date(readings[i + 1].recordedAt).getTime()
            : Math.min(to.getTime(), start + 6 * 3600 * 1000);
        ms += Math.max(0, end - start);
      }

      const batches = [
        ...new Set(matching.map((r) => `${r.vaccineName} (${r.lotCode})`)),
      ];

      rows.push({
        freezerId: freezer.id,
        freezerCode: freezer.code,
        freezerName: freezer.name,
        level: lvl,
        deviationCount: matching.length,
        hoursOutOfRange: Number((ms / 3600000).toFixed(1)),
        affectedBatches: batches,
      });
    }
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    rows,
  };
}
