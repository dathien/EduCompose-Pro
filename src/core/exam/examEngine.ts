import JSZip from 'jszip';
import {
  CognitiveLevel,
  DocumentBlock,
  ExamMatrixRow,
  ExamPaper,
  ExamQuestion,
  QuestionType,
  ShuffleConfig,
  ShuffledVariant,
} from '../../types';
import { exportDocumentBlocksToDocxBlob, tryLatexToOmml } from '../docx/docxEngine';
import { hasRichContent, parseMixedTextToRichHtml } from '../math/richTextCodec';
import { generateId } from '../../utils/vietnamese';

const OPT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const SUB_LETTERS = ['a', 'b', 'c', 'd'];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  trac_nghiem: 'Trắc nghiệm (4 chọn 1)',
  dung_sai: 'Đúng / Sai (4 ý)',
  tra_loi_ngan: 'Trả lời ngắn',
  tu_luan: 'Tự luận',
  dien_khuyet: 'Điền khuyết',
  ghep_noi: 'Ghép nối',
};

export const LEVEL_LABELS: Record<CognitiveLevel, string> = {
  nhan_biet: 'Nhận biết',
  thong_hieu: 'Thông hiểu',
  van_dung: 'Vận dụng',
};

function fisherYates<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Generates exam variants with stable IDs for accurate answer-key remapping.
 */
