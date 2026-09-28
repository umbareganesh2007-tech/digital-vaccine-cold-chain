# PHC Digital Vaccine Cold Chain

Staff log ice-lined refrigerator temperatures in the browser. SQLite stores readings. The 2°C–8°C band drives Safe / Warning / Critical status and alerts. Dashboard, Recharts trends, and deviation reports replace paper plotting. There are no sensors or IoT devices.

Unrelated Task 1C eBot code remains under `algorithms/` (see below).

## App layout

- `client/` — Vite + React UI
- `server/` — Express API + SQLite (`server/data/coldchain.db` via better-sqlite3)

## Install and run

Use two terminals from the repo root.

```bash
# Terminal 1 — API (http://localhost:3001)
cd server
npm install
npm start
```

```bash
# Terminal 2 — UI (http://localhost:5173, proxies /api to the server)
cd client
npm install
npm run dev
```

Open http://localhost:5173. The database file is created and seeded on first server start.

Optional: `JWT_SECRET` and `PORT` (default `3001`) for the server; `CLIENT_ORIGIN` if the UI is not on `http://localhost:5173`.

Server unit tests for temperature bands: `cd server && npm test`.

## Demo accounts

Shown on the login page. Passwords are stored hashed.

| Role | Username | Password |
| --- | --- | --- |
| Staff | `staff` | `phc-staff` |
| Supervisor | `supervisor` | `phc-super` |

Staff can log readings. Supervisors can also acknowledge alerts on Reports.

## Demo the four flows

1. **Login** — Sign in as `staff`. Credentials are listed on `/login`.
2. **Log** — Open **Log reading**. Save `5.0°C` (Safe, no alert). Save `11.0°C` (Critical, alert created).
3. **Dashboard** — `/` shows freezer cards with the latest °C and color-coded Safe / Warning / Critical, plus open alerts.
4. **Trends** — `/trends` pick a freezer and switch Daily / Weekly / Monthly charts (safe band shaded).
5. **Reports** — `/reports` filter by freezer, date, and level. Table lists deviation count, hours out of range, and affected batches. Use **Export CSV**.

Status rules: Safe = 2–8°C inclusive. Warning = 1–2°C exclusive of 2, or 8–10°C exclusive of 8. Critical = colder than 1°C or warmer than 10°C. Out-of-range writes create an `alerts` row (`acknowledged_at` starts null).

---

# Strata Cobot Task 1C

`algorithms/scripts/task1c/task1c.py` drives the eBot along `/ebot_path`, through the ten waypoints in order, and stops on the last one. It reads `/odom`, `/scan`, and the latched `/map` rock grid, and publishes `/cmd_vel`. Nav2 and other route-following packages are not used.

## Install into the Task 0 workspace

```bash
mkdir -p ~/ros2_ws/src/algorithms/scripts/task1c
cp algorithms/scripts/task1c/task1c.py ~/ros2_ws/src/algorithms/scripts/task1c/task1c.py
chmod +x ~/ros2_ws/src/algorithms/scripts/task1c/task1c.py
```

In `~/ros2_ws/src/algorithms/setup.py`, add the script path from the package root:

```python
SCRIPTS = [
    'scripts/task1c/task1c.py',
]
```

Rebuild and source:

```bash
cd ~/ros2_ws
colcon build --packages-select algorithms
source install/setup.bash
ros2 pkg executables algorithms
```

`ros2 run` uses the installed copy. Rebuild and source again after every edit.

## Run

Terminal 1, leave it running until the arena finishes:

```bash
ros2 launch eyantra_kepler_colony task1c.launch.py
```

Wait for `[KeplerArenaPlugin] Rock spawn complete.`

Terminal 2:

```bash
source ~/ros2_ws/install/setup.bash
ros2 run algorithms task1c.py
```

Check the latched route:

```bash
ros2 topic echo /ebot_path --once --qos-durability transient_local
```

The first pose is `(0.0025, -0.0025)` and the last is `(5.5025, 1.9975)`. The eight poses between them change every launch, so the node reads `/ebot_path` instead of using a fixed list.
