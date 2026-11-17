import JSZip from 'jszip';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export interface DocxDomInspection {
  fileName: string;
  paragraphCount: number;
  ommlCount: number;
  imageCount: number;
  tableCount: number;
  headerCount: number;
  footerCount: number;
  sectionCount: number;
  autoNumberCount: number;
  questionNumbers: number[];
  previewParagraphs: {
    index: number;
    text: string;
    hasOmml: boolean;
    hasImage: boolean;
    hasAutoNum: boolean;
    isQuestion: boolean;
  }[];
  issues: string[];
}

export interface LoadedDocxSession {
  fileName: string;
  zip: JSZip;
  documentXml: string;
  numberingXml: string | null;
  undoStack: string[];
}

function parseXml(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) {
    throw new Error('Cấu trúc XML trong tài liệu Word không hợp lệ.');
  }
  return doc;
}

function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

function getParagraphDisplayText(p: Element): { text: string; hasOmml: boolean; hasImage: boolean; hasAutoNum: boolean } {
  const tNodes = Array.from(p.getElementsByTagName('w:t'));
  const mNodes = Array.from(p.getElementsByTagName('m:t'));
  const drawings = Array.from(p.getElementsByTagName('w:drawing'));
  const numPr = p.getElementsByTagName('w:numPr').length > 0;
  const plain = tNodes.map((n) => n.textContent || '').join('');
  const math = mNodes.map((n) => n.textContent || '').join('');
  const text = [plain, math ? `[OMML: ${math}]` : ''].filter(Boolean).join(' ').trim();
  return {
    text,
    hasOmml: mNodes.length > 0 || p.getElementsByTagName('m:oMath').length > 0,
    hasImage: drawings.length > 0,
    hasAutoNum: numPr,
  };
}

export async function loadDocxSessionFromFile(file: File): Promise<LoadedDocxSession> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('Tệp không phải .docx hợp lệ (thiếu word/document.xml).');
  }
  const documentXml = await docFile.async('text');
  const numFile = zip.file('word/numbering.xml');
  const numberingXml = numFile ? await numFile.async('text') : null;
  return {
    fileName: file.name,
    zip,
    documentXml,
    numberingXml,
    undoStack: [],
  };
}

