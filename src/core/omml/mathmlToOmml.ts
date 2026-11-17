import { OmmlConversionResult } from '../../types';

/**
 * Deterministic MathML -> OOXML OMML (<m:oMath>) converter for Microsoft Word.
 * Reports unsupported constructs honestly instead of faking compatibility.
 */

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeRun(text: string, plain = false): string {
  if (!text) return '';
  const clean = text.replace(/\u200B/g, '');
  if (!clean) return '';
  const rPr = plain ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : '';
  return `<m:r>${rPr}<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t xml:space="preserve">${escapeXml(clean)}</m:t></m:r>`;
}

const NARY_CHARS = new Set(['∑', '∏', '∫', '∬', '∭', '∮', '⋃', '⋂', '⋁', '⋀']);

const ACCENT_MAP: Record<string, string> = {
  '\u2192': '\u20D7', // right arrow -> combining right arrow above
  '\u20D7': '\u20D7',
  '^': '\u0302',
  'ˆ': '\u0302',
  '~': '\u0303',
  '˜': '\u0303',
  '\u00AF': '\u0304', // macron
  '˙': '\u0307',
  '¨': '\u0308',
};

const KNOWN_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'ln',
  'log',
  'lg',
  'exp',
  'lim',
  'max',
  'min',
  'sup',
  'inf',
  'det',
  'gcd',
  'mod',
]);

function getDirectChildren(el: Element): Element[] {
  return Array.from(el.children);
}

function getText(el: Element): string {
  return (el.textContent || '').trim();
}

function isFencedRow(children: Element[]): { beg: string; end: string; inner: Element[] } | null {
  if (children.length < 2) return null;
  const first = children[0];
  const last = children[children.length - 1];
  if (first.localName !== 'mo' || last.localName !== 'mo') return null;

  const beg = getText(first);
  const end = getText(last);
  const pairs: Record<string, string[]> = {
    '(': [')'],
    '[': [']'],
    '{': ['}', ''],
    '|': ['|'],
    '‖': ['‖'],
    '⟨': ['⟩'],
  };
  if (pairs[beg] && pairs[beg].includes(end)) {
    return { beg, end, inner: children.slice(1, -1) };
  }
  return null;
}