export function generateShuffledVariants(
  baseQuestions: ExamQuestion[],
  config: ShuffleConfig
): { variants: ShuffledVariant[]; warnings: string[] } {
  const warnings: string[] = [];
  if (baseQuestions.length === 0) {
    return { variants: [], warnings: ['Chưa có câu hỏi nào để trộn.'] };
  }

  // Group into the 4 standard exam parts so section order stays pedagogical
  const partsOrder: QuestionType[] = [
    'trac_nghiem',
    'dung_sai',
    'tra_loi_ngan',
    'dien_khuyet',
    'ghep_noi',
    'tu_luan',
  ];

  // Build original question numbering map
  const origOrdered: ExamQuestion[] = [];
  for (const pt of partsOrder) {
    origOrdered.push(...baseQuestions.filter((q) => q.type === pt));
  }
  const origNumById: Record<string, number> = {};
  origOrdered.forEach((q, idx) => {
    origNumById[q.id] = idx + 1;
  });

  const variants: ShuffledVariant[] = [];
  const seenSignatures = new Set<string>();

  for (let vIdx = 0; vIdx < config.numCodes; vIdx++) {
    const code = String(config.startCode + vIdx).padStart(3, '0');
    let bestVariant: ShuffledVariant | null = null;

    // Try up to 12 permutations to avoid duplicate variant orders when N is feasible
    for (let attempt = 0; attempt < 12; attempt++) {
      const shuffledList: ExamQuestion[] = [];

      for (const pt of partsOrder) {
        const partQs = origOrdered.filter((q) => q.type === pt);
        if (partQs.length === 0) continue;

        if (!config.shuffleQuestionsWithinPart) {
          shuffledList.push(...partQs);
          continue;
        }

        // Separate locked vs movable slots, keeping passage groups together if requested
        const lockedSlots: Record<number, ExamQuestion> = {};
        const movableUnits: ExamQuestion[][] = [];
        const passageBuckets: Record<string, ExamQuestion[]> = {};

        partQs.forEach((q, idx) => {
          if (q.lockOrder) {
            lockedSlots[idx] = q;
          } else if (config.keepPassageGroupsTogether && q.passage?.trim()) {
            const pKey = q.passage.trim();
            if (!passageBuckets[pKey]) {
              passageBuckets[pKey] = [];
              movableUnits.push(passageBuckets[pKey]);
            }
            passageBuckets[pKey].push(q);
          } else {
            movableUnits.push([q]);
          }
        });

        const mixedUnits = fisherYates(movableUnits).flat();
        let mCursor = 0;
        for (let slot = 0; slot < partQs.length; slot++) {
          if (lockedSlots[slot]) {
            shuffledList.push(lockedSlots[slot]);
          } else {
            shuffledList.push(mixedUnits[mCursor++]);
          }
        }
      }

      // Now shuffle options & Đ/S sub-items per question using stable IDs
      const finalQuestions: ExamQuestion[] = [];
      const questionOrderMap: Record<string, number> = {};
      const answerKeyByQuestionNum: Record<number, string> = {};
      const permutationDetails: ShuffledVariant['permutationDetails'] = [];
      const sigParts: string[] = [];

      shuffledList.forEach((q, idx) => {
        const newNum = idx + 1;
        questionOrderMap[q.id] = newNum;
        let clonedQ: ExamQuestion = { ...q };
        let answerInVariant = '—';
        let optionMapStr = '';

        if (q.type === 'trac_nghiem' && q.options && q.options.length > 0) {
          let newOpts = [...q.options];
          if (config.shuffleMcqOptions) {
            const lockedOptSlots: Record<number, (typeof newOpts)[number]> = {};
            const freeOpts: typeof newOpts = [];
            newOpts.forEach((o, oi) => {
              if (o.isLockedPosition) lockedOptSlots[oi] = o;
              else freeOpts.push(o);
            });
            const shuffledFree = fisherYates(freeOpts);
            let fPtr = 0;
            newOpts = newOpts.map((_, oi) => lockedOptSlots[oi] || shuffledFree[fPtr++]);
          }
          clonedQ = { ...clonedQ, options: newOpts };
          const correctIdx = newOpts.findIndex((o) => o.id === q.correctOptionId);
          answerInVariant = correctIdx >= 0 ? OPT_LETTERS[correctIdx] : '?';
          const origLetters = newOpts.map((o) => {
            const oi = q.options!.findIndex((orig) => orig.id === o.id);
            return OPT_LETTERS[oi] || '?';
          });
          optionMapStr = origLetters.join('');
          sigParts.push(`${q.id}:${optionMapStr}`);
        } else if (q.type === 'dung_sai' && q.tfItems && q.tfItems.length > 0) {
          let newTf = [...q.tfItems];
          if (config.shuffleTfSubItems && q.allowSubItemShuffle !== false) {
            newTf = fisherYates(newTf);
          }
          clonedQ = { ...clonedQ, tfItems: newTf };
          answerInVariant = newTf
            .map((sub, si) => `${SUB_LETTERS[si]}-${sub.isTrue ? 'Đ' : 'S'}`)
            .join(' ');
          sigParts.push(`${q.id}:${newTf.map((s) => s.id).join(',')}`);
        } else if (q.type === 'tra_loi_ngan' || q.type === 'dien_khuyet') {
          answerInVariant = q.shortAnswer || '—';
          sigParts.push(q.id);
        } else if (q.type === 'ghep_noi' && q.matchingPairs) {
          answerInVariant = q.matchingPairs.map((p, i) => `${i + 1}-${p.right}`).join('; ');
          sigParts.push(q.id);
        } else {
          answerInVariant = q.gradingGuide ? 'Xem HDC' : 'Tự luận';
          sigParts.push(q.id);
        }

        answerKeyByQuestionNum[newNum] = answerInVariant;
        permutationDetails.push({
          newNum,
          originalQuestionId: q.id,
          originalNum: origNumById[q.id] || newNum,
          type: q.type,
          answerInVariant,
          optionMap: optionMapStr || undefined,
        });
        finalQuestions.push(clonedQ);
      });

      const signature = sigParts.join('|');
      bestVariant = {
        code,
        questions: finalQuestions,
        questionOrderMap,
        answerKeyByQuestionNum,
        permutationDetails,
      };

      if (!seenSignatures.has(signature)) {
        seenSignatures.add(signature);
        break;
      } else if (attempt === 11 && vIdx > 0) {
        warnings.push(
          `Mã đề ${code} trùng hoàn toàn hoán vị với mã trước do số câu hỏi hoặc tùy chọn cho phép trộn quá ít.`
        );
      }
    }

    if (bestVariant) {
      variants.push(bestVariant);
    }
  }

  return { variants, warnings };
}