export async function exportSessionToDocxBlob(session: LoadedDocxSession): Promise<Blob> {
  const cloneZip = new JSZip();
  const entries = Object.keys(session.zip.files);
  for (const name of entries) {
    const entry = session.zip.files[name];
    if (entry.dir) continue;
    if (name === 'word/document.xml') {
      cloneZip.file(name, session.documentXml);
    } else {
      const data = await entry.async('uint8array');
      cloneZip.file(name, data);
    }
  }
  return cloneZip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function inspectSessionDom(session: LoadedDocxSession): DocxDomInspection {
  const doc = parseXml(session.documentXml);
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  const ommlCount = doc.getElementsByTagName('m:oMath').length;
  const tableCount = doc.getElementsByTagName('w:tbl').length;
  const sectionCount = Math.max(1, doc.getElementsByTagName('w:sectPr').length);

  const zipFiles = Object.keys(session.zip.files);
  const imageCount = zipFiles.filter((f) => f.startsWith('word/media/') && !session.zip.files[f].dir).length;
  const headerCount = zipFiles.filter((f) => /^word\/header\d*\.xml$/.test(f)).length;
  const footerCount = zipFiles.filter((f) => /^word\/footer\d*\.xml$/.test(f)).length;

  let autoNumberCount = 0;
  const questionNumbers: number[] = [];
  const previewParagraphs: DocxDomInspection['previewParagraphs'] = [];
  const issues: string[] = [];

  paragraphs.forEach((p, idx) => {
    const info = getParagraphDisplayText(p);
    if (info.hasAutoNum) autoNumberCount++;
    const qMatch = info.text.match(/^Câu\s+(\d+)\s*[:.]/i);
    if (qMatch) {
      questionNumbers.push(Number(qMatch[1]));
    }
    if (info.text || info.hasImage || info.hasOmml) {
      previewParagraphs.push({
        index: idx,
        text: info.text || (info.hasImage ? '[Hình ảnh nhúng]' : '[Công thức OMML]'),
        hasOmml: info.hasOmml,
        hasImage: info.hasImage,
        hasAutoNum: info.hasAutoNum,
        isQuestion: Boolean(qMatch),
      });
    }
  });

  if (autoNumberCount > 0) {
    issues.push(`Phát hiện ${autoNumberCount} đoạn dùng đánh số tự động (Auto-Number) của Word — nên chuyển sang số thứ tự văn bản trước khi trộn đề.`);
  }

  // Audit question numbers
  if (questionNumbers.length > 0) {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const n of questionNumbers) {
      if (seen.has(n)) dupes.add(n);
      seen.add(n);
    }
    if (dupes.size > 0) {
      issues.push(`Số thứ tự câu bị trùng: ${Array.from(dupes).sort((a, b) => a - b).join(', ')}.`);
    }
    const maxQ = Math.max(...questionNumbers);
    const missing: number[] = [];
    for (let k = 1; k <= maxQ; k++) {
      if (!seen.has(k)) missing.push(k);
    }
    if (missing.length > 0 && missing.length <= 20) {
      issues.push(`Phát hiện thiếu câu số: ${missing.join(', ')}.`);
    }
  }

  return {
    fileName: session.fileName,
    paragraphCount: paragraphs.length,
    ommlCount,
    imageCount,
    tableCount,
    headerCount,
    footerCount,
    sectionCount,
    autoNumberCount,
    questionNumbers,
    previewParagraphs,
    issues,
  };
}

function getOrCreateChild(doc: Document, parent: Element, tagName: string): Element {
  const existing = Array.from(parent.children).find((c) => c.tagName === tagName);
  if (existing) return existing;
  const el = doc.createElementNS(W_NS, tagName);
  parent.insertBefore(el, parent.firstChild);
  return el;
}

/**
 * Normalize Times New Roman 13pt (w:sz=26), line spacing, A4 page setup across document.xml
 * Preserving <m:oMath>, <w:drawing>, <w:tbl>, headers/footers, superscripts/subscripts!
 */