export function convertMathmlToOmml(mathmlInput: string, rawLatex = ''): OmmlConversionResult {
  const warnings: string[] = [];
  const trimmed = mathmlInput.trim();

  if (!trimmed) {
    return {
      omml: '',
      supported: false,
      warnings: ['Biểu thức trống, chưa có dữ liệu để chuyển đổi sang OMML.'],
      mathml: '',
    };
  }

  // Check raw LaTeX for commands known to exceed standard Word OMML
  if (/\\ce\s*\{|\\pu\s*\{/.test(rawLatex)) {
    warnings.push('Lệnh hóa học mở rộng (\\ce / \\pu) không phải chuẩn OMML gốc; hãy dùng chỉ số trên/dưới và mũi tên phản ứng tiêu chuẩn.');
  }
  if (/\\begin\{tikz|\\cancel|\\sout|\\boxed/.test(rawLatex)) {
    warnings.push('Một số hiệu ứng định dạng nâng cao (\\cancel, \\boxed, tikz) chưa hỗ trợ trực tiếp trong OMML của Word.');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return {
      omml: '',
      supported: false,
      warnings: ['Không phân tích được cấu trúc MathML của công thức này.'],
      mathml: trimmed,
    };
  }

  const root = doc.documentElement;
  if (!root || root.localName !== 'math') {
    return {
      omml: '',
      supported: false,
      warnings: ['Thẻ gốc MathML không hợp lệ.'],
      mathml: trimmed,
    };
  }

  const convertChildren = (elements: Element[]): string => {
    let out = '';
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      // Handle N-ary operator followed by operand inside mrow: [munderover/msubsup/msub/msup/mo(nary), operand...]
      const tag = el.localName;
      if (tag === 'munderover' || tag === 'msubsup' || tag === 'msub' || tag === 'msup') {
        const ch = getDirectChildren(el);
        if (ch.length >= 1 && ch[0].localName === 'mo' && NARY_CHARS.has(getText(ch[0]))) {
          const chr = getText(ch[0]);
          let subXml = '<m:sub/>';
          let supXml = '<m:sup/>';
          let subHide = '<m:subHide m:val="1"/>';
          let supHide = '<m:supHide m:val="1"/>';

          if (tag === 'munderover' || tag === 'msubsup') {
            subXml = `<m:sub>${convertNode(ch[1])}</m:sub>`;
            supXml = `<m:sup>${convertNode(ch[2])}</m:sup>`;
            subHide = '';
            supHide = '';
          } else if (tag === 'msub') {
            subXml = `<m:sub>${convertNode(ch[1])}</m:sub>`;
            subHide = '';
          } else if (tag === 'msup') {
            supXml = `<m:sup>${convertNode(ch[1])}</m:sup>`;
            supHide = '';
          }

          // Collect remaining siblings in this row as the n-ary body (up to next relation or end)
          const bodyNodes: Element[] = [];
          while (i + 1 < elements.length) {
            const next = elements[i + 1];
            const nextTxt = getText(next);
            if (next.localName === 'mo' && ['=', '<', '>', '≤', '≥', '≠', ','].includes(nextTxt)) {
              break;
            }
            bodyNodes.push(next);
            i++;
          }
          const bodyXml = bodyNodes.length > 0 ? convertChildren(bodyNodes) : makeRun(' ');
          out += `<m:nary><m:naryPr><m:chr m:val="${escapeXml(chr)}"/><m:limLoc m:val="subSup"/>${subHide}${supHide}</m:naryPr>${subXml}${supXml}<m:e>${bodyXml}</m:e></m:nary>`;
          continue;
        }
      }

      if (tag === 'mo' && NARY_CHARS.has(getText(el))) {
        const chr = getText(el);
        const bodyNodes: Element[] = [];
        while (i + 1 < elements.length) {
          const next = elements[i + 1];
          const nextTxt = getText(next);
          if (next.localName === 'mo' && ['=', '<', '>', '≤', '≥', '≠', ','].includes(nextTxt)) {
            break;
          }
          bodyNodes.push(next);
          i++;
        }
        const bodyXml = bodyNodes.length > 0 ? convertChildren(bodyNodes) : makeRun(' ');
        out += `<m:nary><m:naryPr><m:chr m:val="${escapeXml(chr)}"/><m:limLoc m:val="subSup"/><m:subHide m:val="1"/><m:supHide m:val="1"/></m:naryPr><m:sub/><m:sup/><m:e>${bodyXml}</m:e></m:nary>`;
        continue;
      }

      out += convertNode(el);
    }
    return out;
  };

  const convertNode = (el: Element | undefined): string => {
    if (!el) return '';
    const tag = el.localName;
    const children = getDirectChildren(el);

    switch (tag) {
      case 'math':
      case 'mstyle':
      case 'mpadded':
      case 'mphantom': {
        return convertChildren(children);
      }

      case 'semantics': {
        if (children.length > 0) return convertNode(children[0]);
        return '';
      }

      case 'annotation':
      case 'annotation-xml':
        return '';

      case 'mrow': {
        if (children.length === 0) {
          const txt = getText(el);
          return txt ? makeRun(txt) : '';
        }
        const fenced = isFencedRow(children);
        if (fenced) {
          const innerContent =
            fenced.inner.length === 1 && fenced.inner[0].localName === 'mtable' && fenced.beg === '{'
              ? convertTableToEqArr(fenced.inner[0])
              : convertChildren(fenced.inner);
          return `<m:d><m:dPr><m:begChr m:val="${escapeXml(fenced.beg)}"/><m:endChr m:val="${escapeXml(fenced.end)}"/></m:dPr><m:e>${innerContent}</m:e></m:d>`;
        }
        return convertChildren(children);
      }

      case 'mi': {
        const txt = getText(el);
        const variant = el.getAttribute('mathvariant');
        const isPlain = variant === 'normal' || KNOWN_FUNCTIONS.has(txt);
        return makeRun(txt, isPlain);
      }

      case 'mn': {
        return makeRun(getText(el), false);
      }

      case 'mo': {
        const txt = getText(el);
        if (!txt) return '';
        return makeRun(txt, false);
      }

      case 'mtext': {
        return makeRun(el.textContent || '', true);
      }

      case 'mspace': {
        return makeRun(' ', true);
      }

      case 'mfrac': {
        if (children.length < 2) {
          warnings.push('Phân số thiếu tử số hoặc mẫu số.');
          return convertChildren(children);
        }
        const thickness = el.getAttribute('linethickness');
        const typePr = thickness === '0' || thickness === '0px' ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : '';
        return `<m:f>${typePr}<m:num>${convertNode(children[0])}</m:num><m:den>${convertNode(children[1])}</m:den></m:f>`;
      }

      case 'msup': {
        if (children.length < 2) return convertChildren(children);
        return `<m:sSup><m:e>${convertNode(children[0])}</m:e><m:sup>${convertNode(children[1])}</m:sup></m:sSup>`;
      }

      case 'msub': {
        if (children.length < 2) return convertChildren(children);
        return `<m:sSub><m:e>${convertNode(children[0])}</m:e><m:sub>${convertNode(children[1])}</m:sub></m:sSub>`;
      }

      case 'msubsup': {
        if (children.length < 3) return convertChildren(children);
        return `<m:sSubSup><m:e>${convertNode(children[0])}</m:e><m:sub>${convertNode(children[1])}</m:sub><m:sup>${convertNode(children[2])}</m:sup></m:sSubSup>`;
      }

      case 'mmultiscripts': {
        // Handle isotope / pre-scripts like {}^{14}_{6}C
        if (children.length === 0) return '';
        const base = children[0];
        const mprescriptsIdx = children.findIndex((c) => c.localName === 'mprescripts');
        if (mprescriptsIdx !== -1 && children.length >= mprescriptsIdx + 3) {
          const preSub = children[mprescriptsIdx + 1];
          const preSup = children[mprescriptsIdx + 2];
          return `<m:sPre><m:sub>${convertNode(preSub)}</m:sub><m:sup>${convertNode(preSup)}</m:sup><m:e>${convertNode(base)}</m:e></m:sPre>`;
        }
        return convertNode(base);
      }

      case 'msqrt': {
        return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${convertChildren(children)}</m:e></m:rad>`;
      }

      case 'mroot': {
        if (children.length < 2) return convertChildren(children);
        return `<m:rad><m:deg>${convertNode(children[1])}</m:deg><m:e>${convertNode(children[0])}</m:e></m:rad>`;
      }

      case 'mfenced': {
        const open = el.getAttribute('open') ?? '(';
        const close = el.getAttribute('close') ?? ')';
        const inner = children.map((c) => `<m:e>${convertNode(c)}</m:e>`).join('');
        return `<m:d><m:dPr><m:begChr m:val="${escapeXml(open)}"/><m:endChr m:val="${escapeXml(close)}"/></m:dPr>${inner || '<m:e/>'}</m:d>`;
      }

      case 'mover': {
        if (children.length < 2) return convertChildren(children);
        const base = children[0];
        const over = children[1];
        const overTxt = getText(over);

        // Overline bar
        if (overTxt === '¯' || overTxt === '\u00AF' || overTxt === '―' || overTxt === '‾') {
          return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${convertNode(base)}</m:e></m:bar>`;
        }

        // Accent marks (\vec, \hat, \tilde, \dot, \ddot)
        if (ACCENT_MAP[overTxt]) {
          return `<m:acc><m:accPr><m:chr m:val="${escapeXml(ACCENT_MAP[overTxt])}"/></m:accPr><m:e>${convertNode(base)}</m:e></m:acc>`;
        }

        // Reaction arrows with conditions above (e.g. \xrightarrow{t^o})
        const baseTxt = getText(base);
        if (base.localName === 'mo' && ['→', '⟶', '←', '⟵', '⇌', '↔'].includes(baseTxt)) {
          return `<m:limUpp><m:e>${makeRun(baseTxt)}</m:e><m:lim>${convertNode(over)}</m:lim></m:limUpp>`;
        }

        return `<m:limUpp><m:e>${convertNode(base)}</m:e><m:lim>${convertNode(over)}</m:lim></m:limUpp>`;
      }

      case 'munder': {
        if (children.length < 2) return convertChildren(children);
        const base = children[0];
        const under = children[1];
        const underTxt = getText(under);
        if (underTxt === '_' || underTxt === '̲') {
          return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr><m:e>${convertNode(base)}</m:e></m:bar>`;
        }
        return `<m:limLow><m:e>${convertNode(base)}</m:e><m:lim>${convertNode(under)}</m:lim></m:limLow>`;
      }

      case 'munderover': {
        if (children.length < 3) return convertChildren(children);
        const base = children[0];
        const under = children[1];
        const over = children[2];
        // Nest limLow inside limUpp for arrows with both top & bottom reaction conditions
        return `<m:limUpp><m:e><m:limLow><m:e>${convertNode(base)}</m:e><m:lim>${convertNode(under)}</m:lim></m:limLow></m:e><m:lim>${convertNode(over)}</m:lim></m:limUpp>`;
      }

      case 'mtable': {
        const rows = children.filter((c) => c.localName === 'mtr' || c.localName === 'mlabeledtr');
        const mrXml = rows
          .map((row) => {
            const cells = getDirectChildren(row).filter((c) => c.localName === 'mtd');
            return `<m:mr>${cells.map((cell) => `<m:e>${convertChildren(getDirectChildren(cell))}</m:e>`).join('')}</m:mr>`;
          })
          .join('');
        return `<m:m>${mrXml}</m:m>`;
      }

      case 'menclose': {
        const notation = el.getAttribute('notation') || 'box';
        if (notation.includes('box') || notation.includes('roundedbox')) {
          return `<m:borderBox><m:e>${convertChildren(children)}</m:e></m:borderBox>`;
        }
        warnings.push(`Khung ký hiệu MathML "${notation}" chưa hỗ trợ đầy đủ trong OMML; nội dung bên trong vẫn được giữ nguyên.`);
        return convertChildren(children);
      }

      case 'merror': {
        warnings.push(`Lỗi cú pháp trong biểu thức: ${getText(el) || 'Không xác định'}.`);
        return makeRun(getText(el), true);
      }

      default: {
        warnings.push(`Thẻ MathML <${tag}> chưa có quy tắc ánh xạ OMML trực tiếp.`);
        if (children.length > 0) return convertChildren(children);
        return makeRun(getText(el), true);
      }
    }
  };

  const convertTableToEqArr = (tableEl: Element): string => {
    const rows = getDirectChildren(tableEl).filter((c) => c.localName === 'mtr');
    const eqs = rows
      .map((row) => {
        const cells = getDirectChildren(row).filter((c) => c.localName === 'mtd');
        const rowContent = cells.map((cell) => convertChildren(getDirectChildren(cell))).join('');
        return `<m:e>${rowContent || makeRun(' ')}</m:e>`;
      })
      .join('');
    return `<m:eqArr>${eqs}</m:eqArr>`;
  };

  const bodyOmml = convertChildren(getDirectChildren(root));
  const omml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${bodyOmml}</m:oMath>`;

  return {
    omml,
    supported: warnings.length === 0 && bodyOmml.length > 0,
    warnings: Array.from(new Set(warnings)),
    mathml: trimmed,
  };
}
