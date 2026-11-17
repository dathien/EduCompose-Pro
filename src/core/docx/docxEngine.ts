import JSZip from 'jszip';
import { convertLatexToMathMl } from 'mathlive';
import { DocumentBlock, WordDocumentRecord } from '../../types';
import { convertMathmlToOmml } from '../omml/mathmlToOmml';
import {
  ParsedRichBlock,
  ParsedRichRun,
  parseRichContentToBlocks,
} from '../math/richTextCodec';
import { generateId } from '../../utils/vietnamese';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripOuterOmmlNamespaces(omml: string): string {
  return omml
    .replace(/\s+xmlns:m="[^"]*"/g, '')
    .replace(/\s+xmlns:w="[^"]*"/g, '');
}

function cssColorToWordHex(color?: string): string | undefined {
  if (!color) return undefined;
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed.split('');
    return `${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgbMatch) {
    const toHex = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
    return `${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`.toUpperCase();
  }
  return undefined;
}

export function tryLatexToOmml(latexStr: string): string | null {
  try {
    const clean = latexStr.replace(/#\?/g, '\\square').trim();
    if (!clean) return null;
    const mml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${convertLatexToMathMl(clean)}</math>`;
    const res = convertMathmlToOmml(mml, clean);
    return res.supported ? stripOuterOmmlNamespaces(res.omml) : null;
  } catch {
    return null;
  }
}

async function svgStringToPngDataUrl(svgHtml: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (typeof document === 'undefined') return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgHtml, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return null;
    const vb = (svgEl.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    const wAttr = parseFloat(svgEl.getAttribute('width') || '');
    const hAttr = parseFloat(svgEl.getAttribute('height') || '');
    const width = Number.isFinite(wAttr) && wAttr > 0 ? wAttr : vb[2] || 420;
    const height = Number.isFinite(hAttr) && hAttr > 0 ? hAttr : vb[3] || 260;

    if (!svgEl.getAttribute('xmlns')) {
      svgEl.setAttribute('xmlns', 'http://www.w3.org/2006/svg');
    }
    const serialized = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = url;
      });
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { dataUrl: canvas.toDataURL('image/png'), width, height };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

const DEFAULT_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="26"/>
        <w:szCs w:val="26"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="120" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
      <w:sz w:val="26"/>
      <w:szCs w:val="26"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="160" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
      <w:b/>
      <w:sz w:val="32"/>
      <w:szCs w:val="32"/>
    </w:rPr>
  </w:style>
</w:styles>`;

const DEFAULT_SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:defaultTabStop w:val="720"/>
  <m:mathPr>
    <m:mathFont m:val="Cambria Math"/>
    <m:brkBin m:val="before"/>
    <m:brkBinSub m:val="--"/>
    <m:smallFrac m:val="0"/>
    <m:dispDef/>
    <m:lMargin m:val="0"/>
    <m:rMargin m:val="0"/>
    <m:defJc m:val="centerGroup"/>
    <m:wrapIndent m:val="1440"/>
    <m:intLim m:val="subSup"/>
    <m:naryLim m:val="undOvr"/>
  </m:mathPr>
</w:settings>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function buildWordRunProps(
  run: Partial<ParsedRichRun>,
  defaults?: { bold?: boolean; italic?: boolean; sizeHalfPt?: number; color?: string }
): string {
  const isBold = run.bold || defaults?.bold;
  const isItalic = run.italic || defaults?.italic;
  const font = escapeXml(run.fontFamily || 'Times New Roman');
  const sz = run.fontSizePt ? Math.round(run.fontSizePt * 2) : defaults?.sizeHalfPt ?? 26;
  const colorHex = cssColorToWordHex(run.color) || defaults?.color;
  const vert = run.superscript
    ? '<w:vertAlign w:val="superscript"/>'
    : run.subscript
    ? '<w:vertAlign w:val="subscript"/>'
    : '';
  return `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>${
    isBold ? '<w:b/>' : ''
  }${isItalic ? '<w:i/>' : ''}${run.underline ? '<w:u w:val="single"/>' : ''}${
    run.strike ? '<w:strike/>' : ''
  }${colorHex ? `<w:color w:val="${colorHex}"/>` : ''}${vert}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
}

