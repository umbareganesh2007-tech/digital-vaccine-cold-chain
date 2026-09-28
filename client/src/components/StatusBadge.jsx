const LABELS = { safe: 'Safe', warning: 'Warning', critical: 'Critical' };

export default function StatusBadge({ status }) {
  if (!status) return <span className="badge unknown">No reading</span>;
  return <span className={`badge ${status}`}>{LABELS[status] || status}</span>;
}