/**
 * Algorithmic Matrix -> Question Bank builder (no AI hallucination, transparent gap report)
 */
export function buildExamFromMatrix(
  matrix: ExamMatrixRow[],
  bank: ExamQuestion[],
  subjectFilter?: string
): {
  selectedQuestions: ExamQuestion[];
  shortfalls: string[];
  matchedCount: number;
  requestedCount: number;
} {
  const usedIds = new Set<string>();
  const selectedQuestions: ExamQuestion[] = [];
  const shortfalls: string[] = [];
  let requestedCount = 0;

  const pickForLevel = (row: ExamMatrixRow, level: CognitiveLevel, need: number) => {
    if (need <= 0) return;
    requestedCount += need;
    const candidates = fisherYates(
      bank.filter(
        (q) =>
          !usedIds.has(q.id) &&
          (!subjectFilter || subjectFilter === 'all' || q.subject === subjectFilter) &&
          q.type === row.questionType &&
          q.level === level &&
          (q.topic.toLowerCase().includes(row.topic.toLowerCase()) ||
            row.topic.toLowerCase().includes(q.topic.toLowerCase()))
      )
    );
    const taken = candidates.slice(0, need).map((q) => ({ ...q, points: row.pointsPerItem }));
    taken.forEach((q) => usedIds.add(q.id));
    selectedQuestions.push(...taken);
    if (taken.length < need) {
      shortfalls.push(
        `Chủ đề "${row.topic}" (${QUESTION_TYPE_LABELS[row.questionType]} – ${LEVEL_LABELS[level]}): thiếu ${need - taken.length}/${need} câu trong Ngân hàng.`
      );
    }
  };

  for (const row of matrix) {
    pickForLevel(row, 'nhan_biet', row.nbCount);
    pickForLevel(row, 'thong_hieu', row.thCount);
    pickForLevel(row, 'van_dung', row.vdCount);
  }

  return {
    selectedQuestions,
    shortfalls,
    matchedCount: selectedQuestions.length,
    requestedCount,
  };
}

export function computeMatrixTotals(matrix: ExamMatrixRow[]) {
  let totalQuestions = 0;
  let totalPoints = 0;
  let nbPts = 0;
  let thPts = 0;
  let vdPts = 0;

  for (const r of matrix) {
    const rowQ = r.nbCount + r.thCount + r.vdCount;
    totalQuestions += rowQ;
    nbPts += r.nbCount * r.pointsPerItem;
    thPts += r.thCount * r.pointsPerItem;
    vdPts += r.vdCount * r.pointsPerItem;
    totalPoints += rowQ * r.pointsPerItem;
  }

  return {
    totalQuestions,
    totalPoints: Math.round(totalPoints * 100) / 100,
    nbPct: totalPoints > 0 ? Math.round((nbPts / totalPoints) * 100) : 0,
    thPct: totalPoints > 0 ? Math.round((thPts / totalPoints) * 100) : 0,
    vdPct: totalPoints > 0 ? Math.round((vdPts / totalPoints) * 100) : 0,
  };
}