function buildRunsXmlFromParsedRuns(
  runs: ParsedRichRun[],
  options?: { bold?: boolean; italic?: boolean; sizeHalfPt?: number; color?: string },
  convertFn: (latex: string) => string | null = tryLatexToOmml,
  ommlWarnings?: string[]
): string {
  return runs
    .map((run) => {
      if (run.kind === 'br') {
        return '<w:r><w:br/></w:r>';
      }
      if (run.kind === 'formula') {
        const clean = (run.latex || '').replace(/#\?/g, '\\square').trim();
        if (!clean) return '';
        const omml = convertFn(clean);
        if (omml) {
          return stripOuterOmmlNamespaces(omml);
        }
        ommlWarnings?.push(clean);
        const rPr = buildWordRunProps({}, options);
        return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(clean)}</w:t></w:r>`;
      }
      const rPr = buildWordRunProps(run, options);
      return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(run.text || '')}</w:t></w:r>`;
    })
    .join('');
}

function buildInlineRunsWithMath(
  text: string,
  options?: { bold?: boolean; italic?: boolean; sizeHalfPt?: number; color?: string },
  convertFn: (latex: string) => string | null = tryLatexToOmml,
  ommlWarnings?: string[]
): string {
  const blocks = parseRichContentToBlocks(text);
  if (blocks.length === 0) return '';
  return blocks
    .map((b, bi) => {
      const prefix = bi > 0 ? '<w:r><w:br/></w:r>' : '';
      return prefix + buildRunsXmlFromParsedRuns(b.runs || [], options, convertFn, ommlWarnings);
    })
    .join('');
}

function buildParagraphXml(
  text: string,
  options?: {
    bold?: boolean;
    italic?: boolean;
    sizeHalfPt?: number;
    styleId?: string;
    color?: string;
    align?: 'left' | 'center' | 'right' | 'justify';
  },
  convertFn?: (latex: string) => string | null,
  ommlWarnings?: string[]
): string {
  const pStyle = options?.styleId ? `<w:pStyle w:val="${options.styleId}"/>` : '';
  const alignVal = options?.align === 'justify' ? 'both' : options?.align;
  const jcXml = alignVal ? `<w:jc w:val="${alignVal}"/>` : '';
  const pPr = pStyle || jcXml ? `<w:pPr>${pStyle}${jcXml}</w:pPr>` : '';
  const runs = buildInlineRunsWithMath(text, options, convertFn, ommlWarnings);
  return `<w:p>${pPr}${runs}</w:p>`;
}

function buildTableXmlFromRichRows(
  rows: { cells: { runs: ParsedRichRun[]; isHeader: boolean }[] }[],
  convertFn?: (latex: string) => string | null,
  ommlWarnings?: string[]
): string {
  const colCount = Math.max(...rows.map((r) => r.cells.length), 1);
  const totalTwips = 9350;
  const colWidth = Math.floor(totalTwips / colCount);

  const tblPr = `<w:tblPr>
    <w:tblW w:w="${totalTwips}" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="334155"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="334155"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="334155"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="334155"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="80" w:type="dxa"/>
      <w:left w:w="100" w:type="dxa"/>
      <w:bottom w:w="80" w:type="dxa"/>
      <w:right w:w="100" w:type="dxa"/>
    </w:tblCellMar>
  </w:tblPr>`;
  const tblGrid = `<w:tblGrid>${Array.from({ length: colCount }, () => `<w:gridCol w:w="${colWidth}"/>`).join('')}</w:tblGrid>`;

  const rowsXml = rows
    .map((row) => {
      const cellsXml = Array.from({ length: colCount }, (_, idx) => {
        const cell = row.cells[idx];
        const isHeader = cell?.isHeader || false;
        const shd = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : '';
        const runsXml = cell
          ? buildRunsXmlFromParsedRuns(cell.runs, { bold: isHeader, sizeHalfPt: 24 }, convertFn, ommlWarnings)
          : '';
        return `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/>${shd}</w:tcPr><w:p>${runsXml}</w:p></w:tc>`;
      }).join('');
      return `<w:tr>${cellsXml}</w:tr>`;
    })
    .join('');

  return `<w:tbl>${tblPr}${tblGrid}${rowsXml}</w:tbl>`;
}

function buildTableXml(
  headers: string[],
  rows: string[][],
  convertFn?: (latex: string) => string | null,
  ommlWarnings?: string[]
): string {
  const colCount = Math.max(headers.length, ...rows.map((r) => r.length), 1);
  const totalTwips = 9350; // ~16.5cm printable width on A4
  const colWidth = Math.floor(totalTwips / colCount);

  const tblPr = `<w:tblPr>
    <w:tblW w:w="${totalTwips}" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="334155"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="334155"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="334155"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="334155"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="80" w:type="dxa"/>
      <w:left w:w="100" w:type="dxa"/>
      <w:bottom w:w="80" w:type="dxa"/>
      <w:right w:w="100" w:type="dxa"/>
    </w:tblCellMar>
  </w:tblPr>`;

  const tblGrid = `<w:tblGrid>${Array.from({ length: colCount }, () => `<w:gridCol w:w="${colWidth}"/>`).join('')}</w:tblGrid>`;

  const buildRow = (cells: string[], isHeader: boolean) => {
    const cellsXml = Array.from({ length: colCount }, (_, idx) => {
      const val = cells[idx] ?? '';
      const shd = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : '';
      return `<w:tc>
        <w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/>${shd}</w:tcPr>
        ${buildParagraphXml(val, { bold: isHeader, sizeHalfPt: 24 }, convertFn, ommlWarnings)}
      </w:tc>`;
    }).join('');
    return `<w:tr>${cellsXml}</w:tr>`;
  };

  const headerXml = headers.length > 0 ? buildRow(headers, true) : '';
  const bodyRowsXml = rows.map((r) => buildRow(r, false)).join('');
  return `<w:tbl>${tblPr}${tblGrid}${headerXml}${bodyRowsXml}</w:tbl>`;
}

function buildImageParagraphXml(
  rId: string,
  widthPx: number,
  heightPx: number,
  docPrId: number,
  altName: string
): string {
  const emuPerPx = 9525;
  let cx = Math.round(widthPx * emuPerPx);
  let cy = Math.round(heightPx * emuPerPx);
  const maxCx = 5600000;
  if (cx > maxCx && cx > 0) {
    const scale = maxCx / cx;
    cx = maxCx;
    cy = Math.round(cy * scale);
  }

  return `<w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <wp:extent cx="${cx}" cy="${cy}"/>
          <wp:docPr id="${docPrId}" name="${escapeXml(altName)}"/>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="${docPrId}" name="${escapeXml(altName)}"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;
}

async function dataUrlToUint8Array(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export interface FormulaDocxExportOptions {
  title?: string;
  omml: string;
  latex: string;
  equationNumber?: string;
  variables?: string;
  condition?: string;
  fallbackPngDataUrl?: string;
  fallbackWidthPx?: number;
  fallbackHeightPx?: number;
  useFallbackImage?: boolean;
}

export async function exportFormulaToDocxBlob(options: FormulaDocxExportOptions): Promise<Blob> {
  const zip = new JSZip();
  const bodyChunks: string[] = [];
  const imageFiles: { path: string; rId: string; data: Uint8Array }[] = [];

  if (options.title?.trim()) {
    bodyChunks.push(buildParagraphXml(options.title.trim(), { bold: true, sizeHalfPt: 28, styleId: 'Heading1' }));
  }

  if (options.useFallbackImage && options.fallbackPngDataUrl) {
    const imgData = await dataUrlToUint8Array(options.fallbackPngDataUrl);
    imageFiles.push({ path: 'word/media/image1.png', rId: 'rIdImg1', data: imgData });
    bodyChunks.push(
      buildImageParagraphXml(
        'rIdImg1',
        options.fallbackWidthPx || 360,
        options.fallbackHeightPx || 120,
        1,
        options.title || 'Cong thuc'
      )
    );
    bodyChunks.push(buildParagraphXml(`Mã LaTeX tham chiếu: ${options.latex}`, { italic: true, sizeHalfPt: 22, color: '475569' }));
  } else {
    const cleanOmml = stripOuterOmmlNamespaces(options.omml);
    if (options.equationNumber?.trim()) {
      bodyChunks.push(
        `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><m:oMathPara>${cleanOmml}</m:oMathPara><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">    (${escapeXml(options.equationNumber.trim())})</w:t></w:r></w:p>`
      );
    } else {
      bodyChunks.push(`<w:p><m:oMathPara>${cleanOmml}</m:oMathPara></w:p>`);
    }
  }

  if (options.variables?.trim()) {
    bodyChunks.push(buildParagraphXml(`Trong đó: ${options.variables.trim()}`, { sizeHalfPt: 26 }));
  }
  if (options.condition?.trim()) {
    bodyChunks.push(buildParagraphXml(`Điều kiện áp dụng: ${options.condition.trim()}`, { italic: true, sizeHalfPt: 26 }));
  }

  return buildDocxZip(zip, bodyChunks, imageFiles);
}

