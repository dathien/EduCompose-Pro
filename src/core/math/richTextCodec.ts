import { RichFormulaNodeMeta } from '../../types';

export interface ParsedRichRun {
  kind: 'text' | 'formula' | 'br';
  text?: string;
  latex?: string;
  display?: 'inline' | 'block';
  id?: string;
  parseWarning?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  color?: string;
  highlight?: string;
  fontFamily?: string;
  fontSizePt?: number;
}

export interface ParsedRichBlock {
  kind: 'paragraph' | 'heading' | 'listItem' | 'table' | 'image' | 'svg' | 'mathBlock';
  level?: number;
  ordered?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
  runs?: ParsedRichRun[];
  rows?: { cells: { runs: ParsedRichRun[]; isHeader: boolean }[] }[];
  imageSrc?: string;
  imageAlt?: string;
  svgHtml?: string;
  latex?: string;
  formulaId?: string;
}

let codecCounter = 0;
export function createFormulaNodeId(): string {
  codecCounter = (codecCounter + 1) % 100000;
  return `fm_${Date.now().toString(36)}_${codecCounter.toString(36)}`;
}

export function escapeHtmlText(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function isRichHtmlString(value: string | undefined | null): boolean {
  if (!value) return false;
  return /<(p|div|span|strong|em|u|s|sup|sub|ul|ol|li|table|tr|td|th|h[1-6]|img|br)\b/i.test(value) ||
    value.includes('data-type="math-node"') ||
    value.includes('data-type="scientific-svg"');
}

/**
 * Checks whether braces {} in a LaTeX expression are balanced outside escaped braces.
 */
export function hasBalancedBraces(latex: string): boolean {
  let depth = 0;
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * Determines whether a `$...$` candidate is likely mathematics rather than currency like `$50`.
 */
function looksLikeMathContent(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return false;
  // Reject currency ranges or plain numbers followed by words e.g. "50 USD and $100"
  if (/^\d[\d.,]*\s+[a-zA-ZÀ-ỹ]/.test(trimmed) && !/[\\^_=<>+\-*/{}]/.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Balanced delimiter scanner: converts legacy `$...$`, `$$...$$`, `\(...\)`, `\[...\]`
 * into canonical HTML with `<span data-type="math-node">` elements without corrupting
 * Vietnamese diacritics, currency `$50`, or nested braces.
 */
export function parseMixedTextToRichHtml(raw: string | undefined | null): string {
  if (!raw) return '';
  if (isRichHtmlString(raw)) return raw;

  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const htmlParagraphs: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      htmlParagraphs.push('<p></p>');
      continue;
    }

    let out = '';
    let i = 0;
    const len = line.length;

    while (i < len) {
      // Escaped dollar \$
      if (line[i] === '\\' && line[i + 1] === '$') {
        out += '$';
        i += 2;
        continue;
      }

      // Block $$...$$
      if (line[i] === '$' && line[i + 1] === '$') {
        const closeIdx = findClosingDelimiter(line, i + 2, '$$');
        if (closeIdx !== -1) {
          const latex = line.slice(i + 2, closeIdx).trim();
          const warn = !hasBalancedBraces(latex);
          const id = createFormulaNodeId();
          out += `<span data-type="math-node" data-id="${id}" data-latex="${escapeHtmlAttr(latex)}" data-display="block"${warn ? ' data-parse-warning="true"' : ''}></span>`;
          i = closeIdx + 2;
          continue;
        }
      }

      // Block \[...\]
      if (line[i] === '\\' && line[i + 1] === '[') {
        const closeIdx = findClosingDelimiter(line, i + 2, '\\]');
        if (closeIdx !== -1) {
          const latex = line.slice(i + 2, closeIdx).trim();
          const warn = !hasBalancedBraces(latex);
          const id = createFormulaNodeId();
          out += `<span data-type="math-node" data-id="${id}" data-latex="${escapeHtmlAttr(latex)}" data-display="block"${warn ? ' data-parse-warning="true"' : ''}></span>`;
          i = closeIdx + 2;
          continue;
        }
      }

      // Inline \(...\)
      if (line[i] === '\\' && line[i + 1] === '(') {
        const closeIdx = findClosingDelimiter(line, i + 2, '\\)');
        if (closeIdx !== -1) {
          const latex = line.slice(i + 2, closeIdx).trim();
          const warn = !hasBalancedBraces(latex);
          const id = createFormulaNodeId();
          out += `<span data-type="math-node" data-id="${id}" data-latex="${escapeHtmlAttr(latex)}" data-display="inline"${warn ? ' data-parse-warning="true"' : ''}></span>`;
          i = closeIdx + 2;
          continue;
        }
      }

      // Inline $...$
      if (line[i] === '$') {
        // Currency heuristic: "$50 " or "$12.50" without math symbols before next $
        const nextChar = line[i + 1];
        const closeIdx = findClosingSingleDollar(line, i + 1);
        if (closeIdx !== -1 && nextChar !== undefined) {
          const inner = line.slice(i + 1, closeIdx);
          if (looksLikeMathContent(inner)) {
            const latex = inner.trim();
            const warn = !hasBalancedBraces(latex);
            const id = createFormulaNodeId();
            out += `<span data-type="math-node" data-id="${id}" data-latex="${escapeHtmlAttr(latex)}" data-display="inline"${warn ? ' data-parse-warning="true"' : ''}></span>`;
            i = closeIdx + 1;
            continue;
          }
        }
        // Unclosed or currency $: keep literal character safely
        out += '$';
        i += 1;
        continue;
      }

      out += escapeHtmlText(line[i]);
      i++;
    }

    htmlParagraphs.push(`<p>${out}</p>`);
  }

  return htmlParagraphs.join('');
}

function findClosingDelimiter(str: string, startIdx: number, delim: string): number {
  for (let i = startIdx; i < str.length; i++) {
    if (str[i] === '\\' && delim !== '\\]' && delim !== '\\)') {
      i++;
      continue;
    }
    if (str.startsWith(delim, i)) {
      return i;
    }
  }
  return -1;
}

function findClosingSingleDollar(str: string, startIdx: number): number {
  let braceDepth = 0;
  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '{') braceDepth++;
    else if (ch === '}' && braceDepth > 0) braceDepth--;
    else if (ch === '$' && braceDepth === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Extracts structured FormulaNodes from Rich HTML or mixed legacy text.
 */
export function extractFormulaNodes(value: string | undefined | null): RichFormulaNodeMeta[] {
  const html = parseMixedTextToRichHtml(value);
  if (!html || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const nodes = Array.from(doc.querySelectorAll('[data-type="math-node"]'));
  return nodes.map((el) => ({
    id: el.getAttribute('data-id') || createFormulaNodeId(),
    type: 'formula' as const,
    latex: el.getAttribute('data-latex') || '',
    display: el.getAttribute('data-display') === 'block' ? 'block' : 'inline',
    format: 'latex' as const,
    parseWarning: el.getAttribute('data-parse-warning') === 'true' || undefined,
  }));
}

/**
 * Parses Rich HTML (or legacy mixed text) into structured blocks & inline runs for
 * Word OOXML export, Print/PDF export, and rich viewers.
 */
export function parseRichContentToBlocks(value: string | undefined | null): ParsedRichBlock[] {
  const html = parseMixedTextToRichHtml(value);
  if (!html) return [];

  if (typeof DOMParser === 'undefined') {
    return [{ kind: 'paragraph', runs: [{ kind: 'text', text: html.replace(/<[^>]+>/g, '') }] }];
  }

  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return [];

  const blocks: ParsedRichBlock[] = [];

  const collectRuns = (node: Node, style: Omit<ParsedRichRun, 'kind' | 'text'> = {}): ParsedRichRun[] => {
    const runs: ParsedRichRun[] = [];
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text) runs.push({ kind: 'text', text, ...style });
      return runs;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return runs;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      runs.push({ kind: 'br' });
      return runs;
    }

    if (el.getAttribute('data-type') === 'math-node') {
      runs.push({
        kind: 'formula',
        id: el.getAttribute('data-id') || undefined,
        latex: el.getAttribute('data-latex') || '',
        display: el.getAttribute('data-display') === 'block' ? 'block' : 'inline',
        parseWarning: el.getAttribute('data-parse-warning') === 'true',
      });
      return runs;
    }

    const nextStyle = { ...style };
    if (tag === 'strong' || tag === 'b') nextStyle.bold = true;
    if (tag === 'em' || tag === 'i') nextStyle.italic = true;
    if (tag === 'u') nextStyle.underline = true;
    if (tag === 's' || tag === 'del' || tag === 'strike') nextStyle.strike = true;
    if (tag === 'sup') nextStyle.superscript = true;
    if (tag === 'sub') nextStyle.subscript = true;
    if (tag === 'mark') nextStyle.highlight = el.style.backgroundColor || 'yellow';

    if (el.style) {
      if (el.style.color) nextStyle.color = el.style.color;
      if (el.style.backgroundColor) nextStyle.highlight = el.style.backgroundColor;
      if (el.style.fontFamily) nextStyle.fontFamily = el.style.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
      if (el.style.fontSize) {
        const pt = parseFloat(el.style.fontSize);
        if (!Number.isNaN(pt)) {
          nextStyle.fontSizePt = el.style.fontSize.includes('px') ? Math.round((pt * 72) / 96) : pt;
        }
      }
      if (el.style.fontWeight === 'bold' || Number(el.style.fontWeight) >= 600) nextStyle.bold = true;
      if (el.style.fontStyle === 'italic') nextStyle.italic = true;
      if (el.style.textDecoration?.includes('underline')) nextStyle.underline = true;
      if (el.style.textDecoration?.includes('line-through')) nextStyle.strike = true;
    }

    const children = Array.from(el.childNodes);
    children.forEach((child, idx) => {
      if (
        idx > 0 &&
        child.nodeType === Node.ELEMENT_NODE &&
        (child as HTMLElement).tagName.toLowerCase() === 'p'
      ) {
        runs.push({ kind: 'br' });
      }
      runs.push(...collectRuns(child, nextStyle));
    });
    return runs;
  };

  const getAlign = (el: HTMLElement): ParsedRichBlock['align'] => {
    const ta = el.style?.textAlign;
    if (ta === 'center' || ta === 'right' || ta === 'justify' || ta === 'left') return ta;
    return undefined;
  };

  const walkBlockChildren = (parent: HTMLElement) => {
    parent.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const txt = child.textContent;
        if (txt && txt.trim()) {
          blocks.push({ kind: 'paragraph', runs: [{ kind: 'text', text: txt }] });
        }
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (el.getAttribute('data-type') === 'scientific-svg') {
        const svgHtml = el.getAttribute('data-svg') || el.innerHTML;
        blocks.push({ kind: 'svg', svgHtml, imageAlt: el.getAttribute('data-label') || 'Hình khoa học' });
        return;
      }

      if (tag === 'img') {
        blocks.push({
          kind: 'image',
          imageSrc: el.getAttribute('src') || '',
          imageAlt: el.getAttribute('alt') || 'Hình ảnh',
        });
        return;
      }

      if (tag === 'table') {
        const trs = Array.from(el.querySelectorAll('tr'));
        const rows = trs.map((tr) => ({
          cells: Array.from(tr.children).map((cell) => ({
            isHeader: cell.tagName.toLowerCase() === 'th',
            runs: collectRuns(cell),
          })),
        }));
        blocks.push({ kind: 'table', rows });
        return;
      }

      if (tag === 'ul' || tag === 'ol') {
        const ordered = tag === 'ol';
        Array.from(el.children).forEach((li) => {
          blocks.push({
            kind: 'listItem',
            ordered,
            runs: collectRuns(li),
          });
        });
        return;
      }

      if (/^h[1-6]$/.test(tag)) {
        blocks.push({
          kind: 'heading',
          level: Number(tag[1]),
          align: getAlign(el),
          runs: collectRuns(el),
        });
        return;
      }

      if (tag === 'p' || tag === 'div' || tag === 'blockquote') {
        // Check if paragraph wraps standalone image or svg
        const directImg = el.querySelector(':scope > img');
        const directSvg = el.querySelector(':scope > [data-type="scientific-svg"]');
        if (directImg && el.textContent?.trim() === '') {
          blocks.push({
            kind: 'image',
            imageSrc: directImg.getAttribute('src') || '',
            imageAlt: directImg.getAttribute('alt') || 'Hình ảnh',
          });
          return;
        }
        if (directSvg && el.textContent?.trim() === '') {
          blocks.push({
            kind: 'svg',
            svgHtml: directSvg.getAttribute('data-svg') || directSvg.innerHTML,
            imageAlt: directSvg.getAttribute('data-label') || 'Hình khoa học',
          });
          return;
        }
        const runs = collectRuns(el);
        if (runs.length === 1 && runs[0].kind === 'formula' && runs[0].display === 'block') {
          blocks.push({
            kind: 'mathBlock',
            latex: runs[0].latex,
            formulaId: runs[0].id,
            align: getAlign(el) || 'center',
          });
          return;
        }
        blocks.push({
          kind: 'paragraph',
          align: getAlign(el),
          runs,
        });
        return;
      }

      // Inline fallback wrapped as paragraph
      const inlineRuns = collectRuns(el);
      if (inlineRuns.length > 0) {
        blocks.push({ kind: 'paragraph', runs: inlineRuns });
      }
    });
  };

  walkBlockChildren(root);
  return blocks;
}

