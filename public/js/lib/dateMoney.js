/**
 * Date and money helpers: YYYY-MM / YYYY-MM-DD, AUD formatting, month labels.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function yyyyMm(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function yyyyMmDd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Display "Apr 2026" from YYYY-MM (uses AU locale for consistency with AUD). */
export function formatMonthLabel(yyyyMmStr) {
  if (!yyyyMmStr || !/^\d{4}-\d{2}$/.test(yyyyMmStr)) return '—';
  const [y, m] = yyyyMmStr.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  try {
    return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  } catch {
    return yyyyMmStr;
  }
}

/** Compact "Jun '25" for crowded trend chart axes. */
export function formatMonthLabelShort(yyyyMmStr) {
  if (!yyyyMmStr || !/^\d{4}-\d{2}$/.test(yyyyMmStr)) return '—';
  const [y, m] = yyyyMmStr.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  try {
    const month = d.toLocaleDateString('en-AU', { month: 'short' });
    return `${month} '${String(y).slice(-2)}`;
  } catch {
    return yyyyMmStr;
  }
}

export function moneyFromCents(cents) {
  const n = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'AUD'
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