export function auditExamPaper(exam: ExamPaper): string[] {
  const issues: string[] = [];
  if (exam.questions.length === 0) {
    issues.push('Đề kiểm tra chưa có câu hỏi nào.');
    return issues;
  }

  exam.questions.forEach((q, idx) => {
    const label = `Câu ${idx + 1}`;
    if (!hasRichContent(q.stem)) issues.push(`${label} đang để trống nội dung câu hỏi.`);
    if (q.type === 'trac_nghiem') {
      if (!q.options || q.options.length < 4) issues.push(`${label} (Trắc nghiệm) chưa đủ 4 phương án A, B, C, D.`);
      if (!q.correctOptionId) issues.push(`${label} chưa đánh dấu đáp án đúng.`);
      const emptyOpt = q.options?.some((o) => !hasRichContent(o.text));
      if (emptyOpt) issues.push(`${label} có phương án trả lời bị bỏ trống.`);
    } else if (q.type === 'dung_sai') {
      if (!q.tfItems || q.tfItems.length < 4) issues.push(`${label} (Đúng/Sai) chưa đủ 4 ý a, b, c, d.`);
    } else if (q.type === 'tra_loi_ngan' || q.type === 'dien_khuyet') {
      if (!hasRichContent(q.shortAnswer)) issues.push(`${label} chưa nhập đáp án số / từ khóa chấm điểm.`);
    }
  });

  const totalPts = exam.questions.reduce((s, q) => s + (q.points || 0), 0);
  if (Math.abs(totalPts - 10) > 0.01) {
    issues.push(`Tổng điểm hiện tại của đề là ${totalPts.toFixed(2)} điểm (thang chuẩn là 10,00 điểm).`);
  }

  return issues;
}

function prefixRichHtml(prefixHtml: string, content: string): string {
  const normalized = parseMixedTextToRichHtml(content).trim();
  if (!normalized) return `<p>${prefixHtml}</p>`;
  if (/^<p(\s[^>]*)?>/i.test(normalized)) {
    return normalized.replace(/^<p(\s[^>]*)?>/i, `<p$1>${prefixHtml}`);
  }
  return `<p>${prefixHtml}</p>${normalized}`;
}

