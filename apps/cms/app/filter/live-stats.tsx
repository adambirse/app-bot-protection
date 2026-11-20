"use client";

import { useEffect, useState } from "react";
import type { FilterStats } from "../../lib/filter";

const POLL_MS = 2_000;

export function LiveStats({ initial }: { initial: FilterStats }) {
  const [stats, setStats] = useState(initial);

  useEffect(() => {
    let active = true;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/filter/stats", { cache: "no-store" });
        if (res.ok && active) setStats((await res.json()) as FilterStats);
      } catch {
        // Keep showing the last numbers; the next poll will try again.
      }
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (!stats.available) {
    return (
      <p role="alert" className="error" data-testid="filter-unavailable">
        {stats.reason === "not_configured"
          ? "The filter is not configured for this CMS (REDIS_URL is not set)."
          : "Redis cannot be reached right now. The filter is failing open, so every request reaches the site."}
      </p>
    );
  }

  const { totals } = stats;
  const blockRate = totals.total === 0 ? 0 : Math.round((totals.blocked / totals.total) * 100);
  const outOfSync = stats.publishedPaths !== stats.livePages;

  return (
    <div className="viz-root" data-testid="live-stats">
      <p data-testid="filter-mode" className={`mode mode-${stats.mode}`}>
        {stats.mode === "enforce"
          ? "Filter is ON: requests for unpublished paths are blocked."
          : "Filter is OFF: every request is passed to the site."}
      </p>

      <dl className="tiles">
        <div className="tile">
          <dt>Reached the site</dt>
          <dd data-testid="count-forwarded">{totals.forwarded.toLocaleString()}</dd>
        </div>
        <div className="tile">
          <dt>Blocked by the filter</dt>
          <dd data-testid="count-blocked">{totals.blocked.toLocaleString()}</dd>
        </div>
        <div className="tile">
          <dt>Share blocked</dt>
          <dd>{blockRate}%</dd>
        </div>
        <div className="tile">
          <dt>Failed open</dt>
          <dd data-testid="count-fail-open">{totals["fail-open"].toLocaleString()}</dd>
        </div>
      </dl>
      <p className="note">Counts cover requests that came through the filter since the last reset.</p>
      {totals.rejected > 0 && <p>{totals.rejected.toLocaleString()} request(s) were refused for not coming through Azure Front Door.</p>}

      <p data-testid="filter-paths" className={outOfSync ? "error" : undefined}>
        The filter knows {stats.publishedPaths} published page(s); the live site has {stats.livePages}.
        {outOfSync && " They differ: use Resync below."}
      </p>

      <MinuteChart minutes={stats.minutes} />

      {stats.lastAttack && (
        <p data-testid="last-attack">
          Last demo attack ({stats.lastAttack.target === "filter" ? "through the filter" : "straight at the site"}):{" "}
          {stats.lastAttack.sent} requests, <strong>{stats.lastAttack.reachedSite} reached the site</strong>,{" "}
          {stats.lastAttack.blocked} blocked
          {stats.lastAttack.failed ? `, ${stats.lastAttack.failed} got no answer` : ""}, in{" "}
          {(stats.lastAttack.durationMs / 1000).toFixed(1)}s.
        </p>
      )}
    </div>
  );
}

type Minute = Extract<FilterStats, { available: true }>["minutes"][number];

const W = 600;
const H = 200;
const PAD = { left: 40, right: 8, top: 8, bottom: 22 };
const GAP = 2;

function niceMax(n: number): number {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= n) return step * pow;
  return 10 * pow;
}

/** Rectangle with rounded top corners only: data end rounded, baseline square. */
function topRounded(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function minutesAgo(i: number, count: number): string {
  const ago = count - 1 - i;
  return ago === 0 ? "this minute" : `${ago} min ago`;
}

function MinuteChart({ minutes }: { minutes: Minute[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const count = minutes.length;
  const max = niceMax(Math.max(0, ...minutes.map((m) => m.counts.forwarded + m.counts.blocked)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / count;
  const barW = Math.max(2, slot - GAP);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const shown = hover ?? count - 1;
  const focus = minutes[shown];

  return (
    <figure className="chart">
      <figcaption>
        <strong>Requests per minute, last {count} minutes</strong>
        <span className="legend">
          <span className="swatch swatch-forwarded" aria-hidden="true" /> Reached the site
          <span className="swatch swatch-blocked" aria-hidden="true" /> Blocked
        </span>
      </figcaption>
      <p className="readout" data-testid="chart-readout">
        {minutesAgo(shown, count)}: {focus.counts.forwarded} reached the site, {focus.counts.blocked} blocked
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={hover === null ? undefined : "has-hover"}
        role="img" aria-label="Requests per minute that reached the site or were blocked">
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="axis" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {minutes.map((m, i) => {
          const x = PAD.left + i * slot + GAP / 2;
          const fwd = m.counts.forwarded;
          const blk = m.counts.blocked;
          const fwdTop = y(fwd);
          const fwdH = PAD.top + plotH - fwdTop;
          const blkTop = y(fwd + blk);
          const blkH = Math.max(0, fwdTop - blkTop - (fwd > 0 ? GAP : 0));
          return (
            <g key={m.minute} className={hover === i ? "bar hovered" : "bar"}>
              {fwd > 0 && (
                <path className="fill-forwarded" d={blk > 0 ? `M${x},${fwdTop}h${barW}v${fwdH}h${-barW}Z` : topRounded(x, fwdTop, barW, fwdH)} />
              )}
              {blk > 0 && blkH > 0 && <path className="fill-blocked" d={topRounded(x, blkTop, barW, blkH)} />}
              <rect
                className="hit"
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={plotH}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
        <line className="baseline" x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />
        <text className="axis" x={PAD.left} y={H - 6}>
          {count} min ago
        </text>
        <text className="axis" x={W - PAD.right} y={H - 6} textAnchor="end">
          now
        </text>
      </svg>
      <details>
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th align="left">Minute</th>
              <th align="right">Reached the site</th>
              <th align="right">Blocked</th>
            </tr>
          </thead>
          <tbody>
            {minutes
              .map((m, i) => ({ m, i }))
              .filter(({ m }) => m.counts.total > 0)
              .reverse()
              .map(({ m, i }) => (
                <tr key={m.minute}>
                  <td>{minutesAgo(i, count)}</td>
                  <td align="right">{m.counts.forwarded}</td>
                  <td align="right">{m.counts.blocked}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
