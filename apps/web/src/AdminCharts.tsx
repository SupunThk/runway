import { useState } from 'react';

/* Small dependency-free SVG charts for the admin console.
 * Single-series charts use the Runway accent; the three-part payment split uses
 * the first three validated categorical slots (blue, orange, aqua) with direct
 * labels and a value list, because aqua sits below 3:1 on the light surface. */

export type BarPoint = { label: string; value: number | null };

export function DailyBars({
  title,
  points,
  unit,
}: {
  title: string;
  points: BarPoint[];
  unit: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 160;
  const top = 12;
  const bottom = 22;
  const plot = height - top - bottom;
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  const slot = width / Math.max(1, points.length);
  const bar = Math.max(2, Math.min(28, slot - 2));
  const tracked = points.some((p) => p.value !== null);
  const active = hover === null ? null : points[hover];
  return (
    <figure className="admin-chart">
      <figcaption>
        <span>{title}</span>
        <span className="admin-chart-readout" aria-live="polite">
          {active
            ? `${active.label} · ${active.value === null ? 'not tracked' : `${active.value.toLocaleString()} ${unit}`}`
            : `Peak ${max.toLocaleString()} ${unit}`}
        </span>
      </figcaption>
      {tracked ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${title}. Bar chart; exact values are in the daily table.`}
          onMouseLeave={() => setHover(null)}
        >
          <line
            x1="0"
            x2={width}
            y1={top + plot}
            y2={top + plot}
            className="admin-chart-axis"
          />
          <line
            x1="0"
            x2={width}
            y1={top}
            y2={top}
            className="admin-chart-grid"
          />
          {points.map((point, i) => {
            const h =
              point.value === null || point.value === 0
                ? 0
                : Math.max(2, (point.value / max) * plot);
            const x = i * slot + (slot - bar) / 2;
            const r = Math.min(4, bar / 2, h);
            return (
              <g key={point.label}>
                {/* Hit target spans the full column, larger than the mark. */}
                <rect
                  x={i * slot}
                  y={top}
                  width={slot}
                  height={plot}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                />
                {point.value === null ? (
                  <rect
                    x={x}
                    y={top + plot - 2}
                    width={bar}
                    height={2}
                    className="admin-chart-untracked"
                    pointerEvents="none"
                  />
                ) : h > 0 ? (
                  <path
                    d={`M${x},${top + plot}V${top + plot - h + r}q0,-${r} ${r},-${r}h${bar - 2 * r}q${r},0 ${r},${r}V${top + plot}Z`}
                    className={
                      hover === i ? 'admin-chart-bar active' : 'admin-chart-bar'
                    }
                    pointerEvents="none"
                  />
                ) : null}
              </g>
            );
          })}
          <text x="0" y={height - 6} className="admin-chart-tick">
            {points[0]?.label}
          </text>
          <text
            x={width}
            y={height - 6}
            textAnchor="end"
            className="admin-chart-tick"
          >
            {points.at(-1)?.label}
          </text>
        </svg>
      ) : (
        <p className="hint">No tracked activity in this period yet.</p>
      )}
    </figure>
  );
}

export type Segment = {
  key: string;
  label: string;
  value: bigint;
  display: string;
};

export function SplitBar({
  title,
  segments,
}: {
  title: string;
  segments: Segment[];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0n);
  if (total === 0n)
    return <p className="hint">No funded schedules have been indexed yet.</p>;
  // Percentages from bigint base units without floating overflow.
  const pct = (v: bigint) => Number((v * 10000n) / total) / 100;
  return (
    <figure className="admin-chart">
      <figcaption>
        <span>{title}</span>
      </figcaption>
      <div
        className="admin-split"
        role="img"
        aria-label={segments
          .map((s) => `${s.label} ${pct(s.value)}%`)
          .join(', ')}
        onMouseLeave={() => setHover(null)}
      >
        {segments
          .filter((s) => s.value > 0n)
          .map((s) => (
            <span
              key={s.key}
              className={`admin-split-seg seg-${s.key}${hover === s.key ? ' active' : ''}`}
              style={{ flexGrow: Math.max(pct(s.value), 0.5) }}
              onMouseEnter={() => setHover(s.key)}
              title={`${s.label}: ${s.display} (${pct(s.value)}%)`}
            />
          ))}
      </div>
      <ul className="admin-legend">
        {segments.map((s) => (
          <li key={s.key} className={hover === s.key ? 'active' : undefined}>
            <span className={`admin-swatch seg-${s.key}`} aria-hidden="true" />
            <span>{s.label}</span>
            <strong>{pct(s.value)}%</strong>
            <span className="admin-legend-value">{s.display}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export type FunnelStep = { label: string; value: number; hint?: string };

export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const base = Math.max(1, steps[0]?.value ?? 0);
  return (
    <ol className="admin-funnel">
      {steps.map((step) => {
        const share = Math.min(100, (step.value / base) * 100);
        return (
          <li key={step.label}>
            <div className="admin-funnel-label">
              <span>{step.label}</span>
              <strong>{step.value.toLocaleString()}</strong>
              <span className="admin-funnel-share">
                {steps[0].value ? `${Math.round(share)}%` : '—'}
              </span>
            </div>
            <div className="admin-funnel-track" title={step.hint}>
              <span
                style={{ width: `${step.value ? Math.max(share, 1) : 0}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