export function applyNormalizeTimesNewRoman13A4(
  session: LoadedDocxSession,
  opts: { lineSpacing240?: number; marginLeftTwips?: number } = {}
): { session: LoadedDocxSession; modifiedRuns: number } {
  const doc = parseXml(session.documentXml);
  const runs = Array.from(doc.getElementsByTagName('w:r'));
  let modifiedRuns = 0;

  for (const r of runs) {
    // Skip runs inside math tags just in case, though m:r is separate from w:r
    if (r.closest('m\\:oMath, oMath')) continue;
    const rPr = getOrCreateChild(doc, r, 'w:rPr');
    // Skip changing size of superscript/subscript if vertAlign is present (keep readable ratio)
    const hasVertAlign = Array.from(rPr.children).some((c) => c.tagName === 'w:vertAlign');

    let rFonts = Array.from(rPr.children).find((c) => c.tagName === 'w:rFonts');
    if (!rFonts) {
      rFonts = doc.createElementNS(W_NS, 'w:rFonts');
      rPr.insertBefore(rFonts, rPr.firstChild);
    }
    rFonts.setAttribute('w:ascii', 'Times New Roman');
    rFonts.setAttribute('w:hAnsi', 'Times New Roman');
    rFonts.setAttribute('w:cs', 'Times New Roman');
    rFonts.setAttribute('w:eastAsia', 'Times New Roman');

    if (!hasVertAlign) {
      let sz = Array.from(rPr.children).find((c) => c.tagName === 'w:sz');
      if (!sz) {
        sz = doc.createElementNS(W_NS, 'w:sz');
        rPr.appendChild(sz);
      }
      sz.setAttribute('w:val', '26');
      let szCs = Array.from(rPr.children).find((c) => c.tagName === 'w:szCs');
      if (!szCs) {
        szCs = doc.createElementNS(W_NS, 'w:szCs');
        rPr.appendChild(szCs);
      }
      szCs.setAttribute('w:val', '26');
    }
    modifiedRuns++;
  }

  // Paragraph spacing normalization
  const spacingVal = String(opts.lineSpacing240 ?? 276); // 1.15x = 276
  for (const p of Array.from(doc.getElementsByTagName('w:p'))) {
    const pPr = getOrCreateChild(doc, p, 'w:pPr');
    let sp = Array.from(pPr.children).find((c) => c.tagName === 'w:spacing');
    if (!sp) {
      sp = doc.createElementNS(W_NS, 'w:spacing');
      pPr.appendChild(sp);
    }
    sp.setAttribute('w:after', '100');
    sp.setAttribute('w:line', spacingVal);
    sp.setAttribute('w:lineRule', 'auto');
  }

  // Ensure A4 on sectPr (11906 x 16838 twips)
  for (const sect of Array.from(doc.getElementsByTagName('w:sectPr'))) {
    let pgSz = Array.from(sect.children).find((c) => c.tagName === 'w:pgSz');
    if (!pgSz) {
      pgSz = doc.createElementNS(W_NS, 'w:pgSz');
      sect.appendChild(pgSz);
    }
    pgSz.setAttribute('w:w', '11906');
    pgSz.setAttribute('w:h', '16838');

    let pgMar = Array.from(sect.children).find((c) => c.tagName === 'w:pgMar');
    if (!pgMar) {
      pgMar = doc.createElementNS(W_NS, 'w:pgMar');
      sect.appendChild(pgMar);
    }
    pgMar.setAttribute('w:top', '1134');
    pgMar.setAttribute('w:bottom', '1134');
    pgMar.setAttribute('w:right', '1134');
    pgMar.setAttribute('w:left', String(opts.marginLeftTwips ?? 1417));
  }

  return {
    session: {
      ...session,
      undoStack: [...session.undoStack.slice(-15), session.documentXml],
      documentXml: serializeXml(doc),
    },
    modifiedRuns,
  };
}

function formatCounterValue(val: number, fmt: string): string {
  if (fmt === 'lowerLetter') {
    return String.fromCharCode(96 + ((val - 1) % 26) + 1);
  }
  if (fmt === 'upperLetter') {
    return String.fromCharCode(64 + ((val - 1) % 26) + 1);
  }
  if (fmt === 'lowerRoman') {
    const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
    return romans[val - 1] || String(val);
  }
  if (fmt === 'upperRoman') {
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    return romans[val - 1] || String(val);
  }
  if (fmt === 'bullet') {
    return '•';
  }
  return String(val);
}

/**
 * Convert Word Auto-Numbering (w:numPr) to literal text at start of paragraphs
 * by resolving word/numbering.xml numId + ilvl levels, preserving multi-level numbering!
 */
