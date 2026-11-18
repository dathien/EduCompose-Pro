import React from 'react';
import { formulaSvg } from './formulaSvg';
import { DrawingElement, StrokeDashStyle } from '../../types';

export function getStrokeDashArray(style: StrokeDashStyle): string | undefined {
  switch (style) {
    case 'dashed':
      return '6,4';
    case 'dotted':
      return '2,3';
    case 'dashdot':
      return '7,3,2,3';
    default:
      return undefined;
  }
}

export function getElementAnchors(el: DrawingElement): { x: number; y: number }[] {
  // Electrical components and lines expose left/right (or top/bottom) terminal anchors in local unrotated space relative to center
  const hw = el.width / 2;
  const hh = el.height / 2;
  const rad = (el.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rotatePt = (lx: number, ly: number) => ({
    x: el.x + lx * cos - ly * sin,
    y: el.y + lx * sin + ly * cos,
  });

  if (
    el.kind.startsWith('phys_battery') ||
    el.kind.startsWith('phys_resistor') ||
    el.kind.startsWith('phys_rheostat') ||
    el.kind.startsWith('phys_bulb') ||
    el.kind.startsWith('phys_switch') ||
    el.kind.startsWith('phys_ammeter') ||
    el.kind.startsWith('phys_voltmeter') ||
    el.kind.startsWith('phys_capacitor') ||
    el.kind.startsWith('phys_inductor') ||
    el.kind === 'phys_wire_line'
  ) {
    return [rotatePt(-hw, 0), rotatePt(hw, 0)];
  }
  return [rotatePt(0, -hh), rotatePt(hw, 0), rotatePt(0, hh), rotatePt(-hw, 0)];
}

function parseLabels(raw: string | undefined, defaults: string[]): string[] {
  if (!raw) return defaults;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return defaults.map((d, i) => parts[i] ?? d);
}

/**
 * Renders gravity-aware liquid inside a vessel clipPath:
 * The vessel rotates by `rotation`, and the liquid surface rotates back by `-rotation`
 * so the free surface remains horizontal with respect to gravity.
 */
function GravityAwareLiquid({
  clipId,
  vesselPath,
  w,
  h,
  rotation,
  liquidLevel = 45,
  liquidColor = '#bae6fd',
  showPrecipitate = false,
  precipitateColor = '#94a3b8',
  bubbleCount = 0,
  chamberTop = 0.14,
  chamberBottom = 0.94,
}: {
  clipId: string;
  vesselPath: string;
  w: number;
  h: number;
  rotation: number;
  liquidLevel?: number;
  liquidColor?: string;
  showPrecipitate?: boolean;
  precipitateColor?: string;
  bubbleCount?: number;
  chamberTop?: number;
  chamberBottom?: number;
}) {
  const level = Math.max(0, Math.min(100, liquidLevel));
  const usableHeight = (chamberBottom - chamberTop) * h;
  const surfaceY = chamberBottom * h - (level / 100) * usableHeight;
  const bigSize = Math.max(w, h) * 3;

  const bubbles = Array.from({ length: Math.min(12, Math.max(0, bubbleCount)) }, (_, idx) => {
    const bx = w * (0.3 + ((idx * 19) % 40) / 100);
    const by = surfaceY + ((idx * 17 + 8) % Math.max(14, Math.floor(h * 0.3)));
    const r = 1.6 + (idx % 3) * 0.7;
    return { bx, by: Math.min(chamberBottom * h - 6, by), r };
  });

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={vesselPath} />
        </clipPath>
      </defs>
      {level > 0 && (
        <g clipPath={`url(#${clipId})`}>
          <g transform={`rotate(${-rotation}, ${w / 2}, ${h / 2})`}>
            <rect
              x={-bigSize / 2 + w / 2}
              y={surfaceY}
              width={bigSize}
              height={bigSize}
              fill={liquidColor}
              fillOpacity={0.78}
            />
            <line
              x1={-bigSize / 2 + w / 2}
              y1={surfaceY}
              x2={bigSize / 2 + w / 2}
              y2={surfaceY}
              stroke="#0284c7"
              strokeWidth={1.2}
              strokeOpacity={0.75}
            />
          </g>
          {showPrecipitate && (
            <path
              d={`M ${w * 0.15} ${chamberBottom * h - 8} Q ${w * 0.5} ${chamberBottom * h - 13} ${w * 0.85} ${chamberBottom * h - 8} L ${w * 0.88} ${h} L ${w * 0.12} ${h} Z`}
              fill={precipitateColor}
              fillOpacity={0.9}
            />
          )}
          {bubbles.map((b, i) => (
            <circle
              key={i}
              cx={b.bx}
              cy={b.by}
              r={b.r}
              fill="#ffffff"
              fillOpacity={0.85}
              stroke="#0284c7"
              strokeWidth={0.8}
            />
          ))}
        </g>
      )}
    </>
  );
}

interface RendererProps {
  element: DrawingElement;
  uniqueSuffix?: string;
}