export function examToDocumentBlocks(
  examTitle: string,
  questions: ExamQuestion[],
  opts: {
    code?: string;
    durationMinutes?: number;
    includeAnswers?: boolean;
    includeSolutions?: boolean;
  } = {}
): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const mk = (type: DocumentBlock['type'], partial: Partial<DocumentBlock>): DocumentBlock => ({
    id: generateId('eblk'),
    type,
    ...partial,
  });

  blocks.push(
    mk('paragraph', {
      text: `TRƯỜNG: [Tên trường]    |    ${examTitle}${opts.code ? ` — MÃ ĐỀ: ${opts.code}` : ''}`,
      bold: true,
      align: 'center',
    })
  );
  blocks.push(
    mk('paragraph', {
      text: `Thời gian làm bài: ${opts.durationMinutes || 45} phút   |   Họ và tên thí sinh: ...........................................   SBD: .............`,
      italic: true,
      align: 'center',
    })
  );

  const sections: { type: QuestionType; title: string }[] = [
    { type: 'trac_nghiem', title: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn' },
    { type: 'dung_sai', title: 'PHẦN II. Câu trắc nghiệm đúng sai' },
    { type: 'tra_loi_ngan', title: 'PHẦN III. Câu trắc nghiệm trả lời ngắn' },
    { type: 'dien_khuyet', title: 'PHẦN IV. Câu hỏi điền khuyết' },
    { type: 'ghep_noi', title: 'PHẦN V. Câu hỏi ghép nối' },
    { type: 'tu_luan', title: 'PHẦN TỰ LUẬN' },
  ];

  let globalIndex = 1;
  let lastPassage = '';

  for (const sec of sections) {
    const qs = questions.filter((q) => q.type === sec.type);
    if (qs.length === 0) continue;
    blocks.push(mk('heading', { text: sec.title }));

    let partIndex = 1;
    for (const q of qs) {
      if (q.passage?.trim() && q.passage.trim() !== lastPassage && hasRichContent(q.passage)) {
        lastPassage = q.passage.trim();
        blocks.push(mk('paragraph', { text: lastPassage, html: lastPassage, italic: true }));
      }
      const prefixedStem = prefixRichHtml(`<strong>Câu ${partIndex}:</strong> `, q.stem);
      blocks.push(mk('paragraph', { text: prefixedStem, html: prefixedStem, bold: false }));

      if (q.svgIllustration) {
        blocks.push(
          mk('drawing', {
            drawingName: `Hinh minh hoa Cau ${partIndex}`,
            svgContent: q.svgIllustration,
          })
        );
      }

      if (q.type === 'trac_nghiem' && q.options) {
        const optHtmls = q.options.map((o, oi) => {
          const optRich = parseMixedTextToRichHtml(o.text).trim();
          const cleanOpt = optRich
            .replace(/^<p(\s[^>]*)?>/i, '')
            .replace(/<\/p>\s*$/i, '')
            .trim();
          return `<strong>${OPT_LETTERS[oi]}.</strong> ${cleanOpt}`;
        });
        blocks.push(
          mk('paragraph', {
            text: optHtmls.join('        '),
            html: `<p>${optHtmls.join('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')}</p>`,
          })
        );
      } else if (q.type === 'dung_sai' && q.tfItems) {
        q.tfItems.forEach((sub, si) => {
          const prefixedSub = prefixRichHtml(`<strong>${SUB_LETTERS[si]})</strong> `, sub.text);
          blocks.push(mk('paragraph', { text: prefixedSub, html: prefixedSub }));
        });
      } else if (q.type === 'ghep_noi' && q.matchingPairs) {
        blocks.push(
          mk('table', {
            tableHeaders: ['Cột A', 'Cột B'],
            tableRows: q.matchingPairs.map((p, i) => [`${i + 1}. ${p.left}`, `${OPT_LETTERS[i]}. ${p.right}`]),
          })
        );
      }

      if (opts.includeSolutions && (hasRichContent(q.solution) || hasRichContent(q.gradingGuide))) {
        if (hasRichContent(q.solution)) {
          const prefixedSol = prefixRichHtml('<strong>Lời giải:</strong> ', q.solution || '');
          blocks.push(mk('paragraph', { text: prefixedSol, html: prefixedSol, italic: false }));
        }
        if (hasRichContent(q.gradingGuide)) {
          const prefixedGuide = prefixRichHtml('<strong>Hướng dẫn chấm:</strong> ', q.gradingGuide || '');
          blocks.push(mk('paragraph', { text: prefixedGuide, html: prefixedGuide, italic: true }));
        }
      }

      partIndex++;
      globalIndex++;
    }
  }

  if (opts.includeAnswers && globalIndex > 1) {
    blocks.push(mk('heading', { text: 'ĐÁP ÁN THAM KHẢO' }));
    const rows = questions.map((q, idx) => {
      let ans = '—';
      if (q.type === 'trac_nghiem' && q.options) {
        const ci = q.options.findIndex((o) => o.id === q.correctOptionId);
        ans = ci >= 0 ? OPT_LETTERS[ci] : '?';
      } else if (q.type === 'dung_sai' && q.tfItems) {
        ans = q.tfItems.map((s, si) => `${SUB_LETTERS[si]}-${s.isTrue ? 'Đ' : 'S'}`).join(' ');
      } else if (q.type === 'tra_loi_ngan' || q.type === 'dien_khuyet') {
        ans = q.shortAnswer || '—';
      } else if (q.type === 'tu_luan') {
        ans = 'Xem hướng dẫn chấm';
      }
      return [`Câu ${idx + 1}`, QUESTION_TYPE_LABELS[q.type], ans, `${q.points}đ`];
    });
    blocks.push(
      mk('table', {
        tableHeaders: ['Câu', 'Dạng câu hỏi', 'Đáp án đúng', 'Điểm'],
        tableRows: rows,
      })
    );
  }

  return blocks;
}

