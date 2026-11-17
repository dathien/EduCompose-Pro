export interface GraphFunctionSpec {
  id: string;
  expr: string;
  color: string;
  strokeWidth?: number;
  label?: string;
}

export interface GraphPointSpec {
  x: number;
  y: number;
  label?: string;
  color?: string;
}

export interface FunctionGraphConfig {
  width: number;
  height: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  showGrid: boolean;
  showTicks: boolean;
  functions: GraphFunctionSpec[];
  asymptotesX?: number[];
  asymptotesY?: number[];
  points?: GraphPointSpec[];
}

export function evaluateMathExpr(rawExpr: string, xVal: number): number | null {
  try {
    let s = rawExpr.trim();
    if (!s) return null;

    // Support piecewise condition syntax: "cond ? exprA : exprB"
    if (s.includes('?') && s.includes(':')) {
      const qIdx = s.indexOf('?');
      const cIdx = s.indexOf(':', qIdx);
      if (qIdx > 0 && cIdx > qIdx) {
        const cond = s.slice(0, qIdx).trim();
        const tBranch = s.slice(qIdx + 1, cIdx).trim();
        const fBranch = s.slice(cIdx + 1).trim();
        const condMatch = cond.match(/^x\s*(<=|>=|<|>|==)\s*([-+]?\d*\.?\d+)$/);
        if (condMatch) {
          const op = condMatch[1];
          const num = Number(condMatch[2]);
          const ok =
            (op === '<' && xVal < num) ||
            (op === '<=' && xVal <= num) ||
            (op === '>' && xVal > num) ||
            (op === '>=' && xVal >= num) ||
            (op === '==' && Math.abs(xVal - num) < 1e-9);
          return evaluateMathExpr(ok ? tBranch : fBranch, xVal);
        }
      }
    }

    // Normalize common mathematical notation into safe JS Math calls
    s = s
      .replace(/,/g, '.')
      .replace(/\s+/g, '')
      .replace(/(\d)(x|\()/gi, '$1*$2')
      .replace(/(\))(x|\d|\()/gi, '$1*$2')
      .replace(/(x)(\()/gi, '$1*$2')
      .replace(/\^/g, '**')
      .replace(/\bpi\b/gi, 'Math.PI')
      .replace(/\be\b/g, 'Math.E')
      .replace(/\bsin\(/gi, 'Math.sin(')
      .replace(/\bcos\(/gi, 'Math.cos(')
      .replace(/\btan\(/gi, 'Math.tan(')
      .replace(/\bcot\(/gi, '(1/Math.tan)(')
      .replace(/\bsqrt\(/gi, 'Math.sqrt(')
      .replace(/\babs\(/gi, 'Math.abs(')
      .replace(/\bln\(/gi, 'Math.log(')
      .replace(/\blog\(/gi, 'Math.log10(')
      .replace(/\bexp\(/gi, 'Math.exp(');

    // Handle |expr| bars if present (single level)
    s = s.replace(/\|([^|]+)\|/g, 'Math.abs($1)');

    // Security check: strip allowed Math identifiers and verify only safe characters remain
    const stripped = s
      .replace(/Math\.(PI|E|sin|cos|tan|sqrt|abs|log10|log|exp)/g, '')
      .replace(/\bx\b/g, '');
    if (!/^[0-9+\-*/().*\s]*$/.test(stripped)) {
      return null;
    }

    const fn = new Function('x', `"use strict"; return (${s});`) as (x: number) => number;
    const val = fn(xVal);
    if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val)) {
      return null;
    }
    return val;
  } catch {
    return null;
  }
}

export function buildFunctionGraphSvgInner(cfg: FunctionGraphConfig): string {
  const { width: W, height: H, xMin, xMax, yMin, yMax } = cfg;
  const padL = 28;
  const padR = 24;
  const padT = 22;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toPxX = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
  const toPxY = (y: number) => padT + ((yMax - y) / (yMax - yMin)) * plotH;

  const parts: string[] = [];
  const clipId = `gclip_${Math.round(W)}_${Math.round(H)}`;
  parts.push(`<defs><clipPath id="${clipId}"><rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}"/></clipPath></defs>`);

  // Background grid
  if (cfg.showGrid) {
    const gridLines: string[] = [];
    for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
      const px = toPxX(x);
      gridLines.push(`<line x1="${px.toFixed(1)}" y1="${padT}" x2="${px.toFixed(1)}" y2="${padT + plotH}" stroke="#e2e8f0" stroke-width="1"/>`);
    }
    for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
      const py = toPxY(y);
      gridLines.push(`<line x1="${padL}" y1="${py.toFixed(1)}" x2="${padL + plotW}" y2="${py.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`);
    }
    parts.push(`<g>${gridLines.join('')}</g>`);
  }

  // Axes
  const ox = toPxX(Math.min(xMax, Math.max(xMin, 0)));
  const oy = toPxY(Math.min(yMax, Math.max(yMin, 0)));
  parts.push(`<line x1="${padL - 8}" y1="${oy.toFixed(1)}" x2="${padL + plotW + 10}" y2="${oy.toFixed(1)}" stroke="#0f172a" stroke-width="1.5"/>`);
  parts.push(`<polygon points="${padL + plotW + 14},${oy.toFixed(1)} ${padL + plotW + 6},${(oy - 4).toFixed(1)} ${padL + plotW + 6},${(oy + 4).toFixed(1)}" fill="#0f172a"/>`);
  parts.push(`<line x1="${ox.toFixed(1)}" y1="${padT + plotH + 8}" x2="${ox.toFixed(1)}" y2="${padT - 10}" stroke="#0f172a" stroke-width="1.5"/>`);
  parts.push(`<polygon points="${ox.toFixed(1)},${padT - 14} ${(ox - 4).toFixed(1)},${padT - 6} ${(ox + 4).toFixed(1)},${padT - 6}" fill="#0f172a"/>`);
  parts.push(`<text x="${padL + plotW + 8}" y="${oy + 15}" font-size="13" font-style="italic" font-family="Times New Roman, serif" fill="#0f172a">x</text>`);
  parts.push(`<text x="${ox + 7}" y="${padT - 4}" font-size="13" font-style="italic" font-family="Times New Roman, serif" fill="#0f172a">y</text>`);
  parts.push(`<text x="${ox - 13}" y="${oy + 14}" font-size="12" font-style="italic" font-family="Times New Roman, serif" fill="#0f172a">O</text>`);

  // Axis Ticks
  if (cfg.showTicks) {
    const xStep = xMax - xMin > 14 ? 2 : 1;
    const yStep = yMax - yMin > 14 ? 2 : 1;
    for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x += xStep) {
      if (x === 0) continue;
      const px = toPxX(x);
      parts.push(`<line x1="${px.toFixed(1)}" y1="${oy - 3}" x2="${px.toFixed(1)}" y2="${oy + 3}" stroke="#0f172a" stroke-width="1.1"/>`);
      parts.push(`<text x="${px.toFixed(1)}" y="${oy + 15}" text-anchor="middle" font-size="11" font-family="Times New Roman, serif" fill="#334155">${x}</text>`);
    }
    for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y += yStep) {
      if (y === 0) continue;
      const py = toPxY(y);
      parts.push(`<line x1="${ox - 3}" y1="${py.toFixed(1)}" x2="${ox + 3}" y2="${py.toFixed(1)}" stroke="#0f172a" stroke-width="1.1"/>`);
      parts.push(`<text x="${ox - 7}" y="${py + 4}" text-anchor="end" font-size="11" font-family="Times New Roman, serif" fill="#334155">${y}</text>`);
    }
  }

  // Asymptotes inside clip
  const clipped: string[] = [];
  if (cfg.asymptotesX) {
    for (const ax of cfg.asymptotesX) {
      if (ax >= xMin && ax <= xMax) {
        const px = toPxX(ax);
        clipped.push(`<line x1="${px.toFixed(1)}" y1="${padT}" x2="${px.toFixed(1)}" y2="${padT + plotH}" stroke="#dc2626" stroke-width="1.3" stroke-dasharray="5,4"/>`);
      }
    }
  }
  if (cfg.asymptotesY) {
    for (const ay of cfg.asymptotesY) {
      if (ay >= yMin && ay <= yMax) {
        const py = toPxY(ay);
        clipped.push(`<line x1="${padL}" y1="${py.toFixed(1)}" x2="${padL + plotW}" y2="${py.toFixed(1)}" stroke="#dc2626" stroke-width="1.3" stroke-dasharray="5,4"/>`);
      }
    }
  }

  // Curves (high resolution, strict asymptote/discontinuity splitting)
  const samples = 420;
  const ySpan = yMax - yMin;
  for (const fnSpec of cfg.functions) {
    let segs: string[] = [];
    let currentPath = '';
    let prevY: number | null = null;

    for (let i = 0; i <= samples; i++) {
      const xv = xMin + ((xMax - xMin) * i) / samples;
      // Check proximity to explicit asymptote
      const nearAsymptote = cfg.asymptotesX?.some((ax) => Math.abs(xv - ax) < (xMax - xMin) / (samples * 0.8));
      const yv = nearAsymptote ? null : evaluateMathExpr(fnSpec.expr, xv);

      if (yv === null) {
        if (currentPath) {
          segs.push(currentPath);
          currentPath = '';
        }
        prevY = null;
        continue;
      }

      // Break path cleanly if jump indicates vertical asymptote / discontinuity
      if (prevY !== null && Math.abs(yv - prevY) > ySpan * 0.68) {
        if (currentPath) {
          segs.push(currentPath);
          currentPath = '';
        }
      }

      const px = toPxX(xv);
      const py = toPxY(Math.max(yMin - ySpan * 0.5, Math.min(yMax + ySpan * 0.5, yv)));
      currentPath += currentPath ? ` L ${px.toFixed(2)} ${py.toFixed(2)}` : `M ${px.toFixed(2)} ${py.toFixed(2)}`;
      prevY = yv;
    }
    if (currentPath) segs.push(currentPath);

    for (const d of segs) {
      clipped.push(`<path d="${d}" fill="none" stroke="${fnSpec.color}" stroke-width="${fnSpec.strokeWidth ?? 2.2}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  }

  // Highlighted special points (extrema, intersections)
  if (cfg.points) {
    for (const pt of cfg.points) {
      if (pt.x >= xMin && pt.x <= xMax && pt.y >= yMin && pt.y <= yMax) {
        const px = toPxX(pt.x);
        const py = toPxY(pt.y);
        clipped.push(`<line x1="${px.toFixed(1)}" y1="${oy.toFixed(1)}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3,3"/>`);
        clipped.push(`<line x1="${ox.toFixed(1)}" y1="${py.toFixed(1)}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3,3"/>`);
        clipped.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.6" fill="${pt.color || '#0284c7'}" stroke="#ffffff" stroke-width="1.2"/>`);
        if (pt.label) {
          clipped.push(`<text x="${(px + 6).toFixed(1)}" y="${(py - 6).toFixed(1)}" font-size="11" font-weight="600" font-family="Times New Roman, serif" fill="#0f172a">${pt.label}</text>`);
        }
      }
    }
  }

  parts.push(`<g clip-path="url(#${clipId})">${clipped.join('')}</g>`);
  return parts.join('\n');
}

// Variation Table ("Bảng biến thiên") Model & SVG Builder
export interface VariationNode {
  xLabel: string;
  yPrimeAtNode: '0' | '||' | ''; // At the boundary/critical x
  yValueTop?: string; // Either single value or left/right at asymptote
  yValueBot?: string;
  yPos: 'top' | 'mid' | 'bot' | 'asymptote';
}

export interface VariationInterval {
  sign: '+' | '-';
  trend: 'up' | 'down';
}

export interface VariationTableConfig {
  nodes: VariationNode[]; // N nodes
  intervals: VariationInterval[]; // N - 1 intervals
  yPrimeSymbol?: string;
  ySymbol?: string;
}

export function buildVariationTableSvgInner(
  cfg: VariationTableConfig,
  width = 560,
  height = 210
): string {
  const n = cfg.nodes.length;
  if (n < 2) return '';
  const leftColW = 68;
  const pad = 10;
  const tableW = width - pad * 2;
  const row1H = 38;
  const row2H = 38;
  const row3H = height - pad * 2 - row1H - row2H;
  const bodyW = tableW - leftColW;

  // Map each node index 0..n-1 to x coordinate
  const nodeXs = cfg.nodes.map((_, i) => {
    if (i === 0) return pad + leftColW + 24;
    if (i === n - 1) return pad + tableW - 24;
    return pad + leftColW + 24 + ((bodyW - 48) * i) / (n - 1);
  });

  const parts: string[] = [];
  const y0 = pad;
  const y1 = y0 + row1H;
  const y2 = y1 + row2H;
  const y3 = y2 + row3H;

  // Outer border & horizontal dividers
  parts.push(`<rect x="${pad}" y="${y0}" width="${tableW}" height="${row1H + row2H + row3H}" fill="#ffffff" stroke="#0f172a" stroke-width="1.6"/>`);
  parts.push(`<line x1="${pad}" y1="${y1}" x2="${pad + tableW}" y2="${y1}" stroke="#0f172a" stroke-width="1.4"/>`);
  parts.push(`<line x1="${pad}" y1="${y2}" x2="${pad + tableW}" y2="${y2}" stroke="#0f172a" stroke-width="1.4"/>`);
  parts.push(`<line x1="${pad + leftColW}" y1="${y0}" x2="${pad + leftColW}" y2="${y3}" stroke="#0f172a" stroke-width="1.5"/>`);

  // Left labels
  parts.push(`<text x="${pad + leftColW / 2}" y="${y0 + row1H / 2 + 5}" text-anchor="middle" font-size="16" font-style="italic" font-family="Times New Roman, serif" fill="#0f172a">x</text>`);
  parts.push(`<text x="${pad + leftColW / 2}" y="${y1 + row2H / 2 + 5}" text-anchor="middle" font-size="16" font-style="italic" font-family="Times New Roman, serif" fill="#0f172a">${cfg.yPrimeSymbol || "y'"}</text>`);
  parts.push(`<text x="${pad + leftColW / 2}" y="${y2 + row3H / 2 + 5}" text-anchor="middle" font-size="16" font-style="italic" font-family="Times New Roman, serif" fill="#0f172a">${cfg.ySymbol || 'y'}</text>`);

  // Defs for arrowhead
  parts.push(`<defs><marker id="vbtArrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#0f172a"/></marker></defs>`);

  const yPosToPx = (pos: 'top' | 'mid' | 'bot' | 'asymptote') => {
    if (pos === 'top') return y2 + 22;
    if (pos === 'bot') return y3 - 16;
    return y2 + row3H / 2 + 4;
  };

  // Nodes (x, y' marker, vertical ||, y values)
  cfg.nodes.forEach((node, idx) => {
    const nx = nodeXs[idx];
    parts.push(`<text x="${nx.toFixed(1)}" y="${y0 + row1H / 2 + 5}" text-anchor="middle" font-size="15" font-family="Times New Roman, serif" fill="#0f172a">${node.xLabel}</text>`);

    if (node.yPrimeAtNode === '0') {
      parts.push(`<text x="${nx.toFixed(1)}" y="${y1 + row2H / 2 + 5}" text-anchor="middle" font-size="15" font-family="Times New Roman, serif" fill="#0f172a">0</text>`);
    } else if (node.yPrimeAtNode === '||') {
      parts.push(`<line x1="${(nx - 2).toFixed(1)}" y1="${y1 + 2}" x2="${(nx - 2).toFixed(1)}" y2="${y3 - 2}" stroke="#0f172a" stroke-width="1.3"/>`);
      parts.push(`<line x1="${(nx + 2).toFixed(1)}" y1="${y1 + 2}" x2="${(nx + 2).toFixed(1)}" y2="${y3 - 2}" stroke="#0f172a" stroke-width="1.3"/>`);
    }

    if (node.yPos === 'asymptote') {
      // Left and right values near vertical ||
      if (node.yValueTop) {
        parts.push(`<text x="${(nx - 7).toFixed(1)}" y="${y2 + 22}" text-anchor="end" font-size="14" font-family="Times New Roman, serif" fill="#0f172a">${node.yValueTop}</text>`);
      }
      if (node.yValueBot) {
        parts.push(`<text x="${(nx + 7).toFixed(1)}" y="${y3 - 14}" text-anchor="start" font-size="14" font-family="Times New Roman, serif" fill="#0f172a">${node.yValueBot}</text>`);
      }
    } else {
      const py = yPosToPx(node.yPos);
      parts.push(`<text x="${nx.toFixed(1)}" y="${py.toFixed(1)}" text-anchor="middle" font-size="15" font-family="Times New Roman, serif" fill="#0f172a">${node.yValueTop || ''}</text>`);
    }
  });

  // Intervals (signs + and -, monotonic arrows)
  cfg.intervals.forEach((intv, idx) => {
    const xA = nodeXs[idx];
    const xB = nodeXs[idx + 1];
    const midX = (xA + xB) / 2;

    parts.push(`<text x="${midX.toFixed(1)}" y="${y1 + row2H / 2 + 6}" text-anchor="middle" font-size="16" font-weight="600" font-family="Times New Roman, serif" fill="${intv.sign === '+' ? '#0284c7' : '#dc2626'}">${intv.sign}</text>`);

    const startY = intv.trend === 'up' ? y3 - 22 : y2 + 22;
    const endY = intv.trend === 'up' ? y2 + 22 : y3 - 22;
    const ax1 = xA + 18;
    const ax2 = xB - 18;
    parts.push(`<line x1="${ax1.toFixed(1)}" y1="${startY.toFixed(1)}" x2="${ax2.toFixed(1)}" y2="${endY.toFixed(1)}" stroke="#0f172a" stroke-width="1.6" marker-end="url(#vbtArrow)"/>`);
  });

  return parts.join('\n');
}

export type StatChartType = 'bar' | 'line' | 'pie' | 'histogram' | 'boxplot' | 'scatter' | 'normal';

export interface StatDataPoint {
  label: string;
  value: number;
  x?: number; // For scatter
}

export function buildStatisticalChartSvgInner(
  chartType: StatChartType,
  title: string,
  data: StatDataPoint[],
  opts: { width?: number; height?: number; color?: string; mu?: number; sigma?: number } = {}
): string {
  const W = opts.width ?? 480;
  const H = opts.height ?? 300;
  const color = opts.color ?? '#0284c7';
  const palette = ['#0284c7', '#0d9488', '#f59e0b', '#e11d48', '#6366f1', '#16a34a', '#ea580c'];
  const parts: string[] = [];

  if (title) {
    parts.push(`<text x="${W / 2}" y="22" text-anchor="middle" font-size="15" font-weight="700" font-family="Inter, Segoe UI, sans-serif" fill="#0f172a">${title}</text>`);
  }

  const padL = 48;
  const padR = 24;
  const padT = 40;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (chartType === 'pie') {
    const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
    const cx = W * 0.38;
    const cy = H * 0.54;
    const r = Math.min(plotW, plotH) * 0.42;
    let startAng = -Math.PI / 2;

    data.forEach((d, idx) => {
      const val = Math.max(0, d.value);
      const sliceAng = (val / total) * Math.PI * 2;
      const endAng = startAng + sliceAng;
      const x1 = cx + r * Math.cos(startAng);
      const y1 = cy + r * Math.sin(startAng);
      const x2 = cx + r * Math.cos(endAng);
      const y2 = cy + r * Math.sin(endAng);
      const largeArc = sliceAng > Math.PI ? 1 : 0;
      const c = palette[idx % palette.length];
      parts.push(`<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${c}" stroke="#ffffff" stroke-width="1.5"/>`);

      // Legend on right
      const ly = 58 + idx * 24;
      const lx = W * 0.68;
      parts.push(`<rect x="${lx}" y="${ly}" width="12" height="12" rx="2" fill="${c}"/>`);
      parts.push(`<text x="${lx + 18}" y="${ly + 10}" font-size="12" font-family="Inter, Segoe UI, sans-serif" fill="#0f172a">${d.label}: ${((val / total) * 100).toFixed(1)}%</text>`);
      startAng = endAng;
    });
    return parts.join('\n');
  }

  if (chartType === 'normal') {
    const mu = opts.mu ?? 0;
    const sigma = Math.max(0.2, opts.sigma ?? 1);
    const xMin = mu - 3.5 * sigma;
    const xMax = mu + 3.5 * sigma;
    const maxY = 1 / (sigma * Math.sqrt(2 * Math.PI));
    const toPxX = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
    const toPxY = (y: number) => padT + plotH - (y / (maxY * 1.12)) * plotH;

    parts.push(`<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#0f172a" stroke-width="1.4"/>`);
    parts.push(`<line x1="${toPxX(mu).toFixed(1)}" y1="${padT}" x2="${toPxX(mu).toFixed(1)}" y2="${padT + plotH}" stroke="#94a3b8" stroke-dasharray="4,3" stroke-width="1.2"/>`);

    const pts: string[] = [];
    for (let i = 0; i <= 140; i++) {
      const xv = xMin + ((xMax - xMin) * i) / 140;
      const yv = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((xv - mu) / sigma, 2));
      pts.push(`${i === 0 ? 'M' : 'L'} ${toPxX(xv).toFixed(1)} ${toPxY(yv).toFixed(1)}`);
    }
    const areaD = `${pts.join(' ')} L ${toPxX(xMax).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${toPxX(xMin).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;
    parts.push(`<path d="${areaD}" fill="${color}" fill-opacity="0.16"/>`);
    parts.push(`<path d="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.4"/>`);
    parts.push(`<text x="${toPxX(mu).toFixed(1)}" y="${padT + plotH + 18}" text-anchor="middle" font-size="12" fill="#0f172a">μ = ${mu}</text>`);
    parts.push(`<text x="${toPxX(mu - sigma).toFixed(1)}" y="${padT + plotH + 18}" text-anchor="middle" font-size="11" fill="#475569">μ-σ</text>`);
    parts.push(`<text x="${toPxX(mu + sigma).toFixed(1)}" y="${padT + plotH + 18}" text-anchor="middle" font-size="11" fill="#475569">μ+σ</text>`);
    return parts.join('\n');
  }

  if (chartType === 'boxplot') {
    const vals = [...data.map((d) => d.value)].sort((a, b) => a - b);
    if (vals.length < 3) return parts.join('\n');
    const min = vals[0];
    const max = vals[vals.length - 1];
    const q1 = vals[Math.floor(vals.length * 0.25)];
    const med = vals[Math.floor(vals.length * 0.5)];
    const q3 = vals[Math.floor(vals.length * 0.75)];
    const span = Math.max(1e-6, max - min);
    const lo = min - span * 0.12;
    const hi = max + span * 0.12;
    const toX = (v: number) => padL + ((v - lo) / (hi - lo)) * plotW;
    const cy = padT + plotH * 0.48;

    parts.push(`<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#0f172a" stroke-width="1.3"/>`);
    // Whiskers
    parts.push(`<line x1="${toX(min).toFixed(1)}" y1="${cy}" x2="${toX(q1).toFixed(1)}" y2="${cy}" stroke="#0f172a" stroke-width="1.8"/>`);
    parts.push(`<line x1="${toX(q3).toFixed(1)}" y1="${cy}" x2="${toX(max).toFixed(1)}" y2="${cy}" stroke="#0f172a" stroke-width="1.8"/>`);
    parts.push(`<line x1="${toX(min).toFixed(1)}" y1="${cy - 16}" x2="${toX(min).toFixed(1)}" y2="${cy + 16}" stroke="#0f172a" stroke-width="1.8"/>`);
    parts.push(`<line x1="${toX(max).toFixed(1)}" y1="${cy - 16}" x2="${toX(max).toFixed(1)}" y2="${cy + 16}" stroke="#0f172a" stroke-width="1.8"/>`);
    // IQR Box
    parts.push(`<rect x="${toX(q1).toFixed(1)}" y="${cy - 28}" width="${Math.max(4, toX(q3) - toX(q1)).toFixed(1)}" height="56" fill="#bae6fd" stroke="${color}" stroke-width="2"/>`);
    parts.push(`<line x1="${toX(med).toFixed(1)}" y1="${cy - 28}" x2="${toX(med).toFixed(1)}" y2="${cy + 28}" stroke="#dc2626" stroke-width="2.4"/>`);
    [
      { label: `Min: ${min}`, v: min },
      { label: `Q1: ${q1}`, v: q1 },
      { label: `Me: ${med}`, v: med },
      { label: `Q3: ${q3}`, v: q3 },
      { label: `Max: ${max}`, v: max },
    ].forEach((m) => {
      parts.push(`<text x="${toX(m.v).toFixed(1)}" y="${padT + plotH + 18}" text-anchor="middle" font-size="11" fill="#0f172a">${m.label}</text>`);
    });
    return parts.join('\n');
  }

  if (chartType === 'scatter') {
    const pts = data.map((d, idx) => ({ x: d.x ?? idx + 1, y: d.value }));
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(0, ...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y)) * 1.15 || 10;
    const xSpan = Math.max(1e-6, maxX - minX);
    const toPxX = (x: number) => padL + ((x - minX + xSpan * 0.08) / (xSpan * 1.16)) * plotW;
    const toPxY = (y: number) => padT + plotH - ((y - minY) / Math.max(1e-6, maxY - minY)) * plotH;

    parts.push(`<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#0f172a" stroke-width="1.4"/>`);
    parts.push(`<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#0f172a" stroke-width="1.4"/>`);

    // Least-squares linear regression y = a x + b
    const nPts = pts.length;
    if (nPts >= 2) {
      const meanX = pts.reduce((s, p) => s + p.x, 0) / nPts;
      const meanY = pts.reduce((s, p) => s + p.y, 0) / nPts;
      const num = pts.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
      const den = pts.reduce((s, p) => s + (p.x - meanX) * (p.x - meanX), 0);
      if (den > 1e-9) {
        const slope = num / den;
        const intercept = meanY - slope * meanX;
        const y1 = slope * minX + intercept;
        const y2 = slope * maxX + intercept;
        parts.push(`<line x1="${toPxX(minX).toFixed(1)}" y1="${toPxY(y1).toFixed(1)}" x2="${toPxX(maxX).toFixed(1)}" y2="${toPxY(y2).toFixed(1)}" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="5,3"/>`);
      }
    }

    pts.forEach((p) => {
      parts.push(`<circle cx="${toPxX(p.x).toFixed(1)}" cy="${toPxY(p.y).toFixed(1)}" r="4.5" fill="${color}" stroke="#ffffff" stroke-width="1.2"/>`);
    });
    return parts.join('\n');
  }

  // Bar, Histogram, or Line
  const maxVal = Math.max(1, ...data.map((d) => d.value)) * 1.15;
  parts.push(`<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#0f172a" stroke-width="1.4"/>`);
  parts.push(`<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#0f172a" stroke-width="1.4"/>`);

  // Horizontal grid lines (4 ticks)
  for (let i = 1; i <= 4; i++) {
    const val = (maxVal * i) / 4;
    const py = padT + plotH - (val / maxVal) * plotH;
    parts.push(`<line x1="${padL}" y1="${py.toFixed(1)}" x2="${padL + plotW}" y2="${py.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`);
    parts.push(`<text x="${padL - 6}" y="${(py + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#475569">${Math.round(val * 10) / 10}</text>`);
  }

  const slotW = plotW / Math.max(1, data.length);
  if (chartType === 'line') {
    const pts = data.map((d, i) => {
      const cx = padL + slotW * (i + 0.5);
      const cy = padT + plotH - (Math.max(0, d.value) / maxVal) * plotH;
      return { cx, cy, d };
    });
    const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(' ');
    parts.push(`<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5"/>`);
    pts.forEach((p) => {
      parts.push(`<circle cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="4.2" fill="${color}" stroke="#ffffff" stroke-width="1.4"/>`);
      parts.push(`<text x="${p.cx.toFixed(1)}" y="${(p.cy - 8).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="#0f172a">${p.d.value}</text>`);
      parts.push(`<text x="${p.cx.toFixed(1)}" y="${padT + plotH + 17}" text-anchor="middle" font-size="11" fill="#334155">${p.d.label}</text>`);
    });
  } else {
    const gap = chartType === 'histogram' ? 0 : Math.max(6, slotW * 0.28);
    data.forEach((d, i) => {
      const bw = Math.max(8, slotW - gap);
      const bx = padL + slotW * i + gap / 2;
      const bh = (Math.max(0, d.value) / maxVal) * plotH;
      const by = padT + plotH - bh;
      const fillC = chartType === 'histogram' ? color : palette[i % palette.length];
      parts.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${fillC}" fill-opacity="0.88" stroke="#0f172a" stroke-width="${chartType === 'histogram' ? 1 : 0.6}"/>`);
      parts.push(`<text x="${(bx + bw / 2).toFixed(1)}" y="${(by - 5).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="#0f172a">${d.value}</text>`);
      parts.push(`<text x="${(bx + bw / 2).toFixed(1)}" y="${padT + plotH + 17}" text-anchor="middle" font-size="11" fill="#334155">${d.label}</text>`);
    });
  }

  return parts.join('\n');
}
