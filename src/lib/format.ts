const qtyFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatQty(value: number): string {
  return qtyFormat.format(value);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatPeriod(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  return formatDate(from ?? to);
}