export async function exportDrawingToDocxBlob(options: {
  title: string;
  pngDataUrl: string;
  widthPx: number;
  heightPx: number;
  caption?: string;
}): Promise<Blob> {
  const zip = new JSZip();
  const imgData = await dataUrlToUint8Array(options.pngDataUrl);
  const bodyChunks: string[] = [];

  if (options.title.trim()) {
    bodyChunks.push(buildParagraphXml(options.title.trim(), { bold: true, sizeHalfPt: 28, styleId: 'Heading1' }));
  }
  bodyChunks.push(buildImageParagraphXml('rIdImg1', options.widthPx, options.heightPx, 1, options.title || 'Hinh ve khoa hoc'));
  if (options.caption?.trim()) {
    bodyChunks.push(buildParagraphXml(options.caption.trim(), { italic: true, sizeHalfPt: 24 }));
  }

  return buildDocxZip(zip, bodyChunks, [{ path: 'word/media/image1.png', rId: 'rIdImg1', data: imgData }]);
}

export async function exportDocumentBlocksToDocxBlob(
  title: string,
  blocks: DocumentBlock[],
  convertBlockLatexToOmml: (latex: string) => string | null = tryLatexToOmml,
  onWarnings?: (warnings: string[]) => void
): Promise<Blob> {
  const zip = new JSZip();
  const bodyChunks: string[] = [];
  const imageFiles: { path: string; rId: string; data: Uint8Array }[] = [];
  const ommlWarnings: string[] = [];
  let imgCounter = 0;

  const appendPngImage = async (pngDataUrl: string, wPx: number, hPx: number, alt: string) => {
    imgCounter++;
    const rId = `rIdImg${imgCounter}`;
    const path = `word/media/image${imgCounter}.png`;
    const data = await dataUrlToUint8Array(pngDataUrl);
    imageFiles.push({ path, rId, data });
    bodyChunks.push(buildImageParagraphXml(rId, wPx, hPx, imgCounter, alt));
  };

  const emitRichBlock = async (
    rb: ParsedRichBlock,
    defaults?: { bold?: boolean; italic?: boolean; sizeHalfPt?: number; styleId?: string; align?: 'left' | 'center' | 'right' | 'justify' }
  ) => {
    if (rb.kind === 'mathBlock' && rb.latex) {
      const clean = rb.latex.replace(/#\?/g, '\\square').trim();
      const omml = convertBlockLatexToOmml(clean);
      if (omml) {
        bodyChunks.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><m:oMathPara>${stripOuterOmmlNamespaces(omml)}</m:oMathPara></w:p>`);
      } else {
        ommlWarnings.push(clean);
        bodyChunks.push(buildParagraphXml(clean, { sizeHalfPt: 26, align: 'center' }, convertBlockLatexToOmml));
      }
      return;
    }

    if (rb.kind === 'table' && rb.rows) {
      bodyChunks.push(buildTableXmlFromRichRows(rb.rows, convertBlockLatexToOmml, ommlWarnings));
      bodyChunks.push(buildParagraphXml('', { sizeHalfPt: 16 }));
      return;
    }

    if (rb.kind === 'image' && rb.imageSrc?.startsWith('data:image/')) {
      await appendPngImage(rb.imageSrc, 420, 280, rb.imageAlt || `Hinh ${imgCounter + 1}`);
      return;
    }

    if (rb.kind === 'svg' && rb.svgHtml) {
      const raster = await svgStringToPngDataUrl(rb.svgHtml);
      if (raster) {
        await appendPngImage(raster.dataUrl, raster.width, raster.height, rb.imageAlt || `Hinh ${imgCounter + 1}`);
      }
      return;
    }

    const runs = rb.runs || [];
    const prefixRun: ParsedRichRun[] =
      rb.kind === 'listItem' ? [{ kind: 'text', text: '•  ' }] : [];
    const alignVal = (rb.align || defaults?.align) === 'justify' ? 'both' : rb.align || defaults?.align;
    const pStyle = defaults?.styleId || (rb.kind === 'heading' ? 'Heading1' : undefined);
    const pPrParts = [
      pStyle ? `<w:pStyle w:val="${pStyle}"/>` : '',
      alignVal ? `<w:jc w:val="${alignVal}"/>` : '',
    ].filter(Boolean);
    const pPr = pPrParts.length > 0 ? `<w:pPr>${pPrParts.join('')}</w:pPr>` : '';
    const runsXml = buildRunsXmlFromParsedRuns(
      [...prefixRun, ...runs],
      {
        bold: defaults?.bold || rb.kind === 'heading',
        italic: defaults?.italic,
        sizeHalfPt: defaults?.sizeHalfPt ?? (rb.kind === 'heading' ? 28 : 26),
      },
      convertBlockLatexToOmml,
      ommlWarnings
    );
    bodyChunks.push(`<w:p>${pPr}${runsXml}</w:p>`);
  };

  if (title.trim()) {
    bodyChunks.push(
      buildParagraphXml(title.trim(), { bold: true, sizeHalfPt: 30, styleId: 'Heading1', align: 'center' }, convertBlockLatexToOmml, ommlWarnings)
    );
  }

  for (const block of blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') {
      const source = block.html || block.text || '';
      const richBlocks = parseRichContentToBlocks(source);
      if (richBlocks.length === 0) {
        bodyChunks.push(buildParagraphXml('', { sizeHalfPt: 26 }));
      } else {
        for (const rb of richBlocks) {
          await emitRichBlock(rb, {
            bold: block.type === 'heading' ? true : block.bold,
            italic: block.italic,
            sizeHalfPt: block.type === 'heading' ? 28 : 26,
            styleId: block.type === 'heading' ? 'Heading1' : undefined,
            align: block.align,
          });
        }
      }
    } else if (block.type === 'formula' && block.latex) {
      const omml = convertBlockLatexToOmml(block.latex);
      if (omml) {
        bodyChunks.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><m:oMathPara>${stripOuterOmmlNamespaces(omml)}</m:oMathPara></w:p>`);
      } else {
        ommlWarnings.push(block.latex);
        bodyChunks.push(buildParagraphXml(block.latex, { sizeHalfPt: 26 }));
      }
    } else if (block.type === 'table') {
      bodyChunks.push(buildTableXml(block.tableHeaders || [], block.tableRows || [], convertBlockLatexToOmml, ommlWarnings));
      bodyChunks.push(buildParagraphXml('', { sizeHalfPt: 16 }));
    } else if (block.type === 'drawing') {
      if (block.pngDataUrl) {
        const wPx = block.widthCm ? Math.round(block.widthCm * 37.8) : 480;
        const hPx = block.heightCm ? Math.round(block.heightCm * 37.8) : 320;
        await appendPngImage(block.pngDataUrl, wPx, hPx, block.drawingName || `Hinh ${imgCounter + 1}`);
      } else if (block.svgContent) {
        const raster = await svgStringToPngDataUrl(block.svgContent);
        if (raster) {
          await appendPngImage(raster.dataUrl, raster.width, raster.height, block.drawingName || `Hinh ${imgCounter + 1}`);
        }
      }
    }
  }

  if (bodyChunks.length === 0) {
    bodyChunks.push(buildParagraphXml('Tài liệu mới được tạo từ SMART DOCX PRO.', { sizeHalfPt: 26 }));
  }

  if (ommlWarnings.length > 0 && onWarnings) {
    onWarnings(Array.from(new Set(ommlWarnings)));
  }

  return buildDocxZip(zip, bodyChunks, imageFiles);
}

