export function buildMonthlySeries(rows: { month: number; count: number }[], months = 6): number[] {
  const map = new Map<number, number>();
  rows.forEach((r) => map.set(r.month, r.count));

  const now = new Date();
  const result: number[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() * 100 + (d.getMonth() + 1);
    result.push(map.get(key) ?? 0);
  }

  return result;
}
