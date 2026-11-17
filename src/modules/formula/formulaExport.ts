/**
 * Generates clean standalone SVG and crisp 300 DPI PNG exports from a rendered formula preview element.
 * Uses self-contained styling inside SVG <foreignObject> with zero external requests to avoid canvas tainting,
 * with automatic pure-Canvas fallback if a browser blocks foreignObject rasterization.
 */

function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildFormulaSvg(options: {
  latex: string;
  readableText: string;
  equationNumber?: string;
  color?: string;
  fontSize?: number;
  width?: number;
  height?: number;
}): { svgString: string; width: number; height: number } {
  const width = options.width ?? 520;
  const height = options.height ?? 140;
  const fontSize = options.fontSize ?? 24;
  const color = options.color ?? '#0f172a';
  const cleanText = options.readableText.trim() || options.latex;

  const numXml = options.equationNumber?.trim()
    ? `<text x="${width - 24}" y="${height / 2 + fontSize * 0.3}" text-anchor="end" font-family="Times New Roman, serif" font-size="${Math.round(fontSize * 0.78)}" fill="${escapeXmlText(color)}">(${escapeXmlText(options.equationNumber.trim())})</text>`
    : '';

  const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
  <text x="${options.equationNumber?.trim() ? width * 0.44 : width / 2}" y="${height / 2 + fontSize * 0.32}" text-anchor="middle" font-family="Cambria Math, Times New Roman, serif" font-style="italic" font-size="${fontSize}" fill="${escapeXmlText(color)}">${escapeXmlText(cleanText)}</text>
  ${numXml}
</svg>`;

  return { svgString, width, height };
}

export async function renderFormulaPreviewToPng(options: {
  previewEl: HTMLElement | null;
  readableText: string;
  latex: string;
  equationNumber?: string;
  color?: string;
  fontSize?: number;
}): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const rect = options.previewEl?.getBoundingClientRect();
  const baseW = Math.max(320, Math.ceil(rect?.width ? Math.min(rect.width, 720) : 520));
  const baseH = Math.max(110, Math.ceil(rect?.height ? Math.min(rect.height + 24, 280) : 130));

  const scale = 3; // ~300 DPI crispness
  const canvas = document.createElement('canvas');
  canvas.width = baseW * scale;
  canvas.height = baseH * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không khởi tạo được Canvas xuất ảnh.');

  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, baseW, baseH);

  // Try rasterizing KaTeX DOM cleanly via self-contained SVG foreignObject if available
  const katexEl = options.previewEl?.querySelector('.katex') as HTMLElement | null;
  if (katexEl) {
    const htmlContent = katexEl.outerHTML;
    const foSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${baseW}" height="${baseH}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${baseW}px;height:${baseH}px;display:flex;align-items:center;justify-content:center;background:#ffffff;color:${options.color || '#0f172a'};font-family:'Times New Roman',serif;font-size:${options.fontSize || 22}px;padding:12px;box-sizing:border-box;">
          ${htmlContent}
        </div>
      </foreignObject>
    </svg>`;
    const blobUrl = URL.createObjectURL(new Blob([foSvg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const loadedImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('foreignObject raster fallback'));
        img.src = blobUrl;
      });
      ctx.drawImage(loadedImg, 0, 0, baseW, baseH);
      // Verify canvas is not tainted
      const dataUrl = canvas.toDataURL('image/png');
      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được PNG.'))), 'image/png');
      });
      return { blob: pngBlob, dataUrl, width: baseW, height: baseH };
    } catch {
      // Fallback below renders directly onto canvas
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  // Guaranteed taint-free 2D Canvas text fallback
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, baseW, baseH);
  ctx.fillStyle = options.color || '#0f172a';
  const fs = options.fontSize || 22;
  ctx.font = `italic ${fs}px "Cambria Math", "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textX = options.equationNumber?.trim() ? baseW * 0.44 : baseW / 2;
  ctx.fillText(options.readableText || options.latex, textX, baseH / 2, baseW - 48);

  if (options.equationNumber?.trim()) {
    ctx.font = `${Math.round(fs * 0.78)}px "Times New Roman", serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`(${options.equationNumber.trim()})`, baseW - 20, baseH / 2);
  }

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được PNG.'))), 'image/png');
  });
  return { blob, dataUrl, width: baseW, height: baseH };
}

export function formatReadableFormulaFallback(latex: string): string {
  return (latex || '')
    .replace(/\\dfrac|\\tfrac|\\frac/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\vec\{([^{}]+)\}/g, '$1⃗')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\pm/g, '±')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\pi/g, 'π')
    .replace(/\\omega/g, 'ω')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\int/g, '∫')
    .replace(/\\sum/g, '∑')
    .replace(/\\rightarrow|\\longrightarrow|\\to/g, '→')
    .replace(/\\rightleftharpoons/g, '⇌')
    .replace(/\\uparrow/g, '↑')
    .replace(/\\downarrow/g, '↓')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