async function buildDocxZip(
  zip: JSZip,
  bodyChunks: string[],
  imageFiles: { path: string; rId: string; data: Uint8Array }[]
): Promise<Blob> {
  const hasPng = imageFiles.length > 0;
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/contenttypes">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasPng ? '<Default Extension="png" ContentType="image/png"/>' : ''}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;

  const imgRels = imageFiles
    .map(
      (img) =>
        `<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${img.path.replace(/^word\//, '')}"/>`
    )
    .join('\n  ');

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  ${imgRels}
</Relationships>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyChunks.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', ROOT_RELS_XML);
  zip.file('word/_rels/document.xml.rels', docRelsXml);
  zip.file('word/styles.xml', DEFAULT_STYLES_XML);
  zip.file('word/settings.xml', DEFAULT_SETTINGS_XML);
  zip.file('word/document.xml', documentXml);

  for (const img of imageFiles) {
    zip.file(img.path, img.data);
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export async function inspectDocxFile(file: File): Promise<WordDocumentRecord> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) {
    throw new Error('Tệp không phải tài liệu Word (.docx) hợp lệ hoặc thiếu word/document.xml.');
  }

  const xmlText = await docEntry.async('text');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
  const ommlNodes = Array.from(xmlDoc.getElementsByTagName('m:oMath'));
  const mediaFiles = Object.keys(zip.files).filter((k) => k.startsWith('word/media/') && !zip.files[k].dir);

  const blocks: DocumentBlock[] = [];
  const extractedTexts: string[] = [];

  for (const p of paragraphs) {
    const textNodes = Array.from(p.getElementsByTagName('w:t'));
    const mathTexts = Array.from(p.getElementsByTagName('m:t'));
    const pText = textNodes.map((n) => n.textContent || '').join('').trim();
    const mText = mathTexts.map((n) => n.textContent || '').join('').trim();
    const combined = [pText, mText ? `[Công thức: ${mText}]` : ''].filter(Boolean).join(' ');
    if (combined) {
      extractedTexts.push(combined);
      blocks.push({
        id: generateId('blk'),
        type: 'paragraph',
        text: combined,
      });
    }
  }

  return {
    id: generateId('doc'),
    name: file.name.replace(/\.docx$/i, ''),
    source: 'imported',
    blocks,
    summaryText: extractedTexts.slice(0, 6).join('\n') || 'Tài liệu Word không có văn bản thuần.',
    ommlCount: ommlNodes.length,
    imageCount: mediaFiles.length,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
