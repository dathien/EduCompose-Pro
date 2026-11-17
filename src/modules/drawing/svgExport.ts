import { DrawingElement } from '../../types';

export const PX_PER_CM = 37.7952755906; // 96 DPI standard CSS cm -> px

export function getElementBounds(el: DrawingElement): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const hw = el.width / 2;
  const hh = el.height / 2;
  const rad = (el.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rx = hw * cos + hh * sin;
  const ry = hw * sin + hh * cos;
  return {
    minX: el.x - rx,
    minY: el.y - ry,
    maxX: el.x + rx,
    maxY: el.y + ry,
  };
}

export function getContentBoundingBox(
  elements: DrawingElement[],
  canvasWidthPx: number,
  canvasHeightPx: number,
  cropToContent: boolean,
  paddingPx = 16
): { x: number; y: number; width: number; height: number } {
  if (!cropToContent || elements.length === 0) {
    return { x: 0, y: 0, width: canvasWidthPx, height: canvasHeightPx };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const b = getElementBounds(el);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  return {
    x: Math.floor(minX - paddingPx),
    y: Math.floor(minY - paddingPx),
    width: Math.max(40, Math.ceil(maxX - minX + paddingPx * 2)),
    height: Math.max(40, Math.ceil(maxY - minY + paddingPx * 2)),
  };
}

export function buildStandaloneSvgString(
  svgElement: SVGSVGElement,
  viewBox: { x: number; y: number; width: number; height: number },
  whiteBackground: boolean
): string {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  // Remove editor-only overlays (selection handles, grid, anchor dots)
  clone.querySelectorAll('[data-editor-overlay="true"]').forEach((node) => node.remove());

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  clone.setAttribute('width', String(viewBox.width));
  clone.setAttribute('height', String(viewBox.height));

  if (whiteBackground) {
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', String(viewBox.x));
    bgRect.setAttribute('y', String(viewBox.y));
    bgRect.setAttribute('width', String(viewBox.width));
    bgRect.setAttribute('height', String(viewBox.height));
    bgRect.setAttribute('fill', '#ffffff');
    clone.insertBefore(bgRect, clone.firstChild);
  }

  const serializer = new XMLSerializer();
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(clone);
}

export async function renderSvgStringToPng(
  svgString: string,
  widthPx: number,
  heightPx: number,
  dpi: 96 | 150 | 300 = 300
): Promise<{ blob: Blob; dataUrl: string; pixelWidth: number; pixelHeight: number }> {
  const scale = dpi / 96;
  const pixelWidth = Math.max(1, Math.round(widthPx * scale));
  const pixelHeight = Math.max(1, Math.round(heightPx * scale));

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Không thể dựng ảnh PNG từ SVG.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D.');

    ctx.drawImage(img, 0, 0, pixelWidth, pixelHeight);
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Lỗi tạo tệp PNG.'))), 'image/png');
    });

    return { blob, dataUrl, pixelWidth, pixelHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}
