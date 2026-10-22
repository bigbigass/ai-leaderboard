/**
 * Server-rendered SVG line chart of percentile (0–100) over time, one line per leaderboard.
 * Lines break between batches (a source's question-set / method change). No client JS:
 * points carry <title> tooltips; the cross-board table on the same page is the table view.
 */
export interface TrendPoint {
  date: string; // YYYY-MM-DD
  value: number; // percentile
  rank: number | null;
  batch: string | null;
}
export interface TrendSeries {
  key: string;
  label: string;
  points: TrendPoint[];
}

const W = 720;
const H = 260;
const MARGIN = { top: 14, bottom: 28, left: 36 };
const MAX_SERIES = 8;

/** Split a series into contiguous same-batch segments. */
export function segmentByBatch(points: TrendPoint[]): TrendPoint[][] {
  const out: TrendPoint[][] = [];
  for (const p of points) {
    const cur = out.at(-1);
    if (cur && cur[cur.length - 1]!.batch === p.batch) cur.push(p);
    else out.push([p]);
  }
  return out;
}

export function TrendChart({
  series,
  ariaLabel,
  formatDate,
  batchLabel,
}: {
  series: TrendSeries[];
  ariaLabel: string;
  formatDate: (iso: string) => string;
  batchLabel: string;
}) {
  const shown = series.filter((s) => s.points.length > 0).slice(0, MAX_SERIES);
  if (!shown.length) return null;
  const direct = shown.length <= 4;
  // Room for direct end labels only when they are drawn (≤ 4 series); otherwise the legend identifies lines.
  const M = { ...MARGIN, right: direct ? 150 : 24 };
  const dates = [...new Set(shown.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const t0 = Date.parse(dates[0]!);
  const t1 = Date.parse(dates.at(-1)!);
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (d: string) => M.left + (t1 === t0 ? iw / 2 : ((Date.parse(d) - t0) / (t1 - t0)) * iw);
  const y = (v: number) => M.top + (1 - v / 100) * ih;
  // Up to 4 date ticks, always keeping the last one, dropping any closer than 70px to a kept neighbour.
  const candidates = dates.length <= 4 ? dates : [dates[0]!, dates[Math.floor(dates.length / 3)]!, dates[Math.floor((2 * dates.length) / 3)]!, dates.at(-1)!];
  const ticks = [...new Set(candidates)].reverse().reduce<string[]>((kept, d) => (kept.length && x(kept.at(-1)!) - x(d) < 70 ? kept : [...kept, d]), []).reverse();

  // Direct end labels, nudged apart vertically so they don't collide.
  const ends = shown
    .map((s, i) => ({ i, label: s.label, y: y(s.points.at(-1)!.value), x: x(s.points.at(-1)!.date) }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k]!.y - ends[k - 1]!.y < 13) ends[k]!.y = ends[k - 1]!.y + 13;

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full max-w-3xl text-muted-foreground">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.left - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="currentColor">
              {v}
            </text>
          </g>
        ))}
        {ticks.map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize={10} fill="currentColor">
            {formatDate(d)}
          </text>
        ))}
        {shown.map((s, i) => {
          const color = `var(--series-${i + 1})`;
          const segs = segmentByBatch(s.points);
          return (
            <g key={s.key}>
              {segs.map((seg, j) => (
                <g key={j}>
                  {j > 0 && (
                    <line x1={x(seg[0]!.date)} x2={x(seg[0]!.date)} y1={M.top} y2={H - M.bottom} stroke="currentColor" strokeDasharray="3 3" strokeWidth={1} opacity={0.5}>
                      <title>{batchLabel}</title>
                    </line>
                  )}
                  {seg.length > 1 && (
                    <polyline
                      points={seg.map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                </g>
              ))}
              {s.points.map((p) => (
                <g key={p.date}>
                  <circle cx={x(p.date)} cy={y(p.value)} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />
                  {/* larger invisible hit target for the native tooltip */}
                  <circle cx={x(p.date)} cy={y(p.value)} r={9} fill="transparent">
                    <title>{`${s.label} · ${formatDate(p.date)} · ${p.value.toFixed(1)}${p.rank != null ? ` · #${p.rank}` : ''}`}</title>
                  </circle>
                </g>
              ))}
            </g>
          );
        })}
        {direct &&
          ends.map((e) => (
            <text key={e.i} x={W - M.right + 8} y={e.y + 3} fontSize={10} fill="var(--foreground)">
              {e.label.length > 26 ? `${e.label.slice(0, 25)}…` : e.label}
            </text>
          ))}
      </svg>
      {shown.length >= 2 && (
        <figcaption>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {shown.map((s, i) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: `var(--series-${i + 1})` }} />
                {s.label}
              </li>
            ))}
          </ul>
        </figcaption>
      )}
    </figure>
  );
}