export function applyConvertAutoNumberToText(session: LoadedDocxSession): {
  session: LoadedDocxSession;
  convertedCount: number;
} {
  const doc = parseXml(session.documentXml);
  const numDoc = session.numberingXml ? parseXml(session.numberingXml) : null;

  // Build lookup: numId -> abstractNumId; abstractNumId -> levelMap[ilvl] = { numFmt, lvlText, start }
  const numToAbstract: Record<string, string> = {};
  const abstractLevels: Record<string, Record<string, { fmt: string; text: string; start: number }>> = {};

  if (numDoc) {
    for (const numEl of Array.from(numDoc.getElementsByTagName('w:num'))) {
      const numId = numEl.getAttribute('w:numId') || '';
      const absNode = numEl.getElementsByTagName('w:abstractNumId')[0];
      const absId = absNode?.getAttribute('w:val') || '';
      if (numId && absId) numToAbstract[numId] = absId;
    }
    for (const absEl of Array.from(numDoc.getElementsByTagName('w:abstractNum'))) {
      const absId = absEl.getAttribute('w:abstractNumId') || '';
      const lvls: Record<string, { fmt: string; text: string; start: number }> = {};
      for (const lvl of Array.from(absEl.getElementsByTagName('w:lvl'))) {
        const ilvl = lvl.getAttribute('w:ilvl') || '0';
        const fmt = lvl.getElementsByTagName('w:numFmt')[0]?.getAttribute('w:val') || 'decimal';
        const txt = lvl.getElementsByTagName('w:lvlText')[0]?.getAttribute('w:val') || '%1.';
        const start = Number(lvl.getElementsByTagName('w:start')[0]?.getAttribute('w:val') || '1');
        lvls[ilvl] = { fmt, text: txt, start };
      }
      if (absId) abstractLevels[absId] = lvls;
    }
  }

  // Track counters per numId -> ilvl -> currentValue
  const counters: Record<string, Record<string, number>> = {};
  let convertedCount = 0;

  for (const p of Array.from(doc.getElementsByTagName('w:p'))) {
    const pPr = Array.from(p.children).find((c) => c.tagName === 'w:pPr');
    if (!pPr) continue;
    const numPr = Array.from(pPr.children).find((c) => c.tagName === 'w:numPr');
    if (!numPr) continue;

    const numId = numPr.getElementsByTagName('w:numId')[0]?.getAttribute('w:val') || '1';
    const ilvl = numPr.getElementsByTagName('w:ilvl')[0]?.getAttribute('w:val') || '0';

    const absId = numToAbstract[numId] || '';
    const lvlDef = abstractLevels[absId]?.[ilvl] || { fmt: 'decimal', text: '%1.', start: 1 };

    if (!counters[numId]) counters[numId] = {};
    if (typeof counters[numId][ilvl] === 'undefined') {
      counters[numId][ilvl] = lvlDef.start;
    } else {
      counters[numId][ilvl] += 1;
    }
    // Reset deeper levels
    for (const k of Object.keys(counters[numId])) {
      if (Number(k) > Number(ilvl)) {
        delete counters[numId][k];
      }
    }

    // Substitute placeholders %1, %2...
    let label = lvlDef.text;
    for (let l = 0; l <= Number(ilvl); l++) {
      const lStr = String(l);
      const lDef = abstractLevels[absId]?.[lStr] || { fmt: 'decimal', text: '%1.', start: 1 };
      const val = counters[numId][lStr] ?? lDef.start;
      label = label.replace(new RegExp(`%${l + 1}`, 'g'), formatCounterValue(val, lDef.fmt));
    }

    // Remove w:numPr and prepend <w:r><w:t>label </w:t></w:r>
    pPr.removeChild(numPr);
    const newRun = doc.createElementNS(W_NS, 'w:r');
    const rPr = doc.createElementNS(W_NS, 'w:rPr');
    const rFonts = doc.createElementNS(W_NS, 'w:rFonts');
    rFonts.setAttribute('w:ascii', 'Times New Roman');
    rFonts.setAttribute('w:hAnsi', 'Times New Roman');
    rPr.appendChild(rFonts);
    const sz = doc.createElementNS(W_NS, 'w:sz');
    sz.setAttribute('w:val', '26');
    rPr.appendChild(sz);
    newRun.appendChild(rPr);
    const tEl = doc.createElementNS(W_NS, 'w:t');
    tEl.setAttribute('xml:space', 'preserve');
    tEl.textContent = `${label} `;
    newRun.appendChild(tEl);

    const firstAfterPPr = pPr.nextSibling;
    p.insertBefore(newRun, firstAfterPPr);
    convertedCount++;
  }

  return {
    session: {
      ...session,
      undoStack: [...session.undoStack.slice(-15), session.documentXml],
      documentXml: serializeXml(doc),
    },
    convertedCount,
  };
}