/**
 * Checks whether Rich HTML or mixed text actually contains any visible text, formula, image or SVG.
 */
export function hasRichContent(value: string | undefined | null): boolean {
  if (!value) return false;
  const blocks = parseRichContentToBlocks(value);
  for (const b of blocks) {
    if (b.kind === 'image' || b.kind === 'svg' || b.kind === 'table' || b.kind === 'mathBlock') {
      return true;
    }
    if (b.runs?.some((r) => (r.kind === 'text' && r.text?.trim()) || (r.kind === 'formula' && r.latex?.trim()))) {
      return true;
    }
  }
  return false;
}

/**
 * Converts Rich HTML or mixed text into plain searchable/readable text (used for search indexing,
 * never shown as raw `$` or `<p>` tags to teachers).
 */
export function richContentToSearchText(value: string | undefined | null): string {
  if (!value) return '';
  const blocks = parseRichContentToBlocks(value);
  return blocks
    .map((b) => {
      if (b.kind === 'mathBlock') return b.latex || '';
      if (b.kind === 'table') {
        return (b.rows || [])
          .map((row) => row.cells.map((c) => c.runs.map((r) => r.text || r.latex || '').join('')).join(' '))
          .join(' ');
      }
      return (b.runs || []).map((r) => (r.kind === 'formula' ? r.latex || '' : r.text || '')).join('');
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts Rich HTML to an internal storage representation containing `$...$` markers
 * ONLY for internal legacy text matching or plain OMML splitting if ever needed.
 */
export function richContentToInternalDelimitedText(value: string | undefined | null): string {
  if (!value) return '';
  if (!isRichHtmlString(value)) return value;
  const blocks = parseRichContentToBlocks(value);
  return blocks
    .map((b) => {
      if (b.kind === 'mathBlock' && b.latex) return `$$${b.latex}$$`;
      return (b.runs || [])
        .map((r) => {
          if (r.kind === 'formula' && r.latex) {
            return r.display === 'block' ? `$$${r.latex}$$` : `$${r.latex}$`;
          }
          if (r.kind === 'br') return '\n';
          return r.text || '';
        })
        .join('');
    })
    .join('\n')
    .trim();
}