export async function exportExamPaperToDocxBlob(
  examTitle: string,
  questions: ExamQuestion[],
  opts: {
    code?: string;
    durationMinutes?: number;
    includeAnswers?: boolean;
    includeSolutions?: boolean;
    onWarnings?: (warnings: string[]) => void;
  } = {}
): Promise<Blob> {
  const blocks = examToDocumentBlocks(examTitle, questions, opts);
  return exportDocumentBlocksToDocxBlob(examTitle, blocks, tryLatexToOmml, opts.onWarnings);
}

export async function exportMatrixAndSpecToDocxBlob(
  title: string,
  matrix: ExamMatrixRow[]
): Promise<Blob> {
  const totals = computeMatrixTotals(matrix);
  const blocks: DocumentBlock[] = [
    {
      id: generateId('mblk'),
      type: 'heading',
      text: `MA TRẬN VÀ BẢN ĐẶC TẢ — ${title}`,
      align: 'center',
    },
    {
      id: generateId('mblk'),
      type: 'paragraph',
      text: `Tổng số câu: ${totals.totalQuestions}   |   Tổng điểm: ${totals.totalPoints}   |   Tỉ lệ NB/TH/VD: ${totals.nbPct}% / ${totals.thPct}% / ${totals.vdPct}%`,
      align: 'center',
    },
    {
      id: generateId('mblk'),
      type: 'table',
      tableHeaders: ['TT', 'Chủ đề', 'Đơn vị kiến thức', 'Yêu cầu cần đạt', 'Dạng câu', 'NB', 'TH', 'VD', 'Điểm'],
      tableRows: matrix.map((r, i) => [
        String(i + 1),
        r.topic,
        r.knowledgeUnit,
        r.requirement,
        QUESTION_TYPE_LABELS[r.questionType],
        String(r.nbCount),
        String(r.thCount),
        String(r.vdCount),
        String(Math.round((r.nbCount + r.thCount + r.vdCount) * r.pointsPerItem * 100) / 100),
      ]),
    },
  ];
  return exportDocumentBlocksToDocxBlob(`Ma tran ${title}`, blocks, tryLatexToOmml);
}

export async function exportShuffledVariantsZip(
  examTitle: string,
  durationMinutes: number,
  variants: ShuffledVariant[]
): Promise<Blob> {
  const zip = new JSZip();

  for (const v of variants) {
    const studentBlob = await exportExamPaperToDocxBlob(examTitle, v.questions, {
      code: v.code,
      durationMinutes,
      includeAnswers: false,
      includeSolutions: false,
    });
    zip.file(`De_thi_Ma_${v.code}.docx`, studentBlob);

    const teacherBlob = await exportExamPaperToDocxBlob(`${examTitle} (Bản Giáo viên)`, v.questions, {
      code: v.code,
      durationMinutes,
      includeAnswers: true,
      includeSolutions: true,
    });
    zip.file(`Loi_giai_Ma_${v.code}.docx`, teacherBlob);
  }

  // Combined Answer Key Word file across all variant codes
  const maxQ = Math.max(...variants.map((v) => v.questions.length), 0);
  const answerHeaders = ['Câu', ...variants.map((v) => `Mã ${v.code}`)];
  const answerRows: string[][] = [];
  for (let i = 1; i <= maxQ; i++) {
    answerRows.push([`Câu ${i}`, ...variants.map((v) => v.answerKeyByQuestionNum[i] || '—')]);
  }
  const answerKeyBlob = await exportDocumentBlocksToDocxBlob(
    `BẢNG ĐÁP ÁN TỔNG HỢP — ${examTitle}`,
    [
      { id: generateId('ak'), type: 'heading', text: `BẢNG ĐÁP ÁN TỔNG HỢP (${variants.length} MÃ ĐỀ)`, align: 'center' },
      { id: generateId('ak'), type: 'table', tableHeaders: answerHeaders, tableRows: answerRows },
    ],
    tryLatexToOmml
  );
  zip.file('Bang_Dap_An_Tong_Hop.docx', answerKeyBlob);

  return zip.generateAsync({ type: 'blob' });
}