/**
 * Clean extra spaces, blank consecutive paragraphs, normalize Câu X: bold & punctuation
 */
export function applyBeautifyQuestionsAndWhitespace(
  session: LoadedDocxSession,
  options: {
    boldQuestionHeader: boolean;
    cleanDoubleSpaces: boolean;
    removeBlankDuplicates: boolean;
    renumberStart?: number | null;
    resetPerPart?: boolean;
  }
): { session: LoadedDocxSession; updatedQuestions: number; removedEmpty: number } {
  const doc = parseXml(session.documentXml);
  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) return { session, updatedQuestions: 0, removedEmpty: 0 };

  let updatedQuestions = 0;
  let removedEmpty = 0;
  let prevWasEmpty = false;
  let qCounter = options.renumberStart ?? 1;

  for (const child of Array.from(body.children)) {
    if (child.tagName !== 'w:p') {
      prevWasEmpty = false;
      continue;
    }

    const info = getParagraphDisplayText(child);
    if (!info.text && !info.hasImage && !info.hasOmml) {
      if (options.removeBlankDuplicates && prevWasEmpty) {
        body.removeChild(child);
        removedEmpty++;
        continue;
      }
      prevWasEmpty = true;
      continue;
    }
    prevWasEmpty = false;

    if (options.resetPerPart && /^PHẦN\s+(I|II|III|IV|1|2|3)/i.test(info.text)) {
      qCounter = options.renumberStart ?? 1;
    }

    // Check if paragraph starts with Câu <number>
    const qMatch = info.text.match(/^(Câu\s+\d+\s*[:.]?)/i);
    const firstT = child.getElementsByTagName('w:t')[0];

    if (options.cleanDoubleSpaces) {
      for (const t of Array.from(child.getElementsByTagName('w:t'))) {
        if (t.textContent) {
          t.textContent = t.textContent.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:?!])/g, '$1');
        }
      }
    }

    if (qMatch && firstT) {
      if (options.renumberStart !== null && options.renumberStart !== undefined) {
        const raw = firstT.textContent || '';
        if (/^\s*Câu\s+\d+\s*[:.]?/i.test(raw)) {
          firstT.textContent = raw.replace(/^\s*Câu\s+\d+\s*[:.]?/i, `Câu ${qCounter}:`);
          qCounter++;
          updatedQuestions++;
        }
      }

      if (options.boldQuestionHeader) {
        // Bold first run matching Câu X:
        const firstRun = firstT.closest('w\\:r, r') || firstT.parentElement;
        if (firstRun && firstRun.tagName === 'w:r') {
          const rPr = getOrCreateChild(doc, firstRun, 'w:rPr');
          if (!Array.from(rPr.children).some((c) => c.tagName === 'w:b')) {
            rPr.appendChild(doc.createElementNS(W_NS, 'w:b'));
          }
          if (!options.renumberStart) updatedQuestions++;
        }
      }
    }
  }

  return {
    session: {
      ...session,
      undoStack: [...session.undoStack.slice(-15), session.documentXml],
      documentXml: serializeXml(doc),
    },
    updatedQuestions,
    removedEmpty,
  };
}

/**
 * Controlled Find & Replace across <w:t> text nodes only (never touches XML tags or OMML)
 */
export function applyControlledReplaceInXml(
  session: LoadedDocxSession,
  findText: string,
  replaceText: string,
  caseSensitive = false
): { session: LoadedDocxSession; replacements: number } {
  if (!findText) return { session, replacements: 0 };
  const doc = parseXml(session.documentXml);
  let replacements = 0;
  const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');

  for (const t of Array.from(doc.getElementsByTagName('w:t'))) {
    const val = t.textContent || '';
    if (regex.test(val)) {
      regex.lastIndex = 0;
      const matches = val.match(regex);
      replacements += matches ? matches.length : 0;
      t.textContent = val.replace(regex, replaceText);
    }
  }

  if (replacements === 0) return { session, replacements: 0 };
  return {
    session: {
      ...session,
      undoStack: [...session.undoStack.slice(-15), session.documentXml],
      documentXml: serializeXml(doc),
    },
    replacements,
  };
}

