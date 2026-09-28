/** WHO vaccine fridge range: 2°C–8°C inclusive is safe. */

export const SAFE_MIN = 2;
export const SAFE_MAX = 8;
export const WARN_LOW = 1;
export const WARN_HIGH = 10;

/**
 * Safe = 2–8°C inclusive.
 * Warning = 1–2°C exclusive of 2, or 8–10°C exclusive of 8.
 * Critical = colder than 1°C or warmer than 10°C.
 */
export function classifyTemperature(celsius) {
  const t = Number(celsius);
  if (!Number.isFinite(t)) {
    throw new Error('Temperature must be a number');
  }
  if (t >= SAFE_MIN && t <= SAFE_MAX) return 'safe';
  if ((t >= WARN_LOW && t < SAFE_MIN) || (t > SAFE_MAX && t <= WARN_HIGH)) {
    return 'warning';
  }
  return 'critical';
}

export function isOutOfRange(status) {
  return status === 'warning' || status === 'critical';
}

export function statusLabel(status) {
  if (status === 'safe') return 'Safe';
  if (status === 'warning') return 'Warning';
  if (status === 'critical') return 'Critical';
  return status;
}
