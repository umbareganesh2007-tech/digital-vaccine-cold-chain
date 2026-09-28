import bcrypt from 'bcryptjs';
import { classifyTemperature, isOutOfRange } from './status.js';

function iso(d) {
  return d.toISOString();
}

function addHours(base, hours) {
  return new Date(base.getTime() + hours * 3600 * 1000);
}

export function seedIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const hashStaff = bcrypt.hashSync('phc-staff', 10);
  const hashSuper = bcrypt.hashSync('phc-super', 10);

  const insertUser = db.prepare(
    `INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)`
  );
  const staffId = insertUser.run('staff', hashStaff, 'staff', 'PHC Staff').lastInsertRowid;
  insertUser.run('supervisor', hashSuper, 'supervisor', 'Cold Chain Supervisor');

  const insertFreezer = db.prepare(
    `INSERT INTO freezers (code, name, location) VALUES (?, ?, ?)`
  );
  const f1 = insertFreezer.run('FR-01', 'Main ILR', 'PHC store room').lastInsertRowid;
  const f2 = insertFreezer.run('FR-02', 'Outreach cooler', 'ANM room').lastInsertRowid;
  const f3 = insertFreezer.run('FR-03', 'Maternity ILR', 'Labour ward').lastInsertRowid;
  const f4 = insertFreezer.run('FR-04', 'Pharmacy fridge', 'Dispensary').lastInsertRowid;

  const insertBatch = db.prepare(
    `INSERT INTO batches (freezer_id, lot_code, vaccine_name, doses) VALUES (?, ?, ?, ?)`
  );
  const batches = [
    insertBatch.run(f1, 'BCG-2401', 'BCG', 80).lastInsertRowid,
    insertBatch.run(f1, 'PENTA-2408', 'Pentavalent', 120).lastInsertRowid,
    insertBatch.run(f2, 'OPV-2411', 'OPV', 200).lastInsertRowid,
    insertBatch.run(f2, 'MR-2405', 'Measles-Rubella', 90).lastInsertRowid,
    insertBatch.run(f3, 'TT-2403', 'Tetanus toxoid', 60).lastInsertRowid,
    insertBatch.run(f3, 'HEP-B-2409', 'Hepatitis B (birth dose)', 40).lastInsertRowid,
    insertBatch.run(f4, 'IPV-2412', 'IPV', 50).lastInsertRowid,
    insertBatch.run(f4, 'ROTA-2407', 'Rotavirus', 70).lastInsertRowid,
  ];

  const freezerBatches = {
    [f1]: [batches[0], batches[1]],
    [f2]: [batches[2], batches[3]],
    [f3]: [batches[4], batches[5]],
    [f4]: [batches[6], batches[7]],
  };

  const insertReading = db.prepare(
    `INSERT INTO readings (freezer_id, batch_id, celsius, status, recorded_at, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertAlert = db.prepare(
    `INSERT INTO alerts (reading_id, freezer_id, batch_id, level, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const now = new Date();
  const start = new Date(now.getTime() - 32 * 24 * 3600 * 1000);

  const profiles = {
    [f1]: (hourIndex) => {
      const wave = 5 + Math.sin(hourIndex / 18) * 1.2;
      if (hourIndex === 48) return 9.2;
      if (hourIndex === 49) return 10.4;
      if (hourIndex === 50) return 8.6;
      if (hourIndex === 200) return 1.4;
      if (hourIndex === 201) return 0.6;
      if (hourIndex === 202) return 2.1;
      return Number(wave.toFixed(1));
    },
    [f2]: (hourIndex) => {
      const wave = 4.5 + Math.cos(hourIndex / 22) * 1.4;
      if (hourIndex === 120) return 11.2;
      if (hourIndex === 121) return 12.0;
      if (hourIndex === 122) return 9.1;
      return Number(wave.toFixed(1));
    },
    [f3]: (hourIndex) => Number((6 + Math.sin(hourIndex / 30) * 0.8).toFixed(1)),
    [f4]: (hourIndex) => {
      const wave = 5.2 + Math.sin(hourIndex / 40) * 0.9;
      if (hourIndex === 300) return 1.7;
      if (hourIndex === 301) return 1.2;
      return Number(wave.toFixed(1));
    },
  };

  const tx = db.transaction(() => {
    let hourIndex = 0;
    for (let t = new Date(start); t <= now; t = addHours(t, 6)) {
      for (const freezerId of [f1, f2, f3, f4]) {
        const lots = freezerBatches[freezerId];
        const batchId = lots[hourIndex % lots.length];
        const celsius = profiles[freezerId](hourIndex);
        const status = classifyTemperature(celsius);
        const recordedAt = iso(t);
        const readingId = insertReading.run(
          freezerId,
          batchId,
          celsius,
          status,
          recordedAt,
          staffId
        ).lastInsertRowid;
        if (isOutOfRange(status)) {
          const msg =
            status === 'critical'
              ? `Critical temperature ${celsius}°C (outside 2–8°C)`
              : `Warning temperature ${celsius}°C (just outside 2–8°C)`;
          insertAlert.run(readingId, freezerId, batchId, status, msg, recordedAt);
        }
      }
      hourIndex += 1;
    }
  });
  tx();
}