export const SvgElementRenderer: React.FC<RendererProps> = ({ element, uniqueSuffix = 'c' }) => {
  const { width: w, height: h, fill, stroke, strokeWidth, strokeDash, params, rotation } = element;
  const dash = getStrokeDashArray(strokeDash);
  const hiddenDash = '4,3';
  const clipId = `clip_${element.id}_${uniqueSuffix}`;

  const renderShape = () => {
    switch (element.kind) {
      case 'basic_text': {
        const fs = params.fontSize ?? 15;
        return (
          <text
            x={w / 2}
            y={h / 2 + fs * 0.34}
            textAnchor="middle"
            fill={stroke}
            fontSize={fs}
            fontFamily={params.fontFamily || 'Times New Roman, serif'}
          >
            {params.textContent || 'Nhãn văn bản'}
          </text>
        );
      }

      case 'basic_math': {
        const fs = params.fontSize ?? 16;
        try {
          const math = formulaSvg(params.latex || '');
          const scale = Math.min(fs / 1000, (w - 4) / Math.max(1, math.width), (h - 4) / Math.max(1, math.height));
          const mw = Math.max(1, math.width * scale), mh = Math.max(1, math.height * scale);
          return <g color={stroke}>
            <rect width={w} height={h} fill={fill} />
            <svg x={(w-mw)/2} y={(h-mh)/2} width={mw} height={mh} viewBox={math.viewBox} color={stroke} dangerouslySetInnerHTML={{ __html: math.inner }} />
          </g>;
        } catch {
          return <text x={w/2} y={h/2} textAnchor="middle" fill={stroke} fontSize={12}>Công thức chưa hợp lệ</text>;
        }
      }

      case 'basic_rect':
        return (
          <rect
            x={2}
            y={2}
            width={Math.max(4, w - 4)}
            height={Math.max(4, h - 4)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={dash}
          />
        );

      case 'basic_arrow':
      case 'phys_force_vector': {
        const cy = h / 2;
        const head = 10;
        return (
          <g>
            <line
              x1={4}
              y1={cy}
              x2={w - head}
              y2={cy}
              stroke={stroke}
              strokeWidth={Math.max(1.6, strokeWidth)}
              strokeDasharray={dash}
            />
            <polygon points={`${w - 2},${cy} ${w - head - 2},${cy - 5} ${w - head - 2},${cy + 5}`} fill={stroke} />
            {params.arrowLabel && (
              <text
                x={w * 0.5}
                y={cy - 7}
                textAnchor="middle"
                fill={stroke}
                fontSize={13}
                fontWeight={600}
                fontStyle="italic"
                fontFamily="Times New Roman, serif"
              >
                {params.arrowLabel}
              </text>
            )}
          </g>
        );
      }

      // TOÁN PHẲNG
      case 'math_point': {
        const [lbl] = parseLabels(params.labels, ['A']);
        return (
          <g>
            <circle cx={w / 2} cy={h / 2} r={3.5} fill={stroke} />
            <text x={w / 2 + 7} y={h / 2 - 5} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>
              {lbl}
            </text>
          </g>
        );
      }

      case 'math_triangle_right': {
        const [A, B, C] = parseLabels(params.labels, ['A', 'B', 'C']);
        const pA = { x: 18, y: 16 };
        const pB = { x: 18, y: h - 18 };
        const pC = { x: w - 18, y: h - 18 };
        return (
          <g>
            <polygon
              points={`${pA.x},${pA.y} ${pB.x},${pB.y} ${pC.x},${pC.y}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={dash}
              strokeLinejoin="round"
            />
            {params.showRightAngle && (
              <polyline
                points={`${pB.x},${pB.y - 12} ${pB.x + 12},${pB.y - 12} ${pB.x + 12},${pB.y}`}
                fill="none"
                stroke={stroke}
                strokeWidth={1.2}
              />
            )}
            <text x={pA.x - 10} y={pA.y + 4} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{A}</text>
            <text x={pB.x - 12} y={pB.y + 13} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{B}</text>
            <text x={pC.x + 5} y={pC.y + 13} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{C}</text>
          </g>
        );
      }

      case 'math_triangle_isosceles': {
        const [A, B, C] = parseLabels(params.labels, ['A', 'B', 'C']);
        const pA = { x: w / 2, y: 18 };
        const pB = { x: 18, y: h - 18 };
        const pC = { x: w - 18, y: h - 18 };
        const m1 = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
        const m2 = { x: (pA.x + pC.x) / 2, y: (pA.y + pC.y) / 2 };
        return (
          <g>
            <polygon
              points={`${pA.x},${pA.y} ${pB.x},${pB.y} ${pC.x},${pC.y}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={dash}
              strokeLinejoin="round"
            />
            {params.showAltitude && (
              <line x1={pA.x} y1={pA.y} x2={pA.x} y2={pB.y} stroke={stroke} strokeWidth={1.2} strokeDasharray={hiddenDash} />
            )}
            {params.showEqualTicks && (
              <>
                <line x1={m1.x - 4} y1={m1.y - 3} x2={m1.x + 4} y2={m1.y + 3} stroke={stroke} strokeWidth={1.4} />
                <line x1={m2.x + 4} y1={m2.y - 3} x2={m2.x - 4} y2={m2.y + 3} stroke={stroke} strokeWidth={1.4} />
              </>
            )}
            <text x={pA.x - 4} y={pA.y - 5} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{A}</text>
            <text x={pB.x - 12} y={pB.y + 12} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{B}</text>
            <text x={pC.x + 4} y={pC.y + 12} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{C}</text>
          </g>
        );
      }

      case 'math_parallelogram': {
        const [A, B, C, D] = parseLabels(params.labels, ['A', 'B', 'C', 'D']);
        const off = w * 0.18;
        return (
          <g>
            <polygon
              points={`${off + 12},16 ${w - 14},16 ${w - off - 12},${h - 16} 14,${h - 16}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={dash}
            />
            <text x={off + 2} y={13} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{A}</text>
            <text x={w - 11} y={13} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{B}</text>
            <text x={w - off - 8} y={h - 4} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{C}</text>
            <text x={4} y={h - 4} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{D}</text>
          </g>
        );
      }

      case 'math_trapezoid': {
        const [A, B, C, D] = parseLabels(params.labels, ['A', 'B', 'C', 'D']);
        const topLeft = params.showRightAngle ? 18 : w * 0.24;
        return (
          <g>
            <polygon
              points={`${topLeft},16 ${w * 0.72},16 ${w - 16},${h - 16} 18,${h - 16}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={dash}
            />
            {params.showRightAngle && (
              <polyline points={`18,${h - 28} 30,${h - 28} 30,${h - 16}`} fill="none" stroke={stroke} strokeWidth={1.2} />
            )}
            <text x={topLeft - 10} y={13} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{A}</text>
            <text x={w * 0.74} y={13} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{B}</text>
            <text x={w - 12} y={h - 4} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{C}</text>
            <text x={6} y={h - 4} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{D}</text>
          </g>
        );
      }

      case 'math_rhombus': {
        const [A, B, C, D] = parseLabels(params.labels, ['A', 'B', 'C', 'D']);
        return (
          <g>
            <polygon
              points={`${w / 2},16 ${w - 16},${h / 2} ${w / 2},${h - 16} 16,${h / 2}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={dash}
            />
            <line x1={w / 2} y1={16} x2={w / 2} y2={h - 16} stroke={stroke} strokeWidth={1} strokeDasharray={hiddenDash} />
            <line x1={16} y1={h / 2} x2={w - 16} y2={h / 2} stroke={stroke} strokeWidth={1} strokeDasharray={hiddenDash} />
            <text x={w / 2 - 4} y={12} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{A}</text>
            <text x={w - 11} y={h / 2 + 4} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{B}</text>
            <text x={w / 2 - 4} y={h - 3} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{C}</text>
            <text x={3} y={h / 2 + 4} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{D}</text>
          </g>
        );
      }

      case 'math_circle': {
        const [O] = parseLabels(params.labels, ['O']);
        const r = Math.min(w, h) / 2 - 14;
        return (
          <g>
            <circle cx={w / 2} cy={h / 2} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
            <circle cx={w / 2} cy={h / 2} r={2.5} fill={stroke} />
            {params.showAltitude && (
              <line x1={w / 2} y1={h / 2} x2={w / 2 + r * 0.78} y2={h / 2 - r * 0.62} stroke={stroke} strokeWidth={1.2} />
            )}
            <text x={w / 2 - 12} y={h / 2 + 14} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{O}</text>
          </g>
        );
      }

      case 'math_oxy_axes': {
        const [O, xLbl, yLbl] = parseLabels(params.labels, ['O', 'x', 'y']);
        const cx = w * 0.42;
        const cy = h * 0.58;
        return (
          <g>
            <line x1={12} y1={cy} x2={w - 12} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <polygon points={`${w - 8},${cy} ${w - 16},${cy - 4} ${w - 16},${cy + 4}`} fill={stroke} />
            <line x1={cx} y1={h - 12} x2={cx} y2={12} stroke={stroke} strokeWidth={strokeWidth} />
            <polygon points={`${cx},8 ${cx - 4},16 ${cx + 4},16`} fill={stroke} />
            <text x={cx - 14} y={cy + 15} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{O}</text>
            <text x={w - 16} y={cy + 16} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{xLbl}</text>
            <text x={cx + 8} y={18} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{yLbl}</text>
          </g>
        );
      }

      // TOÁN KHÔNG GIAN
      case 'math_cube': {
        const [A, B, C, D, Ap, Bp, Cp, Dp] = parseLabels(params.labels, ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"]);
        const dx = w * 0.24;
        const dy = h * 0.16;
        const x0 = 20;
        const y0 = dy + 16;
        const bw = w - dx - 38;
        const bh = h - dy - 38;
        // Front face: A'(top-left), B'(top-right), B(bot-right), A(bot-left) -> classic cube
        const topBackL = { x: x0 + dx, y: y0 - dy };
        const topBackR = { x: x0 + bw + dx, y: y0 - dy };
        const topFrontL = { x: x0, y: y0 };
        const topFrontR = { x: x0 + bw, y: y0 };
        const botBackL = { x: x0 + dx, y: y0 + bh - dy };
        const botBackR = { x: x0 + bw + dx, y: y0 + bh - dy };
        const botFrontL = { x: x0, y: y0 + bh };
        const botFrontR = { x: x0 + bw, y: y0 + bh };

        return (
          <g>
            {params.showCrossSection && (
              <polygon
                points={`${topFrontL.x},${topFrontL.y} ${topBackR.x},${topBackR.y} ${botFrontR.x},${botFrontR.y}`}
                fill={params.crossSectionColor || '#bae6fd'}
                fillOpacity={0.55}
                stroke="#0284c7"
                strokeWidth={1.2}
              />
            )}
            {/* Hidden edges */}
            {params.showHiddenEdges !== false && (
              <>
                <line x1={topBackL.x} y1={topBackL.y} x2={botBackL.x} y2={botBackL.y} stroke={stroke} strokeWidth={strokeWidth * 0.85} strokeDasharray={hiddenDash} />
                <line x1={botFrontL.x} y1={botFrontL.y} x2={botBackL.x} y2={botBackL.y} stroke={stroke} strokeWidth={strokeWidth * 0.85} strokeDasharray={hiddenDash} />
                <line x1={botBackL.x} y1={botBackL.y} x2={botBackR.x} y2={botBackR.y} stroke={stroke} strokeWidth={strokeWidth * 0.85} strokeDasharray={hiddenDash} />
              </>
            )}
            {/* Visible edges */}
            <polygon
              points={`${topFrontL.x},${topFrontL.y} ${topFrontR.x},${topFrontR.y} ${botFrontR.x},${botFrontR.y} ${botFrontL.x},${botFrontL.y}`}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            <polyline
              points={`${topFrontL.x},${topFrontL.y} ${topBackL.x},${topBackL.y} ${topBackR.x},${topBackR.y} ${topFrontR.x},${topFrontR.y}`}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            <polyline
              points={`${topBackR.x},${topBackR.y} ${botBackR.x},${botBackR.y} ${botFrontR.x},${botFrontR.y}`}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            <text x={topBackL.x - 12} y={topBackL.y + 2} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{Ap}</text>
            <text x={topBackR.x + 4} y={topBackR.y + 2} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{Bp}</text>
            <text x={topFrontR.x + 4} y={topFrontR.y + 12} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{Cp}</text>
            <text x={topFrontL.x - 14} y={topFrontL.y + 6} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{Dp}</text>
            <text x={botBackL.x - 11} y={botBackL.y - 3} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{A}</text>
            <text x={botBackR.x + 4} y={botBackR.y + 4} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{B}</text>
            <text x={botFrontR.x + 3} y={botFrontR.y + 13} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{C}</text>
            <text x={botFrontL.x - 13} y={botFrontL.y + 12} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{D}</text>
          </g>
        );
      }

      case 'math_pyramid_quad': {
        const [S, A, B, C, D, O] = parseLabels(params.labels, ['S', 'A', 'B', 'C', 'D', 'O']);
        const pA = { x: w * 0.34, y: h * 0.68 };
        const pB = { x: 18, y: h - 22 };
        const pC = { x: w * 0.68, y: h - 22 };
        const pD = { x: w - 18, y: h * 0.68 };
        const pO = { x: (pA.x + pC.x) / 2, y: (pA.y + pC.y) / 2 };
        const pS = { x: pO.x, y: 20 };
        return (
          <g>
            {params.showHiddenEdges !== false && (
              <>
                <line x1={pS.x} y1={pS.y} x2={pA.x} y2={pA.y} stroke={stroke} strokeWidth={strokeWidth * 0.85} strokeDasharray={hiddenDash} />
                <line x1={pB.x} y1={pB.y} x2={pA.x} y2={pA.y} stroke={stroke} strokeWidth={strokeWidth * 0.85} strokeDasharray={hiddenDash} />
                <line x1={pA.x} y1={pA.y} x2={pD.x} y2={pD.y} stroke={stroke} strokeWidth={strokeWidth * 0.85} strokeDasharray={hiddenDash} />
                <line x1={pA.x} y1={pA.y} x2={pC.x} y2={pC.y} stroke={stroke} strokeWidth={1} strokeDasharray={hiddenDash} />
                <line x1={pB.x} y1={pB.y} x2={pD.x} y2={pD.y} stroke={stroke} strokeWidth={1} strokeDasharray={hiddenDash} />
              </>
            )}
            {params.showAltitude && (
              <>
                <line x1={pS.x} y1={pS.y} x2={pO.x} y2={pO.y} stroke={stroke} strokeWidth={1.3} strokeDasharray={hiddenDash} />
                {params.showRightAngle && (
                  <polyline points={`${pO.x},${pO.y - 10} ${pO.x + 10},${pO.y - 10} ${pO.x + 10},${pO.y}`} fill="none" stroke={stroke} strokeWidth={1} />
                )}
              </>
            )}
            <polyline
              points={`${pB.x},${pB.y} ${pC.x},${pC.y} ${pD.x},${pD.y} ${pS.x},${pS.y} ${pB.x},${pB.y}`}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            <line x1={pS.x} y1={pS.y} x2={pC.x} y2={pC.y} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={pS.x - 4} y={pS.y - 5} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{S}</text>
            <text x={pA.x - 13} y={pA.y - 3} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{A}</text>
            <text x={pB.x - 11} y={pB.y + 12} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{B}</text>
            <text x={pC.x + 3} y={pC.y + 12} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{C}</text>
            <text x={pD.x + 4} y={pD.y + 4} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{D}</text>
            {params.showAltitude && (
              <text x={pO.x + 5} y={pO.y + 12} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{O}</text>
            )}
          </g>
        );
      }

      case 'math_tetrahedron': {
        const [S, A, B, C] = parseLabels(params.labels, ['S', 'A', 'B', 'C']);
        const pS = { x: w * 0.44, y: 18 };
        const pA = { x: 18, y: h * 0.76 };
        const pB = { x: w * 0.54, y: h - 18 };
        const pC = { x: w - 18, y: h * 0.72 };
        return (
          <g>
            {params.showHiddenEdges !== false && (
              <line x1={pA.x} y1={pA.y} x2={pC.x} y2={pC.y} stroke={stroke} strokeWidth={strokeWidth * 0.85} strokeDasharray={hiddenDash} />
            )}
            <polygon points={`${pS.x},${pS.y} ${pA.x},${pA.y} ${pB.x},${pB.y} ${pC.x},${pC.y}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={pS.x} y1={pS.y} x2={pB.x} y2={pB.y} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={pS.x - 4} y={pS.y - 4} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{S}</text>
            <text x={pA.x - 11} y={pA.y + 5} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{A}</text>
            <text x={pB.x - 4} y={pB.y + 13} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{B}</text>
            <text x={pC.x + 4} y={pC.y + 5} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{C}</text>
          </g>
        );
      }

      case 'math_prism_tri': {
        const [A, B, C, Ap, Bp, Cp] = parseLabels(params.labels, ['A', 'B', 'C', "A'", "B'", "C'"]);
        const t1 = { x: 20, y: 24 };
        const t2 = { x: w - 20, y: 24 };
        const t3 = { x: w * 0.56, y: 48 };
        const b1 = { x: 20, y: h - 36 };
        const b2 = { x: w - 20, y: h - 36 };
        const b3 = { x: w * 0.56, y: h - 14 };
        return (
          <g>
            {params.showHiddenEdges !== false && (
              <line x1={b1.x} y1={b1.y} x2={b2.x} y2={b2.y} stroke={stroke} strokeWidth={strokeWidth * 0.85} strokeDasharray={hiddenDash} />
            )}
            <polygon points={`${t1.x},${t1.y} ${t2.x},${t2.y} ${t3.x},${t3.y}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <polyline points={`${t1.x},${t1.y} ${b1.x},${b1.y} ${b3.x},${b3.y} ${b2.x},${b2.y} ${t2.x},${t2.y}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={t3.x} y1={t3.y} x2={b3.x} y2={b3.y} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={t1.x - 13} y={t1.y + 3} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{Ap}</text>
            <text x={t2.x + 4} y={t2.y + 3} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{Bp}</text>
            <text x={t3.x + 4} y={t3.y - 2} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{Cp}</text>
            <text x={b1.x - 12} y={b1.y + 5} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{A}</text>
            <text x={b2.x + 4} y={b2.y + 5} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{B}</text>
            <text x={b3.x + 4} y={b3.y + 10} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{C}</text>
          </g>
        );
      }

      case 'math_cylinder': {
        const [O, Op] = parseLabels(params.labels, ['O', "O'"]);
        const rx = w / 2 - 18;
        const ry = 14;
        const cx = w / 2;
        const topY = 24;
        const botY = h - 24;
        return (
          <g>
            <ellipse cx={cx} cy={topY} rx={rx} ry={ry} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={cx - rx} y1={topY} x2={cx - rx} y2={botY} stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={cx + rx} y1={topY} x2={cx + rx} y2={botY} stroke={stroke} strokeWidth={strokeWidth} />
            <path d={`M ${cx - rx} ${botY} A ${rx} ${ry} 0 0 0 ${cx + rx} ${botY}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            {params.showHiddenEdges !== false && (
              <path d={`M ${cx - rx} ${botY} A ${rx} ${ry} 0 0 1 ${cx + rx} ${botY}`} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.85} strokeDasharray={hiddenDash} />
            )}
            {params.showAltitude && (
              <line x1={cx} y1={topY} x2={cx} y2={botY} stroke={stroke} strokeWidth={1.1} strokeDasharray={hiddenDash} />
            )}
            <circle cx={cx} cy={topY} r={2} fill={stroke} />
            <circle cx={cx} cy={botY} r={2} fill={stroke} />
            <text x={cx + 5} y={topY + 4} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{Op}</text>
            <text x={cx + 5} y={botY + 12} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{O}</text>
          </g>
        );
      }

      case 'math_cone': {
        const [S, O] = parseLabels(params.labels, ['S', 'O']);
        const rx = w / 2 - 18;
        const ry = 14;
        const cx = w / 2;
        const topY = 20;
        const botY = h - 24;
        return (
          <g>
            <line x1={cx} y1={topY} x2={cx - rx} y2={botY} stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={cx} y1={topY} x2={cx + rx} y2={botY} stroke={stroke} strokeWidth={strokeWidth} />
            <path d={`M ${cx - rx} ${botY} A ${rx} ${ry} 0 0 0 ${cx + rx} ${botY}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            {params.showHiddenEdges !== false && (
              <path d={`M ${cx - rx} ${botY} A ${rx} ${ry} 0 0 1 ${cx + rx} ${botY}`} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.85} strokeDasharray={hiddenDash} />
            )}
            {params.showAltitude && (
              <>
                <line x1={cx} y1={topY} x2={cx} y2={botY} stroke={stroke} strokeWidth={1.1} strokeDasharray={hiddenDash} />
                <line x1={cx} y1={botY} x2={cx + rx} y2={botY} stroke={stroke} strokeWidth={1.1} strokeDasharray={hiddenDash} />
                {params.showRightAngle && (
                  <polyline points={`${cx},${botY - 10} ${cx + 10},${botY - 10} ${cx + 10},${botY}`} fill="none" stroke={stroke} strokeWidth={1} />
                )}
              </>
            )}
            <text x={cx - 4} y={topY - 5} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{S}</text>
            <text x={cx - 12} y={botY + 13} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{O}</text>
          </g>
        );
      }

      case 'math_sphere': {
        const [O, R] = parseLabels(params.labels, ['O', 'R']);
        const r = Math.min(w, h) / 2 - 14;
        const cx = w / 2;
        const cy = h / 2;
        return (
          <g>
            <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <path d={`M ${cx - r} ${cy} A ${r} ${r * 0.3} 0 0 0 ${cx + r} ${cy}`} fill="none" stroke={stroke} strokeWidth={1.2} />
            {params.showHiddenEdges !== false && (
              <path d={`M ${cx - r} ${cy} A ${r} ${r * 0.3} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={stroke} strokeWidth={1.1} strokeDasharray={hiddenDash} />
            )}
            <circle cx={cx} cy={cy} r={2} fill={stroke} />
            <line x1={cx} y1={cy} x2={cx + r * 0.72} y2={cy - r * 0.4} stroke={stroke} strokeWidth={1.1} strokeDasharray={hiddenDash} />
            <text x={cx - 12} y={cy + 14} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{O}</text>
            <text x={cx + r * 0.36} y={cy - r * 0.25} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{R}</text>
          </g>
        );
      }

      case 'math_oxyz': {
        const [O, xL, yL, zL] = parseLabels(params.labels, ['O', 'x', 'y', 'z']);
        const ox = w * 0.42;
        const oy = h * 0.56;
        return (
          <g>
            <line x1={ox} y1={oy} x2={ox} y2={14} stroke={stroke} strokeWidth={strokeWidth} />
            <polygon points={`${ox},10 ${ox - 4},18 ${ox + 4},18`} fill={stroke} />
            <line x1={ox} y1={oy} x2={w - 14} y2={oy} stroke={stroke} strokeWidth={strokeWidth} />
            <polygon points={`${w - 10},${oy} ${w - 18},${oy - 4} ${w - 18},${oy + 4}`} fill={stroke} />
            <line x1={ox} y1={oy} x2={16} y2={h - 16} stroke={stroke} strokeWidth={strokeWidth} />
            <polygon points={`13,${h - 13} 21,${h - 15} 16,${h - 22}`} fill={stroke} />
            <text x={ox - 13} y={oy - 2} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{O}</text>
            <text x={24} y={h - 8} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{xL}</text>
            <text x={w - 18} y={oy + 15} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{yL}</text>
            <text x={ox + 7} y={20} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{zL}</text>
          </g>
        );
      }

      // VẬT LÍ: CƠ HỌC
      case 'phys_block':
        return (
          <g>
            <rect x={2} y={2} width={w - 4} height={h - 4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={w / 2} y={h / 2 + 5} textAnchor="middle" fontSize={14} fontStyle="italic" fontWeight={600} fontFamily="Times New Roman, serif" fill={stroke}>
              {params.arrowLabel || 'm'}
            </text>
          </g>
        );

      case 'phys_spring': {
        const coils = Math.max(4, Math.min(16, params.coilCount ?? 8));
        const topHook = 14;
        const botHook = h - 14;
        const span = (botHook - topHook) / coils;
        let d = `M ${w / 2} 2 L ${w / 2} ${topHook}`;
        for (let i = 0; i < coils; i++) {
          const y1 = topHook + i * span + span * 0.25;
          const y2 = topHook + i * span + span * 0.75;
          d += ` L ${w - 6} ${y1} L 6 ${y2}`;
        }
        d += ` L ${w / 2} ${botHook} L ${w / 2} ${h - 2}`;
        return <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />;
      }

      case 'phys_pendulum_simple': {
        const ang = ((params.angleDeg ?? 22) * Math.PI) / 180;
        const pivot = { x: w * 0.35, y: 12 };
        const len = h - 38;
        const bob = { x: pivot.x + len * Math.sin(ang), y: pivot.y + len * Math.cos(ang) };
        return (
          <g>
            <line x1={pivot.x - 24} y1={10} x2={pivot.x + 24} y2={10} stroke={stroke} strokeWidth={2.2} />
            <line x1={pivot.x} y1={pivot.y} x2={pivot.x} y2={h - 14} stroke={stroke} strokeWidth={1} strokeDasharray="4,3" />
            <line x1={pivot.x} y1={pivot.y} x2={bob.x} y2={bob.y} stroke={stroke} strokeWidth={strokeWidth} />
            <circle cx={bob.x} cy={bob.y} r={11} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={bob.x + 15} y={bob.y + 4} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>
              {params.arrowLabel || 'm'}
            </text>
          </g>
        );
      }

      case 'phys_incline_plane': {
        const deg = Math.max(10, Math.min(60, params.angleDeg ?? 30));
        const baseW = w - 20;
        const calcH = Math.min(h - 20, Math.tan((deg * Math.PI) / 180) * baseW);
        const x1 = 10;
        const y1 = h - 10;
        const x2 = w - 10;
        const y2 = h - 10;
        const x3 = w - 10;
        const y3 = h - 10 - calcH;
        return (
          <g>
            <polygon points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
            <path d={`M ${x1 + 28} ${y1} A 28 28 0 0 0 ${x1 + 24} ${y1 - 14}`} fill="none" stroke={stroke} strokeWidth={1.1} />
            <text x={x1 + 32} y={y1 - 6} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>
              {params.labels || 'α'}
            </text>
          </g>
        );
      }

      case 'phys_pulley': {
        const cx = w / 2;
        const cy = h * 0.45;
        const r = Math.min(w, h) * 0.3;
        return (
          <g>
            <line x1={cx - 18} y1={8} x2={cx + 18} y2={8} stroke={stroke} strokeWidth={2.2} />
            <line x1={cx} y1={8} x2={cx} y2={cy} stroke={stroke} strokeWidth={2} />
            <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <circle cx={cx} cy={cy} r={4} fill={stroke} />
            <line x1={cx - r} y1={cy} x2={cx - r} y2={h - 4} stroke={stroke} strokeWidth={1.5} />
            <line x1={cx + r} y1={cy} x2={cx + r} y2={h - 4} stroke={stroke} strokeWidth={1.5} />
          </g>
        );
      }

      case 'phys_wall_floor': {
        const hatches = Math.floor(w / 14);
        return (
          <g>
            <line x1={2} y1={8} x2={w - 2} y2={8} stroke={stroke} strokeWidth={strokeWidth} />
            {Array.from({ length: hatches }, (_, i) => {
              const hx = 6 + i * 14;
              return <line key={i} x1={hx} y1={8} x2={hx - 8} y2={h - 2} stroke={stroke} strokeWidth={1.1} />;
            })}
          </g>
        );
      }

      // VẬT LÍ: ĐIỆN HỌC
      case 'phys_battery': {
        const cy = h / 2;
        return (
          <g>
            <line x1={0} y1={cy} x2={w * 0.42} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={w * 0.42} y1={cy - 16} x2={w * 0.42} y2={cy + 16} stroke={stroke} strokeWidth={2} />
            <line x1={w * 0.54} y1={cy - 9} x2={w * 0.54} y2={cy + 9} stroke={stroke} strokeWidth={3.2} />
            <line x1={w * 0.54} y1={cy} x2={w} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={w * 0.34} y={cy - 12} fontSize={12} fill={stroke}>+</text>
            <text x={w * 0.58} y={cy - 12} fontSize={12} fill={stroke}>−</text>
            {params.arrowLabel && (
              <text x={w / 2} y={h - 3} textAnchor="middle" fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>
                {params.arrowLabel}
              </text>
            )}
          </g>
        );
      }

      case 'phys_resistor': {
        const cy = h / 2;
        return (
          <g>
            <line x1={0} y1={cy} x2={w * 0.24} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <rect x={w * 0.24} y={cy - 9} width={w * 0.52} height={18} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={w * 0.76} y1={cy} x2={w} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={w / 2} y={cy - 13} textAnchor="middle" fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>
              {params.arrowLabel || 'R'}
            </text>
          </g>
        );
      }

      case 'phys_rheostat': {
        const cy = h * 0.6;
        return (
          <g>
            <line x1={0} y1={cy} x2={w * 0.24} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <rect x={w * 0.24} y={cy - 9} width={w * 0.52} height={18} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={w * 0.76} y1={cy} x2={w} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <polyline points={`${w * 0.5},8 ${w * 0.5},${cy - 10}`} fill="none" stroke={stroke} strokeWidth={1.6} />
            <polygon points={`${w * 0.5},${cy - 9} ${w * 0.5 - 4},${cy - 16} ${w * 0.5 + 4},${cy - 16}`} fill={stroke} />
            <text x={w * 0.65} y={18} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>
              {params.arrowLabel || 'Rb'}
            </text>
          </g>
        );
      }

      case 'phys_bulb': {
        const cy = h / 2;
        const r = 15;
        return (
          <g>
            <line x1={0} y1={cy} x2={w / 2 - r} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <circle cx={w / 2} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={w / 2 - r * 0.7} y1={cy - r * 0.7} x2={w / 2 + r * 0.7} y2={cy + r * 0.7} stroke={stroke} strokeWidth={1.4} />
            <line x1={w / 2 + r * 0.7} y1={cy - r * 0.7} x2={w / 2 - r * 0.7} y2={cy + r * 0.7} stroke={stroke} strokeWidth={1.4} />
            <line x1={w / 2 + r} y1={cy} x2={w} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
          </g>
        );
      }

      case 'phys_switch': {
        const cy = h * 0.65;
        const closed = Boolean(params.switchClosed);
        return (
          <g>
            <line x1={0} y1={cy} x2={w * 0.32} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <circle cx={w * 0.32} cy={cy} r={3} fill={stroke} />
            <circle cx={w * 0.68} cy={cy} r={3} fill={stroke} />
            <line x1={w * 0.32} y1={cy} x2={w * 0.68} y2={closed ? cy : cy - 18} stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={w * 0.68} y1={cy} x2={w} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={w / 2} y={14} textAnchor="middle" fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>
              {params.arrowLabel || 'K'}
            </text>
          </g>
        );
      }

      case 'phys_ammeter':
      case 'phys_voltmeter': {
        const cy = h / 2;
        const r = 15;
        const letter = element.kind === 'phys_ammeter' ? 'A' : 'V';
        return (
          <g>
            <line x1={0} y1={cy} x2={w / 2 - r} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <circle cx={w / 2} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={w / 2} y={cy + 5} textAnchor="middle" fontSize={14} fontWeight={700} fontFamily="Times New Roman, serif" fill={stroke}>
              {params.arrowLabel || letter}
            </text>
            <line x1={w / 2 + r} y1={cy} x2={w} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
          </g>
        );
      }

      case 'phys_capacitor': {
        const cy = h / 2;
        return (
          <g>
            <line x1={0} y1={cy} x2={w * 0.43} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={w * 0.43} y1={cy - 14} x2={w * 0.43} y2={cy + 14} stroke={stroke} strokeWidth={2.2} />
            <line x1={w * 0.57} y1={cy - 14} x2={w * 0.57} y2={cy + 14} stroke={stroke} strokeWidth={2.2} />
            <line x1={w * 0.57} y1={cy} x2={w} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={w / 2} y={12} textAnchor="middle" fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>
              {params.arrowLabel || 'C'}
            </text>
          </g>
        );
      }

      case 'phys_inductor': {
        const cy = h * 0.62;
        const r = 7;
        const startX = w * 0.22;
        return (
          <g>
            <line x1={0} y1={cy} x2={startX} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <path
              d={`M ${startX} ${cy} A ${r} ${r} 0 0 1 ${startX + 2 * r} ${cy} A ${r} ${r} 0 0 1 ${startX + 4 * r} ${cy} A ${r} ${r} 0 0 1 ${startX + 6 * r} ${cy} A ${r} ${r} 0 0 1 ${startX + 8 * r} ${cy}`}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            <line x1={startX + 8 * r} y1={cy} x2={w} y2={cy} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={w / 2} y={14} textAnchor="middle" fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>
              {params.arrowLabel || 'L'}
            </text>
          </g>
        );
      }

      case 'phys_wire_line':
        return <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />;

      // SÓNG & QUANG
      case 'phys_sine_wave': {
        const cycles = Math.max(1, Math.min(5, params.waveCycles ?? 2));
        const cy = h / 2;
        const amp = h * 0.34;
        const pts: string[] = [];
        const steps = 60;
        for (let i = 0; i <= steps; i++) {
          const px = 8 + ((w - 16) * i) / steps;
          const py = cy - Math.sin((i / steps) * cycles * Math.PI * 2) * amp;
          pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
        }
        return (
          <g>
            <line x1={4} y1={cy} x2={w - 4} y2={cy} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,3" />
            <path d={pts.join(' ')} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
          </g>
        );
      }

      case 'phys_convex_lens': {
        const cx = w / 2;
        return (
          <g>
            <line x1={cx} y1={8} x2={cx} y2={h - 8} stroke={stroke} strokeWidth={strokeWidth} />
            <polyline points={`${cx - 7},16 ${cx},6 ${cx + 7},16`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <polyline points={`${cx - 7},${h - 16} ${cx},${h - 6} ${cx + 7},${h - 16}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <text x={cx + 8} y={h / 2 + 12} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>O</text>
          </g>
        );
      }

      case 'phys_concave_lens': {
        const cx = w / 2;
        return (
          <g>
            <line x1={cx} y1={8} x2={cx} y2={h - 8} stroke={stroke} strokeWidth={strokeWidth} />
            <polyline points={`${cx - 7},6 ${cx},16 ${cx + 7},6`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <polyline points={`${cx - 7},${h - 6} ${cx},${h - 16} ${cx + 7},${h - 6}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <text x={cx + 8} y={h / 2 + 12} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>O</text>
          </g>
        );
      }

      case 'phys_prism':
        return (
          <g>
            <polygon points={`${w / 2},12 ${w - 12},${h - 12} 12,${h - 12}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
            <text x={w / 2 - 4} y={32} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>
              {params.arrowLabel || 'A'}
            </text>
          </g>
        );

      // HÓA HỌC THỦY TINH (GRAVITY-AWARE)
      case 'chem_beaker': {
        const innerPath = `M ${w * 0.16} ${h * 0.14} L ${w * 0.16} ${h * 0.89} Q ${w * 0.16} ${h * 0.94} ${w * 0.24} ${h * 0.94} L ${w * 0.76} ${h * 0.94} Q ${w * 0.84} ${h * 0.94} ${w * 0.84} ${h * 0.89} L ${w * 0.84} ${h * 0.14} Z`;
        return (
          <g>
            <path
              d={`M ${w * 0.11} ${h * 0.1} L ${w * 0.15} ${h * 0.14} L ${w * 0.15} ${h * 0.9} Q ${w * 0.15} ${h * 0.95} ${w * 0.23} ${h * 0.95} L ${w * 0.77} ${h * 0.95} Q ${w * 0.85} ${h * 0.95} ${w * 0.85} ${h * 0.9} L ${w * 0.85} ${h * 0.14} L ${w * 0.89} ${h * 0.1}`}
              fill="#ffffff"
              fillOpacity={0.65}
              stroke="none"
            />
            <GravityAwareLiquid
              clipId={clipId}
              vesselPath={innerPath}
              w={w}
              h={h}
              rotation={rotation}
              liquidLevel={params.liquidLevel}
              liquidColor={params.liquidColor}
              showPrecipitate={params.showPrecipitate}
              precipitateColor={params.precipitateColor}
              bubbleCount={params.bubbleCount}
            />
            <path
              d={`M ${w * 0.1} ${h * 0.1} L ${w * 0.15} ${h * 0.15} L ${w * 0.15} ${h * 0.89} Q ${w * 0.15} ${h * 0.95} ${w * 0.24} ${h * 0.95} L ${w * 0.76} ${h * 0.95} Q ${w * 0.85} ${h * 0.95} ${w * 0.85} ${h * 0.89} L ${w * 0.85} ${h * 0.15} L ${w * 0.9} ${h * 0.1}`}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            {/* Graduations */}
            {[0.35, 0.52, 0.69].map((ratio, idx) => (
              <line key={idx} x1={w * 0.22} y1={h * ratio} x2={w * 0.34} y2={h * ratio} stroke={stroke} strokeWidth={1} strokeOpacity={0.65} />
            ))}
            {params.chemicalLabel && (
              <text x={w / 2} y={h * 0.78} textAnchor="middle" fontSize={11} fontWeight={600} fontFamily="Times New Roman, serif" fill="#0f172a">
                {params.chemicalLabel}
              </text>
            )}
          </g>
        );
      }

      case 'chem_test_tube': {
        const innerPath = `M ${w * 0.22} ${h * 0.12} L ${w * 0.22} ${h * 0.82} A ${w * 0.28} ${w * 0.28} 0 0 0 ${w * 0.78} ${h * 0.82} L ${w * 0.78} ${h * 0.12} Z`;
        return (
          <g>
            <path d={innerPath} fill="#ffffff" fillOpacity={0.65} />
            <GravityAwareLiquid
              clipId={clipId}
              vesselPath={innerPath}
              w={w}
              h={h}
              rotation={rotation}
              liquidLevel={params.liquidLevel}
              liquidColor={params.liquidColor}
              showPrecipitate={params.showPrecipitate}
              precipitateColor={params.precipitateColor}
              bubbleCount={params.bubbleCount}
              chamberTop={0.12}
              chamberBottom={0.95}
            />
            <path
              d={`M ${w * 0.14} ${h * 0.09} L ${w * 0.22} ${h * 0.12} L ${w * 0.22} ${h * 0.82} A ${w * 0.28} ${w * 0.28} 0 0 0 ${w * 0.78} ${h * 0.82} L ${w * 0.78} ${h * 0.12} L ${w * 0.86} ${h * 0.09}`}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {params.chemicalLabel && (
              <text x={w / 2} y={h * 0.65} textAnchor="middle" fontSize={10} fontWeight={600} fontFamily="Times New Roman, serif" fill="#0f172a">
                {params.chemicalLabel}
              </text>
            )}
          </g>
        );
      }

      case 'chem_erlenmeyer': {
        const innerPath = `M ${w * 0.38} ${h * 0.12} L ${w * 0.38} ${h * 0.34} L ${w * 0.12} ${h * 0.87} Q ${w * 0.1} ${h * 0.94} ${w * 0.18} ${h * 0.94} L ${w * 0.82} ${h * 0.94} Q ${w * 0.9} ${h * 0.94} ${w * 0.88} ${h * 0.87} L ${w * 0.62} ${h * 0.34} L ${w * 0.62} ${h * 0.12} Z`;
        return (
          <g>
            <path d={innerPath} fill="#ffffff" fillOpacity={0.65} />
            <GravityAwareLiquid
              clipId={clipId}
              vesselPath={innerPath}
              w={w}
              h={h}
              rotation={rotation}
              liquidLevel={params.liquidLevel}
              liquidColor={params.liquidColor}
              showPrecipitate={params.showPrecipitate}
              precipitateColor={params.precipitateColor}
              bubbleCount={params.bubbleCount}
              chamberTop={0.22}
              chamberBottom={0.94}
            />
            <path
              d={`M ${w * 0.33} ${h * 0.09} L ${w * 0.38} ${h * 0.12} L ${w * 0.38} ${h * 0.34} L ${w * 0.12} ${h * 0.87} Q ${w * 0.1} ${h * 0.94} ${w * 0.18} ${h * 0.94} L ${w * 0.82} ${h * 0.94} Q ${w * 0.9} ${h * 0.94} ${w * 0.88} ${h * 0.87} L ${w * 0.62} ${h * 0.34} L ${w * 0.62} ${h * 0.12} L ${w * 0.67} ${h * 0.09}`}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            {params.chemicalLabel && (
              <text x={w / 2} y={h * 0.82} textAnchor="middle" fontSize={11} fontWeight={600} fontFamily="Times New Roman, serif" fill="#0f172a">
                {params.chemicalLabel}
              </text>
            )}
          </g>
        );
      }

      case 'chem_round_flask': {
        const cx = w / 2;
        const cy = h * 0.64;
        const r = Math.min(w * 0.4, h * 0.31);
        const innerPath = `M ${cx - 10} ${h * 0.1} L ${cx - 10} ${cy - r * 0.88} A ${r} ${r} 0 1 0 ${cx + 10} ${cy - r * 0.88} L ${cx + 10} ${h * 0.1} Z`;
        return (
          <g>
            <path d={innerPath} fill="#ffffff" fillOpacity={0.65} />
            <GravityAwareLiquid
              clipId={clipId}
              vesselPath={innerPath}
              w={w}
              h={h}
              rotation={rotation}
              liquidLevel={params.liquidLevel}
              liquidColor={params.liquidColor}
              showPrecipitate={params.showPrecipitate}
              precipitateColor={params.precipitateColor}
              bubbleCount={params.bubbleCount}
              chamberTop={0.34}
              chamberBottom={0.94}
            />
            <path
              d={`M ${cx - 14} ${h * 0.08} L ${cx - 10} ${h * 0.11} L ${cx - 10} ${cy - r * 0.88} A ${r} ${r} 0 1 0 ${cx + 10} ${cy - r * 0.88} L ${cx + 10} ${h * 0.11} L ${cx + 14} ${h * 0.08}`}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </g>
        );
      }

      case 'chem_volumetric_flask': {
        const cx = w / 2;
        const innerPath = `M ${cx - 7} ${h * 0.1} L ${cx - 7} ${h * 0.52} L ${w * 0.14} ${h * 0.88} Q ${w * 0.14} ${h * 0.94} ${w * 0.24} ${h * 0.94} L ${w * 0.76} ${h * 0.94} Q ${w * 0.86} ${h * 0.94} ${w * 0.86} ${h * 0.88} L ${cx + 7} ${h * 0.52} L ${cx + 7} ${h * 0.1} Z`;
        return (
          <g>
            <path d={innerPath} fill="#ffffff" fillOpacity={0.65} />
            <GravityAwareLiquid
              clipId={clipId}
              vesselPath={innerPath}
              w={w}
              h={h}
              rotation={rotation}
              liquidLevel={params.liquidLevel}
              liquidColor={params.liquidColor}
              chamberTop={0.28}
              chamberBottom={0.94}
            />
            <path d={innerPath} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
            <line x1={cx - 10} y1={h * 0.36} x2={cx + 10} y2={h * 0.36} stroke="#0284c7" strokeWidth={1.2} />
            {params.chemicalLabel && (
              <text x={cx} y={h * 0.84} textAnchor="middle" fontSize={10} fontWeight={600} fill="#0f172a">
                {params.chemicalLabel}
              </text>
            )}
          </g>
        );
      }

      case 'chem_graduated_cylinder': {
        const innerPath = `M ${w * 0.24} ${h * 0.08} L ${w * 0.24} ${h * 0.9} L ${w * 0.76} ${h * 0.9} L ${w * 0.76} ${h * 0.08} Z`;
        return (
          <g>
            <path d={innerPath} fill="#ffffff" fillOpacity={0.65} />
            <GravityAwareLiquid
              clipId={clipId}
              vesselPath={innerPath}
              w={w}
              h={h}
              rotation={rotation}
              liquidLevel={params.liquidLevel}
              liquidColor={params.liquidColor}
              chamberTop={0.1}
              chamberBottom={0.9}
            />
            <path d={innerPath} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <rect x={w * 0.1} y={h * 0.9} width={w * 0.8} height={h * 0.06} rx={2} fill="#e2e8f0" stroke={stroke} strokeWidth={strokeWidth} />
            {[0.2, 0.32, 0.44, 0.56, 0.68, 0.8].map((r, i) => (
              <line key={i} x1={w * 0.24} y1={h * r} x2={w * (i % 2 === 0 ? 0.52 : 0.4)} y2={h * r} stroke={stroke} strokeWidth={1} />
            ))}
          </g>
        );
      }

      case 'chem_burette': {
        const cx = w / 2;
        const innerPath = `M ${cx - 8} ${h * 0.05} L ${cx - 8} ${h * 0.78} L ${cx - 2} ${h * 0.86} L ${cx - 2} ${h * 0.97} L ${cx + 2} ${h * 0.97} L ${cx + 2} ${h * 0.86} L ${cx + 8} ${h * 0.78} L ${cx + 8} ${h * 0.05} Z`;
        return (
          <g>
            <path d={innerPath} fill="#ffffff" fillOpacity={0.7} />
            <GravityAwareLiquid
              clipId={clipId}
              vesselPath={innerPath}
              w={w}
              h={h}
              rotation={rotation}
              liquidLevel={params.liquidLevel}
              liquidColor={params.liquidColor}
              chamberTop={0.08}
              chamberBottom={0.85}
            />
            <path d={innerPath} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            {/* Stopcock valve */}
            <rect x={cx - 12} y={h * 0.8} width={24} height={5} rx={1.5} fill="#0284c7" stroke={stroke} strokeWidth={1} />
            {[0.15, 0.25, 0.35, 0.45, 0.55, 0.65].map((r, i) => (
              <line key={i} x1={cx - 8} y1={h * r} x2={cx} y2={h * r} stroke={stroke} strokeWidth={0.9} />
            ))}
          </g>
        );
      }

      case 'chem_funnel': {
        const cx = w / 2;
        return (
          <g>
            <polygon
              points={`8,10 ${w - 8},10 ${cx + 5},${h * 0.56} ${cx + 5},${h - 6} ${cx - 5},${h - 10} ${cx - 5},${h * 0.56}`}
              fill="#ffffff"
              fillOpacity={0.75}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            {/* Filter paper */}
            <polyline points={`16,12 ${cx},${h * 0.52} ${w - 16},12`} fill="none" stroke="#64748b" strokeWidth={1.2} strokeDasharray="3,2" />
          </g>
        );
      }

      case 'chem_gas_jar': {
        const innerPath = `M ${w * 0.18} ${h * 0.14} L ${w * 0.18} ${h * 0.92} L ${w * 0.82} ${h * 0.92} L ${w * 0.82} ${h * 0.14} Z`;
        return (
          <g>
            <path d={innerPath} fill="#ffffff" fillOpacity={0.65} />
            <GravityAwareLiquid
              clipId={clipId}
              vesselPath={innerPath}
              w={w}
              h={h}
              rotation={rotation}
              liquidLevel={params.liquidLevel}
              liquidColor={params.liquidColor}
              bubbleCount={params.bubbleCount}
              chamberTop={0.14}
              chamberBottom={0.92}
            />
            <rect x={w * 0.12} y={h * 0.08} width={w * 0.76} height={6} rx={1.5} fill="#cbd5e1" stroke={stroke} strokeWidth={1.2} />
            <path d={innerPath} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            {params.chemicalLabel && (
              <text x={w / 2} y={h * 0.45} textAnchor="middle" fontSize={13} fontWeight={600} fontFamily="Times New Roman, serif" fill={stroke}>
                {params.chemicalLabel}
              </text>
            )}
          </g>
        );
      }

      case 'chem_alcohol_lamp': {
        const cx = w / 2;
        return (
          <g>
            {/* Flame */}
            {params.flameActive !== false && (
              <g>
                <path
                  d={`M ${cx} 6 C ${cx + 10} 20, ${cx + 9} 34, ${cx} 36 C ${cx - 9} 34, ${cx - 10} 20, ${cx} 6 Z`}
                  fill="#fb923c"
                  stroke="#ea580c"
                  strokeWidth={1}
                />
                <path
                  d={`M ${cx} 16 C ${cx + 5} 24, ${cx + 4} 33, ${cx} 35 C ${cx - 4} 33, ${cx - 5} 24, ${cx} 16 Z`}
                  fill="#fde047"
                />
              </g>
            )}
            {/* Wick & cap */}
            <line x1={cx} y1={35} x2={cx} y2={48} stroke={stroke} strokeWidth={2.5} />
            <rect x={cx - 8} y={44} width={16} height={8} rx={1.5} fill="#94a3b8" stroke={stroke} strokeWidth={1.3} />
            {/* Glass body */}
            <path
              d={`M ${cx - 10} 52 L ${w * 0.14} ${h * 0.72} L ${w * 0.18} ${h - 6} L ${w * 0.82} ${h - 6} L ${w * 0.86} ${h * 0.72} L ${cx + 10} 52 Z`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            <path
              d={`M ${w * 0.17} ${h * 0.78} L ${w * 0.2} ${h - 8} L ${w * 0.8} ${h - 8} L ${w * 0.83} ${h * 0.78} Z`}
              fill={params.liquidColor || '#bae6fd'}
              fillOpacity={0.75}
            />
          </g>
        );
      }

      case 'chem_stand_clamp':
        return (
          <g>
            {/* Heavy base */}
            <rect x={6} y={h - 14} width={w * 0.65} height={10} rx={2} fill="#475569" stroke={stroke} strokeWidth={1.4} />
            {/* Vertical rod */}
            <rect x={22} y={8} width={5} height={h - 22} fill="#94a3b8" stroke={stroke} strokeWidth={1.2} />
            {/* Clamp arm */}
            <rect x={20} y={h * 0.28} width={w * 0.64} height={6} rx={1} fill="#64748b" stroke={stroke} strokeWidth={1.2} />
            <path d={`M ${w * 0.84} ${h * 0.24} L ${w * 0.94} ${h * 0.26} L ${w * 0.94} ${h * 0.36} L ${w * 0.84} ${h * 0.38}`} fill="none" stroke={stroke} strokeWidth={2} />
          </g>
        );

      case 'chem_delivery_tube':
        return (
          <g>
            {/* Rubber stopper */}
            <polygon points={`4,14 20,10 20,28 4,24`} fill="#475569" stroke={stroke} strokeWidth={1.2} />
            {/* Bent glass tube */}
            <path
              d={`M 18 19 L ${w * 0.56} 19 Q ${w * 0.76} 19 ${w * 0.76} 38 L ${w * 0.76} ${h - 8}`}
              fill="none"
              stroke={stroke}
              strokeWidth={4}
              strokeLinecap="round"
            />
            <path
              d={`M 18 19 L ${w * 0.56} 19 Q ${w * 0.76} 19 ${w * 0.76} 38 L ${w * 0.76} ${h - 8}`}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </g>
        );

      case 'chem_tripod':
        return (
          <g>
            <line x1={10} y1={12} x2={w - 10} y2={12} stroke={stroke} strokeWidth={3} />
            <line x1={18} y1={8} x2={w - 18} y2={8} stroke="#64748b" strokeWidth={2} strokeDasharray="3,2" />
            <line x1={20} y1={12} x2={8} y2={h - 4} stroke={stroke} strokeWidth={2.2} />
            <line x1={w / 2} y1={12} x2={w / 2} y2={h - 4} stroke={stroke} strokeWidth={1.8} />
            <line x1={w - 20} y1={12} x2={w - 8} y2={h - 4} stroke={stroke} strokeWidth={2.2} />
          </g>
        );

      case 'chem_benzene': {
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) * 0.42;
        const pts = Array.from({ length: 6 }, (_, i) => {
          const a = (i * Math.PI) / 3 - Math.PI / 2;
          return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
        }).join(' ');
        return (
          <g>
            <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <circle cx={cx} cy={cy} r={r * 0.58} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.85} />
          </g>
        );
      }

      // SINH HỌC & TIN HỌC
      case 'bio_cell':
        return (
          <g>
            <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 6} ry={h / 2 - 6} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <circle cx={w * 0.46} cy={h * 0.48} r={Math.min(w, h) * 0.18} fill="#dbeafe" stroke={stroke} strokeWidth={1.4} />
            <circle cx={w * 0.46} cy={h * 0.48} r={Math.min(w, h) * 0.06} fill="#3b82f6" />
            <ellipse cx={w * 0.72} cy={h * 0.38} rx={11} ry={6} fill="#fee2e2" stroke="#dc2626" strokeWidth={1} />
            <ellipse cx={w * 0.25} cy={h * 0.65} rx={10} ry={5} fill="#fef3c7" stroke="#d97706" strokeWidth={1} />
          </g>
        );

      case 'bio_dna': {
        const steps = 6;
        const stepH = (h - 16) / steps;
        return (
          <g>
            {Array.from({ length: steps + 1 }, (_, i) => {
              const y = 8 + i * stepH;
              const offset = Math.sin((i / steps) * Math.PI * 2) * (w * 0.34);
              const x1 = w / 2 - offset;
              const x2 = w / 2 + offset;
              return (
                <g key={i}>
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke="#64748b" strokeWidth={1.4} />
                  <circle cx={x1} cy={y} r={3} fill={stroke} />
                  <circle cx={x2} cy={y} r={3} fill="#0d9488" />
                </g>
              );
            })}
          </g>
        );
      }

      case 'it_flow_start_end':
        return (
          <g>
            <rect x={2} y={2} width={w - 4} height={h - 4} rx={(h - 4) / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={13} fill={stroke}>{params.textContent || 'Bắt đầu'}</text>
          </g>
        );

      case 'it_flow_process':
        return (
          <g>
            <rect x={2} y={2} width={w - 4} height={h - 4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={13} fill={stroke}>{params.textContent || 'Xử lí'}</text>
          </g>
        );

      case 'it_flow_decision':
        return (
          <g>
            <polygon points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={12} fill={stroke}>{params.textContent || 'Điều kiện?'}</text>
          </g>
        );

      case 'math_triangle_general': {
        const [A, B, C] = parseLabels(params.labels, ['A', 'B', 'C']);
        const pA = { x: w * 0.36, y: 18 };
        const pB = { x: 16, y: h - 18 };
        const pC = { x: w - 16, y: h - 18 };
        return (
          <g>
            <polygon points={`${pA.x},${pA.y} ${pB.x},${pB.y} ${pC.x},${pC.y}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} strokeLinejoin="round" />
            {params.showAltitude && <line x1={pA.x} y1={pA.y} x2={pA.x} y2={pB.y} stroke={stroke} strokeWidth={1.1} strokeDasharray={hiddenDash} />}
            <text x={pA.x - 4} y={pA.y - 5} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{A}</text>
            <text x={pB.x - 11} y={pB.y + 12} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{B}</text>
            <text x={pC.x + 4} y={pC.y + 12} fontSize={14} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{C}</text>
          </g>
        );
      }

      case 'math_circle_tangent': {
        const [O, M] = parseLabels(params.labels, ['O', 'M']);
        const cx = w * 0.42;
        const cy = h * 0.54;
        const r = Math.min(w, h) * 0.32;
        const tx = cx + r * 0.707;
        const ty = cy - r * 0.707;
        return (
          <g>
            <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            <circle cx={cx} cy={cy} r={2.4} fill={stroke} />
            <circle cx={tx} cy={ty} r={2.6} fill={stroke} />
            <line x1={cx} y1={cy} x2={tx} y2={ty} stroke={stroke} strokeWidth={1.2} />
            {/* Tangent perpendicular at (tx, ty) */}
            <line x1={tx - 38} y1={ty - 38} x2={tx + 42} y2={ty + 42} stroke="#0284c7" strokeWidth={strokeWidth} />
            <text x={cx - 12} y={cy + 14} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{O}</text>
            <text x={tx + 6} y={ty - 6} fontSize={13} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>{M}</text>
          </g>
        );
      }

      case 'math_parabola': {
        const ox = w * 0.5;
        const oy = h * 0.72;
        const scaleX = w * 0.14;
        const scaleY = h * 0.14;
        const pts: string[] = [];
        for (let i = -20; i <= 20; i++) {
          const xv = i * 0.12;
          const yv = xv * xv;
          const px = ox + xv * scaleX;
          const py = oy - yv * scaleY;
          pts.push(`${i === -20 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
        }
        return (
          <g>
            <line x1={12} y1={oy} x2={w - 12} y2={oy} stroke={stroke} strokeWidth={1.3} />
            <polygon points={`${w - 8},${oy} ${w - 15},${oy - 3.5} ${w - 15},${oy + 3.5}`} fill={stroke} />
            <line x1={ox} y1={h - 10} x2={ox} y2={12} stroke={stroke} strokeWidth={1.3} />
            <polygon points={`${ox},8 ${ox - 3.5},15 ${ox + 3.5},15`} fill={stroke} />
            <path d={pts.join(' ')} fill="none" stroke="#0284c7" strokeWidth={strokeWidth} />
            <text x={ox - 12} y={oy + 14} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>O</text>
            <text x={w - 14} y={oy + 14} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>x</text>
            <text x={ox + 7} y={18} fontSize={12} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>y</text>
          </g>
        );
      }

      case 'math_trig_circle': {
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) * 0.36;
        const ang = -Math.PI / 5;
        const px = cx + r * Math.cos(ang);
        const py = cy + r * Math.sin(ang);
        return (
          <g>
            <line x1={10} y1={cy} x2={w - 10} y2={cy} stroke={stroke} strokeWidth={1.2} />
            <line x1={cx} y1={h - 10} x2={cx} y2={10} stroke={stroke} strokeWidth={1.2} />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={cx} y1={cy} x2={px} y2={py} stroke="#0284c7" strokeWidth={1.6} />
            <line x1={px} y1={py} x2={px} y2={cy} stroke="#0d9488" strokeWidth={1.1} strokeDasharray="3,2" />
            <line x1={px} y1={py} x2={cx} y2={py} stroke="#0d9488" strokeWidth={1.1} strokeDasharray="3,2" />
            <circle cx={px} cy={py} r={2.8} fill="#0284c7" />
            <text x={cx - 12} y={cy + 13} fontSize={11} fontStyle="italic" fontFamily="Times New Roman, serif" fill={stroke}>O</text>
          </g>
        );
      }

      case 'phys_standing_wave': {
        const loops = 3;
        const cy = h / 2;
        const amp = h * 0.34;
        const topPts: string[] = [];
        const botPts: string[] = [];
        for (let i = 0; i <= 60; i++) {
          const px = 12 + ((w - 24) * i) / 60;
          const val = Math.sin((i / 60) * loops * Math.PI) * amp;
          topPts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${(cy - val).toFixed(1)}`);
          botPts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${(cy + val).toFixed(1)}`);
        }
        return (
          <g>
            <line x1={10} y1={cy} x2={w - 10} y2={cy} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,3" />
            <path d={topPts.join(' ')} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <path d={botPts.join(' ')} fill="none" stroke={stroke} strokeWidth={1.3} strokeDasharray="4,3" />
            <circle cx={12} cy={cy} r={3} fill="#0f172a" />
            <circle cx={w - 12} cy={cy} r={3} fill="#0f172a" />
          </g>
        );
      }

      case 'phys_harmonic_graph': {
        const oy = h * 0.5;
        const ox = 22;
        const amp = h * 0.32;
        const pts: string[] = [];
        for (let i = 0; i <= 60; i++) {
          const px = ox + ((w - ox - 14) * i) / 60;
          const py = oy - Math.cos((i / 60) * 2.5 * Math.PI) * amp;
          pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
        }
        return (
          <g>
            <line x1={12} y1={oy} x2={w - 8} y2={oy} stroke="#334155" strokeWidth={1.2} />
            <line x1={ox} y1={h - 10} x2={ox} y2={10} stroke="#334155" strokeWidth={1.2} />
            <line x1={ox} y1={oy - amp} x2={w - 14} y2={oy - amp} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3,3" />
            <line x1={ox} y1={oy + amp} x2={w - 14} y2={oy + amp} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3,3" />
            <path d={pts.join(' ')} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <text x={ox + 5} y={16} fontSize={11} fontStyle="italic" fontFamily="Times New Roman, serif" fill="#334155">x</text>
            <text x={w - 12} y={oy + 13} fontSize={11} fontStyle="italic" fontFamily="Times New Roman, serif" fill="#334155">t</text>
          </g>
        );
      }

      case 'chem_separatory_funnel': {
        const cx = w / 2;
        const innerPath = `M ${w * 0.2} ${h * 0.16} Q ${w * 0.14} ${h * 0.44} ${cx - 4} ${h * 0.62} L ${cx + 4} ${h * 0.62} Q ${w * 0.86} ${h * 0.44} ${w * 0.8} ${h * 0.16} Z`;
        return (
          <g>
            <path d={innerPath} fill="#ffffff" fillOpacity={0.7} />
            <GravityAwareLiquid clipId={clipId} vesselPath={innerPath} w={w} h={h} rotation={rotation} liquidLevel={params.liquidLevel ?? 55} liquidColor={params.liquidColor || '#fde68a'} chamberTop={0.18} chamberBottom={0.62} />
            <path d={`${innerPath} M ${cx - 4} ${h * 0.62} L ${cx - 4} ${h * 0.94} M ${cx + 4} ${h * 0.62} L ${cx + 4} ${h * 0.94}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <rect x={cx - 12} y={h * 0.7} width={24} height={6} rx={2} fill="#0284c7" stroke={stroke} strokeWidth={1.1} />
          </g>
        );
      }

      case 'chem_thermometer':
        return (
          <g>
            <rect x={w / 2 - 4} y={8} width={8} height={h - 28} rx={4} fill="#ffffff" stroke={stroke} strokeWidth={1.4} />
            <circle cx={w / 2} cy={h - 14} r={9} fill="#ef4444" stroke={stroke} strokeWidth={1.4} />
            <rect x={w / 2 - 2} y={h * 0.35} width={4} height={h - 20 - h * 0.35} fill="#ef4444" />
            {[0.2, 0.35, 0.5, 0.65].map((r, i) => (
              <line key={i} x1={w / 2 + 4} y1={h * r} x2={w / 2 + 10} y2={h * r} stroke={stroke} strokeWidth={1} />
            ))}
          </g>
        );

      case 'chem_electrolytic_cell':
        return (
          <g>
            <rect x={12} y={h * 0.25} width={w - 24} height={h * 0.68} rx={4} fill="#f8fafc" stroke={stroke} strokeWidth={strokeWidth} />
            <rect x={14} y={h * 0.45} width={w - 28} height={h * 0.46} fill={params.liquidColor || '#bae6fd'} fillOpacity={0.75} />
            <rect x={w * 0.25} y={10} width={10} height={h * 0.68} fill="#64748b" stroke={stroke} strokeWidth={1.2} />
            <rect x={w * 0.65} y={10} width={10} height={h * 0.68} fill="#d97706" stroke={stroke} strokeWidth={1.2} />
            <text x={w * 0.28} y={h * 0.88} fontSize={10} fontWeight={600} fill="#0f172a">{params.chemicalLabel || 'CuSO₄'}</text>
          </g>
        );

      case 'embedded_svg': {
        const vb = (params.embeddedViewBox || `0 0 ${w} ${h}`).split(/\s+/).map(Number);
        const vbW = vb[2] || w;
        const vbH = vb[3] || h;
        return (
          <svg x={0} y={0} width={w} height={h} viewBox={`0 0 ${vbW} ${vbH}`}>
            <g dangerouslySetInnerHTML={{ __html: params.embeddedSvgInner || '' }} />
          </svg>
        );
      }

      default:
        return <rect x={2} y={2} width={w - 4} height={h - 4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    }
  };

  return (
    <g
      transform={`translate(${element.x}, ${element.y}) rotate(${element.rotation}) translate(${-w / 2}, ${-h / 2})`}
      opacity={element.opacity}
    >
      {renderShape()}
    </g>
  );
};