/**
 * Extract questions and answers/solutions from DOCX DOM for Student vs Teacher split
 * or reverse-parsing into ExamBuilder
 */
export function extractDocxExamOutline(session: LoadedDocxSession): {
  title: string;
  questions: {
    number: number;
    stem: string;
    options: string[];
    answerLine?: string;
    solutionLines: string[];
  }[];
  answersFound: Record<number, string>;
} {
  const doc = parseXml(session.documentXml);
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  let title = session.fileName.replace(/\.docx$/i, '');
  const questions: {
    number: number;
    stem: string;
    options: string[];
    answerLine?: string;
    solutionLines: string[];
  }[] = [];
  const answersFound: Record<number, string> = {};

  let currentQ: (typeof questions)[number] | null = null;
  let inSolutionMode = false;

  for (let i = 0; i < paragraphs.length; i++) {
    const text = getParagraphDisplayText(paragraphs[i]).text;
    if (!text) continue;
    if (i < 3 && text.length > 4 && text.length < 120 && !/^Câu\s+\d+/i.test(text) && !title) {
      title = text;
    }

    const qMatch = text.match(/^Câu\s+(\d+)\s*[:.]\s*(.*)$/i);
    if (qMatch) {
      if (currentQ) questions.push(currentQ);
      currentQ = {
        number: Number(qMatch[1]),
        stem: qMatch[2].trim(),
        options: [],
        solutionLines: [],
      };
      inSolutionMode = false;
      continue;
    }

    if (currentQ) {
      if (/^(Lời giải|Hướng dẫn giải|Đáp án)\s*[:.]/i.test(text)) {
        inSolutionMode = true;
        const ansMatch = text.match(/Chọn\s+([A-D])|Đáp án\s*[:.]?\s*([A-D]|Đúng|Sai|[\d.,-]+)/i);
        if (ansMatch) {
          const a = ansMatch[1] || ansMatch[2];
          currentQ.answerLine = a;
          answersFound[currentQ.number] = a;
        }
        currentQ.solutionLines.push(text);
      } else if (inSolutionMode) {
        currentQ.solutionLines.push(text);
      } else if (/^[A-D]\./.test(text)) {
        // Split inline A. ... B. ... C. ... D. ... if on one line
        const splitOpts = text.split(/(?=[A-D]\.\s*)/g).map((s) => s.trim()).filter(Boolean);
        currentQ.options.push(...splitOpts);
      } else {
        currentQ.stem = [currentQ.stem, text].filter(Boolean).join('\n');
      }
    }
  }
  if (currentQ) questions.push(currentQ);

  return { title, questions, answersFound };
}

export function applyStripSolutionsForStudentEdition(session: LoadedDocxSession): {
  session: LoadedDocxSession;
  removedCount: number;
} {
  const doc = parseXml(session.documentXml);
  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) return { session, removedCount: 0 };

  let removing = false;
  let removedCount = 0;

  for (const child of Array.from(body.children)) {
    if (child.tagName !== 'w:p') continue;
    const text = getParagraphDisplayText(child).text;
    if (/^Câu\s+\d+\s*[:.]/i.test(text) || /^PHẦN\s+/i.test(text)) {
      removing = false;
      continue;
    }
    if (/^(Lời giải|Hướng dẫn giải|Hướng dẫn chấm|Đáp án chi tiết)\s*[:.]?/i.test(text)) {
      removing = true;
      body.removeChild(child);
      removedCount++;
      continue;
    }
    if (removing) {
      body.removeChild(child);
      removedCount++;
    }
  }

  return {
    session: {
      ...session,
      undoStack: [...session.undoStack.slice(-15), session.documentXml],
      documentXml: serializeXml(doc),
    },
    removedCount,
  };
}
