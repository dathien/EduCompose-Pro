import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  FileUp,
  Layers,
  Lock,
  MonitorPlay,
  Plus,
  Printer,
  Save,
  Search,
  Shuffle,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  CognitiveLevel,
  ExamMatrixRow,
  ExamPaper,
  ExamQuestion,
  ExtendedSubjectType,
  GradeLevel,
  QuestionType,
} from '../../types';
import {
  SAMPLE_INITIAL_EXAM,
  SAMPLE_QUESTION_BANK,
} from '../../data/samples/sampleQuestions';
import {
  LEVEL_LABELS,
  QUESTION_TYPE_LABELS,
  auditExamPaper,
  buildExamFromMatrix,
  computeMatrixTotals,
  exportExamPaperToDocxBlob,
  exportMatrixAndSpecToDocxBlob,
} from '../../core/exam/examEngine';
import { extractDocxExamOutline, loadDocxSessionFromFile } from '../../core/docx/ooxmlProcessor';
import {
  listExams,
  listQuestionBank,
  saveExamPaper,
  saveQuestionBankItem,
} from '../../storage/indexedDb';
import { RichMathText } from '../../components/RichMathText';
import { ScientificRichTextEditor } from '../../components/editor/ScientificRichTextEditor';
import { ScientificEditorGroupProvider } from '../../components/editor/editorRegistry';
import { ScientificToolbar } from '../../components/editor/ScientificToolbar';
import { ExamPresenterModal } from './ExamPresenterModal';
import { ExamPrintModal } from './ExamPrintModal';
import { hasRichContent, richContentToSearchText } from '../../core/math/richTextCodec';
import { downloadBlob, generateId, matchesVietnameseQuery } from '../../utils/vietnamese';

interface ExamBuilderPageProps {
  activeExam: ExamPaper;
  onUpdateActiveExam: (exam: ExamPaper) => void;
  onSendToShuffler: (exam: ExamPaper) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'warning') => void;
}

type BuilderTab = 'editor' | 'bank' | 'matrix' | 'import_docx';

const SUBJECT_NAMES: Record<ExtendedSubjectType, string> = {
  toan: 'Toán học',
  vat_li: 'Vật lí',
  hoa_hoc: 'Hóa học',
  tieng_anh: 'Tiếng Anh',
  sinh_hoc: 'Sinh học',
  tin_hoc: 'Tin học',
  chung: 'Tổng hợp',
};

const OPT_LETTERS = ['A', 'B', 'C', 'D'];
const SUB_LETTERS = ['a', 'b', 'c', 'd'];

function createBlankQuestion(subject: ExtendedSubjectType, grade: GradeLevel, type: QuestionType): ExamQuestion {
  const optA = generateId('opt');
  const optB = generateId('opt');
  const optC = generateId('opt');
  const optD = generateId('opt');
  return {
    id: generateId('q'),
    subject,
    grade,
    topic: 'Chủ đề mới',
    lesson: '',
    requirement: 'Đạt chuẩn kiến thức kĩ năng theo ma trận',
    level: 'nhan_biet',
    type,
    points: type === 'dung_sai' ? 1 : type === 'tu_luan' ? 1.5 : type === 'tra_loi_ngan' ? 0.5 : 0.25,
    sourceName: 'Giáo viên tự soạn',
    verified: true,
    stem: '',
    options:
      type === 'trac_nghiem'
        ? [
            { id: optA, text: 'Phương án A' },
            { id: optB, text: 'Phương án B' },
            { id: optC, text: 'Phương án C' },
            { id: optD, text: 'Phương án D' },
          ]
        : undefined,
    correctOptionId: type === 'trac_nghiem' ? optA : undefined,
    tfItems:
      type === 'dung_sai'
        ? [
            { id: generateId('tf'), text: 'Mệnh đề a)', isTrue: true },
            { id: generateId('tf'), text: 'Mệnh đề b)', isTrue: false },
            { id: generateId('tf'), text: 'Mệnh đề c)', isTrue: true },
            { id: generateId('tf'), text: 'Mệnh đề d)', isTrue: false },
          ]
        : undefined,
    shortAnswer: type === 'tra_loi_ngan' || type === 'dien_khuyet' ? '0' : undefined,
    matchingPairs:
      type === 'ghep_noi'
        ? [
            { id: generateId('mp'), left: 'Nội dung cột A1', right: 'Đáp ứng cột B1' },
            { id: generateId('mp'), left: 'Nội dung cột A2', right: 'Đáp ứng cột B2' },
          ]
        : undefined,
    solution: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const ExamBuilderPage: React.FC<ExamBuilderPageProps> = ({
  activeExam,
  onUpdateActiveExam,
  onSendToShuffler,
  onNotify,
}) => {
  const docxInputRef = useRef<HTMLInputElement | null>(null);
  const [subTab, setSubTab] = useState<BuilderTab>('editor');
  const [selectedQId, setSelectedQId] = useState<string>(activeExam.questions[0]?.id || '');
  const [savedExams, setSavedExams] = useState<ExamPaper[]>([]);
  const [userBank, setUserBank] = useState<ExamQuestion[]>([]);
  const [bankSearch, setBankSearch] = useState('');
  const [bankSubject, setBankSubject] = useState<'all' | ExtendedSubjectType>('all');
  const [bankType, setBankType] = useState<'all' | QuestionType>('all');
  const [presenterOpen, setPresenterOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const reloadStorage = useCallback(async () => {
    try {
      const [exs, bk] = await Promise.all([listExams(), listQuestionBank()]);
      setSavedExams(exs);
      setUserBank(bk);
    } catch {
      // Ignore storage fallback
    }
  }, []);

  useEffect(() => {
    reloadStorage();
  }, [reloadStorage]);

  const combinedBank = useMemo(() => {
    const map = new Map<string, ExamQuestion>();
    for (const q of SAMPLE_QUESTION_BANK) map.set(q.id, q);
    for (const q of userBank) map.set(q.id, q);
    return Array.from(map.values());
  }, [userBank]);

  const filteredBank = useMemo(() => {
    return combinedBank.filter((q) => {
      if (bankSubject !== 'all' && q.subject !== bankSubject) return false;
      if (bankType !== 'all' && q.type !== bankType) return false;
      return matchesVietnameseQuery(bankSearch, [
        richContentToSearchText(q.stem),
        richContentToSearchText(q.solution),
        q.topic,
        q.lesson,
        q.requirement,
        q.sourceName,
      ]);
    });
  }, [combinedBank, bankSubject, bankType, bankSearch]);

  const selectedQuestion = useMemo(
    () => activeExam.questions.find((q) => q.id === selectedQId) || activeExam.questions[0] || null,
    [activeExam.questions, selectedQId]
  );

  const auditIssues = useMemo(() => auditExamPaper(activeExam), [activeExam]);
  const matrixTotals = useMemo(() => computeMatrixTotals(activeExam.matrix), [activeExam.matrix]);

  const updateQuestion = (updatedQ: ExamQuestion) => {
    onUpdateActiveExam({
      ...activeExam,
      questions: activeExam.questions.map((q) => (q.id === updatedQ.id ? { ...updatedQ, updatedAt: Date.now() } : q)),
      updatedAt: Date.now(),
    });
  };

  const handleAddNewQuestion = (type: QuestionType) => {
    const q = createBlankQuestion(activeExam.subject, activeExam.grade, type);
    onUpdateActiveExam({
      ...activeExam,
      questionIds: [...activeExam.questionIds, q.id],
      questions: [...activeExam.questions, q],
      updatedAt: Date.now(),
    });
    setSelectedQId(q.id);
  };

  const handleAddFromBank = (q: ExamQuestion) => {
    const clone: ExamQuestion = { ...q, id: generateId('q'), createdAt: Date.now(), updatedAt: Date.now() };
    onUpdateActiveExam({
      ...activeExam,
      questionIds: [...activeExam.questionIds, clone.id],
      questions: [...activeExam.questions, clone],
      updatedAt: Date.now(),
    });
    onNotify(`Đã thêm câu hỏi từ ngân hàng vào đề "${activeExam.title}".`, 'success');
  };

  const handleMoveQuestion = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= activeExam.questions.length) return;
    const next = [...activeExam.questions];
    [next[idx], next[target]] = [next[target], next[idx]];
    onUpdateActiveExam({ ...activeExam, questions: next, updatedAt: Date.now() });
  };

  const handleDeleteQuestion = (id: string) => {
    const next = activeExam.questions.filter((q) => q.id !== id);
    onUpdateActiveExam({
      ...activeExam,
      questionIds: next.map((q) => q.id),
      questions: next,
      updatedAt: Date.now(),
    });
    if (selectedQId === id) {
      setSelectedQId(next[0]?.id || '');
    }
  };

  const handleSaveExamToDb = async () => {
    await saveExamPaper({ ...activeExam, updatedAt: Date.now() });
    await reloadStorage();
    onNotify(`Đã lưu đề kiểm tra "${activeExam.title}" vào IndexedDB.`, 'success');
  };

  const handleSaveQuestionToBank = async (q: ExamQuestion) => {
    await saveQuestionBankItem({ ...q, updatedAt: Date.now() });
    await reloadStorage();
    onNotify('Đã lưu câu hỏi vào Ngân hàng câu hỏi cá nhân.', 'success');
  };

  const handleGenerateFromMatrix = () => {
    const res = buildExamFromMatrix(activeExam.matrix, combinedBank, 'all');
    if (res.selectedQuestions.length === 0) {
      onNotify(
        'Ngân hàng hiện tại chưa có câu hỏi khớp đúng tên chủ đề trong ma trận. Thầy cô hãy bổ sung câu hỏi hoặc chỉnh lại tên chủ đề.',
        'warning'
      );
      return;
    }
    onUpdateActiveExam({
      ...activeExam,
      questions: res.selectedQuestions,
      questionIds: res.selectedQuestions.map((q) => q.id),
      updatedAt: Date.now(),
    });
    setSelectedQId(res.selectedQuestions[0].id);
    setSubTab('editor');
    if (res.shortfalls.length > 0) {
      onNotify(
        `Đã dựng ${res.matchedCount}/${res.requestedCount} câu từ Ngân hàng. Thiếu ở: ${res.shortfalls[0]}`,
        'warning'
      );
    } else {
      onNotify(`Đã dựng thành công ${res.matchedCount} câu hỏi khớp 100% ma trận!`, 'success');
    }
  };

  const handleImportDocxQuestions = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const session = await loadDocxSessionFromFile(file);
      const outline = extractDocxExamOutline(session);
      if (outline.questions.length === 0) {
        onNotify('Không phát hiện cấu trúc "Câu 1:", "Câu 2:" trong tệp Word này.', 'warning');
        return;
      }
      const parsedQs: ExamQuestion[] = outline.questions.map((oq) => {
        const isMcq = oq.options.length >= 2;
        const optItems = isMcq
          ? oq.options.slice(0, 4).map((txt) => ({
              id: generateId('opt'),
              text: txt.replace(/^[A-D]\.\s*/i, '').trim(),
            }))
          : undefined;
        let correctId = optItems?.[0]?.id;
        if (optItems && oq.answerLine) {
          const letterIdx = OPT_LETTERS.indexOf(oq.answerLine.toUpperCase());
          if (letterIdx >= 0 && optItems[letterIdx]) correctId = optItems[letterIdx].id;
        }
        return {
          id: generateId('q'),
          subject: activeExam.subject,
          grade: activeExam.grade,
          topic: 'Nạp từ Word',
          lesson: outline.title,
          requirement: 'Kiểm tra từ file DOCX nhập vào',
          level: 'thong_hieu',
          type: isMcq ? 'trac_nghiem' : 'tu_luan',
          points: isMcq ? 0.25 : 1.0,
          sourceName: file.name,
          verified: false,
          stem: oq.stem,
          options: optItems,
          correctOptionId: correctId,
          solution: oq.solutionLines.join('\n'),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      });

      onUpdateActiveExam({
        ...activeExam,
        title: outline.title || activeExam.title,
        questions: parsedQs,
        questionIds: parsedQs.map((q) => q.id),
        updatedAt: Date.now(),
      });
      setSelectedQId(parsedQs[0].id);
      setSubTab('editor');
      onNotify(`Đã tách ${parsedQs.length} câu hỏi từ "${file.name}" vào trình soạn đề.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Lỗi đọc tệp Word.', 'warning');
    } finally {
      e.target.value = '';
    }
  };

  const handleExportExamDocx = async (includeTeacherKeys: boolean) => {
    const ommlWarns: string[] = [];
    const blob = await exportExamPaperToDocxBlob(activeExam.title, activeExam.questions, {
      durationMinutes: activeExam.durationMinutes,
      includeAnswers: includeTeacherKeys,
      includeSolutions: includeTeacherKeys,
      onWarnings: (w) => ommlWarns.push(...w),
    });
    const suffix = includeTeacherKeys ? 'GiaoVien_DapAn' : 'DeThi_HocSinh';
    downloadBlob(blob, `${activeExam.title.replace(/\s+/g, '_').slice(0, 40)}_${suffix}.docx`);
    if (ommlWarns.length > 0) {
      onNotify(
        `Đã xuất tệp Word (${ommlWarns.length} công thức có ký hiệu đặc biệt đã chuyển sang dạng văn bản dự phòng).`,
        'warning'
      );
    } else {
      onNotify(
        `Đã xuất tệp Word chuẩn Times New Roman 13pt (${includeTeacherKeys ? 'Bản Giáo viên' : 'Bản Học sinh'}).`,
        'success'
      );
    }
  };

  return (
    <>
    <div className="space-y-5 no-print">
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-2 flex-1 min-w-[260px]">
            <input
              type="text"
              value={activeExam.title}
              onChange={(e) => onUpdateActiveExam({ ...activeExam, title: e.target.value, updatedAt: Date.now() })}
              className="w-full ui-page-title text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-sky-600 focus:outline-none px-1 py-0.5"
              aria-label="Tên đề kiểm tra"
            />
            <div className="flex flex-wrap items-center gap-2.5 text-[14px]">
              <select
                value={activeExam.subject}
                onChange={(e) => onUpdateActiveExam({ ...activeExam, subject: e.target.value as ExtendedSubjectType })}
                className="min-h-[36px] px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg"
              >
                {Object.entries(SUBJECT_NAMES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={activeExam.grade}
                onChange={(e) => onUpdateActiveExam({ ...activeExam, grade: e.target.value as GradeLevel })}
                className="min-h-[36px] px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="10">Lớp 10</option>
                <option value="11">Lớp 11</option>
                <option value="12">Lớp 12</option>
                <option value="chung">Tổng hợp</option>
              </select>
              <label className="flex items-center gap-1.5 text-slate-700">
                <span>Thời gian:</span>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={activeExam.durationMinutes}
                  onChange={(e) => onUpdateActiveExam({ ...activeExam, durationMinutes: Number(e.target.value) || 45 })}
                  className="w-16 min-h-[36px] px-2 py-1 border border-slate-200 rounded-lg text-center tabular-nums"
                />
                <span>phút</span>
              </label>
              <span className="px-2.5 py-1 bg-sky-50 text-sky-800 rounded-lg font-medium">
                {activeExam.questions.length} câu · {activeExam.questions.reduce((s, q) => s + (q.points || 0), 0).toFixed(2)}đ
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveExamToDb}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-teal-600 text-white ui-btn font-semibold rounded-lg hover:bg-teal-700"
            >
              <Save className="w-4 h-4" />
              <span>Lưu đề</span>
            </button>
            <button
              type="button"
              onClick={() => setPresenterOpen(true)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-slate-900 text-white ui-btn font-semibold rounded-lg hover:bg-slate-800"
            >
              <MonitorPlay className="w-4 h-4" />
              <span>Trình chiếu đề</span>
            </button>
            <button
              type="button"
              onClick={() => onSendToShuffler(activeExam)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-white border border-slate-300 text-slate-800 ui-btn font-medium rounded-lg hover:bg-slate-50"
            >
              <Shuffle className="w-4 h-4 text-sky-600" />
              <span>Trộn đề này</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintOpen(true)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-white border border-slate-300 text-slate-800 ui-btn font-medium rounded-lg hover:bg-slate-50"
            >
              <Printer className="w-4 h-4 text-sky-600" />
              <span>In / Lưu PDF</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportExamDocx(false)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-sky-600 text-white ui-btn font-semibold rounded-lg hover:bg-sky-700"
            >
              <Download className="w-4 h-4" />
              <span>Xuất đề HS (.docx)</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportExamDocx(true)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-sky-50 border border-sky-200 text-sky-800 ui-btn font-medium rounded-lg hover:bg-sky-100"
            >
              <FileText className="w-4 h-4" />
              <span>Bản GV + Đáp án</span>
            </button>
          </div>
        </div>

        {/* Sub-Module Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['editor', 'Soạn câu hỏi trực tiếp', BookOpen],
                ['bank', `Ngân hàng câu hỏi (${combinedBank.length})`, Database],
                ['matrix', 'Ma trận & Bản đặc tả', Layers],
                ['import_docx', 'Nạp từ Word (.docx)', FileUp],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSubTab(k)}
                className={`inline-flex items-center gap-1.5 px-3.5 min-h-[38px] ui-btn font-medium rounded-md transition-colors ${
                  subTab === k ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {savedExams.length > 0 && (
            <select
              aria-label="Mở đề đã lưu"
              value=""
              onChange={(e) => {
                const found = savedExams.find((ex) => ex.id === e.target.value);
                if (found) {
                  onUpdateActiveExam(found);
                  setSelectedQId(found.questions[0]?.id || '');
                  onNotify(`Đã nạp đề "${found.title}".`, 'info');
                }
              }}
              className="min-h-[38px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg ui-input"
            >
              <option value="">Mở nhanh đề đã lưu ({savedExams.length})...</option>
              {savedExams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.questions.length} câu)
                </option>
              ))}
              <option value={SAMPLE_INITIAL_EXAM.id}>[Khôi phục đề mẫu Toán 12]</option>
            </select>
          )}
        </div>
      </div>

      {/* TAB 1: DIRECT INLINE EDITOR */}
      {subTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Ordered Questions List */}
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="ui-section-title text-slate-900">Danh sách câu hỏi</h2>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['trac_nghiem', '+ TN'],
                    ['dung_sai', '+ Đ/S'],
                    ['tra_loi_ngan', '+ TLN'],
                    ['tu_luan', '+ TL'],
                  ] as [QuestionType, string][]
                ).map(([qt, lbl]) => (
                  <button
                    key={qt}
                    type="button"
                    onClick={() => handleAddNewQuestion(qt)}
                    className="px-2.5 py-1 bg-sky-50 border border-sky-200 text-sky-800 rounded-md text-[13px] font-semibold hover:bg-sky-100"
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[580px] overflow-y-auto panel-scroll space-y-2 pr-1">
              {activeExam.questions.map((q, idx) => {
                const isActive = selectedQuestion?.id === q.id;
                return (
                  <div
                    key={q.id}
                    onClick={() => setSelectedQId(q.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedQId(q.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors space-y-1.5 ${
                      isActive ? 'bg-sky-50 border-sky-500' : 'bg-white border-slate-200 hover:border-sky-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 text-[14px]">
                        Câu {idx + 1} · {QUESTION_TYPE_LABELS[q.type]}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Di chuyển lên"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveQuestion(idx, -1);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-800"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Di chuyển xuống"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveQuestion(idx, 1);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-800"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Xóa câu"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteQuestion(q.id);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="ui-caption text-slate-700 line-clamp-2 overflow-hidden">
                      {hasRichContent(q.stem) ? (
                        <RichMathText text={q.stem} fontSize={14} inline />
                      ) : (
                        <span className="italic text-slate-400">Chưa nhập nội dung câu hỏi</span>
                      )}
                    </div>
                    <div className="ui-caption text-slate-500 flex items-center justify-between">
                      <span>{LEVEL_LABELS[q.level]}</span>
                      <span>{q.points}đ</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quality Audit Box */}
            <div
              className={`p-3 rounded-lg border text-[13px] space-y-1 ${
                auditIssues.length === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="font-semibold flex items-center gap-1.5">
                {auditIssues.length === 0 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Kiểm tra cấu trúc đề đạt chuẩn</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Lưu ý rà soát đề ({auditIssues.length}):</span>
                  </>
                )}
              </div>
              {auditIssues.slice(0, 3).map((iss, i) => (
                <div key={i}>• {iss}</div>
              ))}
            </div>
          </aside>

          {/* Right: Inline Question Editor & Preview */}
          <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            {!selectedQuestion ? (
              <div className="p-10 text-center ui-body text-slate-500">
                Chọn một câu hỏi bên trái hoặc bấm "+ TN", "+ Đ/S", "+ TLN" để bắt đầu soạn câu hỏi mới.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedQuestion.type}
                      onChange={(e) => {
                        const nt = e.target.value as QuestionType;
                        const blank = createBlankQuestion(selectedQuestion.subject, selectedQuestion.grade, nt);
                        updateQuestion({
                          ...blank,
                          id: selectedQuestion.id,
                          stem: selectedQuestion.stem,
                          topic: selectedQuestion.topic,
                          level: selectedQuestion.level,
                        });
                      }}
                      className="min-h-[38px] px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg ui-input font-medium"
                    >
                      {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>

                    <select
                      value={selectedQuestion.level}
                      onChange={(e) => updateQuestion({ ...selectedQuestion, level: e.target.value as CognitiveLevel })}
                      className="min-h-[38px] px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg ui-input"
                    >
                      {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>

                    <label className="flex items-center gap-1 ui-caption text-slate-700">
                      <span>Điểm:</span>
                      <input
                        type="number"
                        step={0.25}
                        min={0}
                        max={10}
                        value={selectedQuestion.points}
                        onChange={(e) => updateQuestion({ ...selectedQuestion, points: Number(e.target.value) || 0 })}
                        className="w-16 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg ui-input text-center tabular-nums"
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQuestion({ ...selectedQuestion, lockOrder: !selectedQuestion.lockOrder })}
                      className={`inline-flex items-center gap-1 min-h-[36px] px-3 rounded-lg border ui-caption font-medium ${
                        selectedQuestion.lockOrder
                          ? 'bg-amber-50 border-amber-300 text-amber-800'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {selectedQuestion.lockOrder ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      <span>{selectedQuestion.lockOrder ? 'Đang cố định vị trí' : 'Cho phép trộn'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveQuestionToBank(selectedQuestion)}
                      className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 ui-caption font-semibold hover:bg-teal-100"
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>Lưu vào Ngân hàng</span>
                    </button>
                  </div>
                </div>

                {/* Metadata row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="ui-caption text-slate-600">Chủ đề / Chương</span>
                    <input
                      type="text"
                      value={selectedQuestion.topic}
                      onChange={(e) => updateQuestion({ ...selectedQuestion, topic: e.target.value })}
                      className="w-full mt-1 min-h-[38px] px-3 py-1.5 border border-slate-200 rounded-lg ui-input"
                    />
                  </label>
                  <label className="block">
                    <span className="ui-caption text-slate-600">Yêu cầu cần đạt (gắn đặc tả)</span>
                    <input
                      type="text"
                      value={selectedQuestion.requirement}
                      onChange={(e) => updateQuestion({ ...selectedQuestion, requirement: e.target.value })}
                      className="w-full mt-1 min-h-[38px] px-3 py-1.5 border border-slate-200 rounded-lg ui-input"
                    />
                  </label>
                </div>

                {/* Optional shared passage */}
                <div className="space-y-1">
                  <span className="ui-caption text-slate-600">
                    Ngữ liệu chung / Đoạn văn (tùy chọn — các câu cùng ngữ liệu giữ liền nhau khi trộn)
                  </span>
                  <ScientificRichTextEditor
                    value={selectedQuestion.passage || ''}
                    onChange={(html) => updateQuestion({ ...selectedQuestion, passage: html })}
                    variant="compact"
                    minHeightPx={46}
                    defaultEquationOpen={false}
                    placeholder="Để trống nếu là câu hỏi độc lập..."
                  />
                </div>

                {/* Question Stem (Unified WYSIWYG Rich Text & Visual MathLive Editor) */}
                <div className="space-y-1.5">
                  <span className="ui-caption font-semibold text-slate-800">
                    Nội dung câu hỏi
                  </span>
                  <ScientificRichTextEditor
                    value={selectedQuestion.stem}
                    onChange={(html) => updateQuestion({ ...selectedQuestion, stem: html })}
                    variant="full"
                    minHeightPx={124}
                    defaultEquationOpen={true}
                    placeholder="Nhập nội dung câu hỏi tiếng Việt / tiếng Anh hoặc chọn biểu tượng trên thanh công cụ để chèn công thức..."
                  />
                </div>

                {/* Type-specific Answer Inputs */}
                {selectedQuestion.type === 'trac_nghiem' && selectedQuestion.options && (
                  <div className="space-y-2">
                    <span className="ui-caption font-semibold text-slate-800">
                      4 phương án trả lời (chọn nút tròn để đánh dấu đáp án đúng)
                    </span>
                    <ScientificEditorGroupProvider>
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                        <ScientificToolbar
                          editor={null}
                          compact={true}
                          showFormattingBar={true}
                          defaultEquationOpen={true}
                        />
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {selectedQuestion.options.map((opt, oi) => {
                            const isRight = selectedQuestion.correctOptionId === opt.id;
                            return (
                              <div
                                key={opt.id}
                                className={`p-2.5 rounded-xl border flex items-start gap-2 transition-colors ${
                                  isRight
                                    ? 'bg-emerald-50/90 border-emerald-400'
                                    : 'bg-white border-slate-200'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`correct_${selectedQuestion.id}`}
                                  checked={isRight}
                                  onChange={() =>
                                    updateQuestion({ ...selectedQuestion, correctOptionId: opt.id })
                                  }
                                  title="Đánh dấu là đáp án đúng"
                                  className="mt-2.5 shrink-0"
                                />
                                <span className="font-bold text-slate-800 mt-1.5 shrink-0">
                                  {OPT_LETTERS[oi]}.
                                </span>
                                <ScientificRichTextEditor
                                  value={opt.text}
                                  onChange={(html) =>
                                    updateQuestion({
                                      ...selectedQuestion,
                                      options: selectedQuestion.options!.map((o) =>
                                        o.id === opt.id ? { ...o, text: html } : o
                                      ),
                                    })
                                  }
                                  variant="compact"
                                  useSharedToolbar={true}
                                  minHeightPx={44}
                                  placeholder={`Nhập phương án ${OPT_LETTERS[oi]}...`}
                                  className="flex-1 min-w-0"
                                />
                                <button
                                  type="button"
                                  title="Cố định vị trí đáp án này (VD: Cả A và B đều đúng)"
                                  onClick={() =>
                                    updateQuestion({
                                      ...selectedQuestion,
                                      options: selectedQuestion.options!.map((o) =>
                                        o.id === opt.id
                                          ? { ...o, isLockedPosition: !o.isLockedPosition }
                                          : o
                                      ),
                                    })
                                  }
                                  className={`p-1.5 mt-1 rounded shrink-0 ${
                                    opt.isLockedPosition
                                      ? 'text-amber-600 bg-amber-50'
                                      : 'text-slate-400 hover:text-slate-700'
                                  }`}
                                >
                                  {opt.isLockedPosition ? (
                                    <Lock className="w-3.5 h-3.5" />
                                  ) : (
                                    <Unlock className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </ScientificEditorGroupProvider>
                  </div>
                )}

                {selectedQuestion.type === 'dung_sai' && selectedQuestion.tfItems && (
                  <div className="space-y-2">
                    <span className="ui-caption font-semibold text-slate-800">
                      4 mệnh đề Đúng / Sai (a, b, c, d)
                    </span>
                    <ScientificEditorGroupProvider>
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                        <ScientificToolbar
                          editor={null}
                          compact={true}
                          showFormattingBar={true}
                          defaultEquationOpen={true}
                        />
                        <div className="p-3 space-y-2.5">
                          {selectedQuestion.tfItems.map((sub, si) => (
                            <div
                              key={sub.id}
                              className="flex items-start gap-2.5 p-2.5 bg-white border border-slate-200 rounded-xl"
                            >
                              <span className="font-bold w-6 mt-2 shrink-0">
                                {SUB_LETTERS[si]})
                              </span>
                              <ScientificRichTextEditor
                                value={sub.text}
                                onChange={(html) =>
                                  updateQuestion({
                                    ...selectedQuestion,
                                    tfItems: selectedQuestion.tfItems!.map((x) =>
                                      x.id === sub.id ? { ...x, text: html } : x
                                    ),
                                  })
                                }
                                variant="compact"
                                useSharedToolbar={true}
                                minHeightPx={42}
                                placeholder={`Nhập mệnh đề ${SUB_LETTERS[si]})...`}
                                className="flex-1 min-w-0"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuestion({
                                    ...selectedQuestion,
                                    tfItems: selectedQuestion.tfItems!.map((x) =>
                                      x.id === sub.id ? { ...x, isTrue: !x.isTrue } : x
                                    ),
                                  })
                                }
                                className={`min-w-[68px] py-1.5 mt-1 rounded-md font-semibold text-[13px] shrink-0 ${
                                  sub.isTrue ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                                }`}
                              >
                                {sub.isTrue ? 'Đúng' : 'Sai'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </ScientificEditorGroupProvider>
                  </div>
                )}

                {(selectedQuestion.type === 'tra_loi_ngan' || selectedQuestion.type === 'dien_khuyet') && (
                  <div className="space-y-1">
                    <span className="ui-caption font-semibold text-slate-800">
                      Đáp án chuẩn (số hoặc biểu thức ngắn gọn)
                    </span>
                    <ScientificRichTextEditor
                      value={selectedQuestion.shortAnswer || ''}
                      onChange={(html) => updateQuestion({ ...selectedQuestion, shortAnswer: html })}
                      variant="compact"
                      minHeightPx={46}
                      defaultEquationOpen={true}
                      placeholder="Nhập đáp án số hoặc công thức đáp án..."
                    />
                  </div>
                )}

                {selectedQuestion.type === 'ghep_noi' && selectedQuestion.matchingPairs && (
                  <div className="space-y-2">
                    <span className="ui-caption font-semibold text-slate-800">
                      Các cặp ghép nối (Cột A — Cột B)
                    </span>
                    <ScientificEditorGroupProvider>
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                        <ScientificToolbar
                          editor={null}
                          compact={true}
                          showFormattingBar={true}
                          defaultEquationOpen={false}
                        />
                        <div className="p-3 space-y-2">
                          {selectedQuestion.matchingPairs.map((pair, pi) => (
                            <div key={pair.id} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <ScientificRichTextEditor
                                value={pair.left}
                                onChange={(html) =>
                                  updateQuestion({
                                    ...selectedQuestion,
                                    matchingPairs: selectedQuestion.matchingPairs!.map((p) =>
                                      p.id === pair.id ? { ...p, left: html } : p
                                    ),
                                  })
                                }
                                variant="compact"
                                useSharedToolbar={true}
                                minHeightPx={40}
                                placeholder={`Vế trái ${pi + 1}...`}
                              />
                              <ScientificRichTextEditor
                                value={pair.right}
                                onChange={(html) =>
                                  updateQuestion({
                                    ...selectedQuestion,
                                    matchingPairs: selectedQuestion.matchingPairs!.map((p) =>
                                      p.id === pair.id ? { ...p, right: html } : p
                                    ),
                                  })
                                }
                                variant="compact"
                                useSharedToolbar={true}
                                minHeightPx={40}
                                placeholder={`Vế phải ${OPT_LETTERS[pi] || pi + 1}...`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </ScientificEditorGroupProvider>
                  </div>
                )}

                {/* Solution */}
                <div className="space-y-1.5">
                  <span className="ui-caption font-semibold text-slate-800">
                    Lời giải chi tiết / Hướng dẫn chấm
                  </span>
                  <ScientificRichTextEditor
                    value={selectedQuestion.solution || ''}
                    onChange={(html) => updateQuestion({ ...selectedQuestion, solution: html })}
                    variant="full"
                    minHeightPx={108}
                    defaultEquationOpen={true}
                    placeholder="Nhập từng bước lời giải chi tiết kèm công thức trực quan..."
                  />
                </div>

                {/* Live Formatted Preview */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="ui-caption font-semibold text-sky-700">Xem trước câu hỏi hiển thị:</div>
                  {hasRichContent(selectedQuestion.passage) && (
                    <div className="italic text-slate-700 border-l-2 border-sky-400 pl-3 font-word text-[16px]">
                      <RichMathText text={selectedQuestion.passage || ''} fontSize={16} />
                    </div>
                  )}
                  <div className="font-word text-[17px] text-slate-900">
                    <RichMathText text={selectedQuestion.stem} fontSize={17} />
                  </div>
                  {selectedQuestion.svgIllustration && (
                    <div
                      className="max-w-xs p-2 bg-white border border-slate-200 rounded-lg [&>svg]:max-w-full [&>svg]:h-auto"
                      dangerouslySetInnerHTML={{ __html: selectedQuestion.svgIllustration }}
                    />
                  )}
                  {selectedQuestion.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-word text-[16px] pt-1">
                      {selectedQuestion.options.map((o, i) => (
                        <div key={o.id} className={o.id === selectedQuestion.correctOptionId ? 'font-bold text-emerald-800' : ''}>
                          {OPT_LETTERS[i]}. <RichMathText text={o.text} fontSize={16} inline />
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedQuestion.tfItems && (
                    <div className="space-y-1 font-word text-[16px] pt-1">
                      {selectedQuestion.tfItems.map((sub, si) => (
                        <div key={sub.id}>
                          <span className="font-bold">{SUB_LETTERS[si]}) </span>
                          <RichMathText text={sub.text} fontSize={16} inline />{' '}
                          <span className={sub.isTrue ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                            [{sub.isTrue ? 'Đúng' : 'Sai'}]
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {hasRichContent(selectedQuestion.solution) && (
                    <div className="pt-2 border-t border-slate-200 font-word text-[16px] text-slate-800">
                      <span className="font-semibold text-sky-800">Lời giải: </span>
                      <RichMathText text={selectedQuestion.solution || ''} fontSize={16} />
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: QUESTION BANK */}
      {subTab === 'bank' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                placeholder="Tìm theo nội dung, chủ đề, yêu cầu cần đạt..."
                className="w-full min-h-[40px] pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg ui-input"
              />
            </div>

            <select
              value={bankSubject}
              onChange={(e) => setBankSubject(e.target.value as 'all' | ExtendedSubjectType)}
              className="min-h-[40px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg ui-input"
            >
              <option value="all">Tất cả môn học</option>
              {Object.entries(SUBJECT_NAMES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            <select
              value={bankType}
              onChange={(e) => setBankType(e.target.value as 'all' | QuestionType)}
              className="min-h-[40px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg ui-input"
            >
              <option value="all">Tất cả dạng câu</option>
              {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredBank.map((q) => (
              <div key={q.id} className="p-4 border border-slate-200 rounded-xl flex flex-col justify-between gap-3 hover:border-sky-300">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 ui-caption">
                    <span className="font-semibold text-sky-700">
                      {SUBJECT_NAMES[q.subject]} · Lớp {q.grade} · {q.topic}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                      {QUESTION_TYPE_LABELS[q.type]} · {LEVEL_LABELS[q.level]}
                    </span>
                  </div>
                  <div className="ui-body text-slate-900">
                    <RichMathText text={q.stem} fontSize={15} />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <span className="ui-caption text-slate-500">{q.sourceName}</span>
                  <button
                    type="button"
                    onClick={() => handleAddFromBank(q)}
                    className="inline-flex items-center gap-1 min-h-[36px] px-3 bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm vào đề</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: MATRIX & LINKED SPECIFICATION */}
      {subTab === 'matrix' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="ui-section-title text-slate-900">Ma trận đề & Bản đặc tả liên thông</h2>
              <p className="ui-caption text-slate-600">
                Tổng câu: <strong>{matrixTotals.totalQuestions}</strong> · Tổng điểm: <strong>{matrixTotals.totalPoints}</strong> ·
                Tỉ lệ NB/TH/VD: <strong>{matrixTotals.nbPct}% / {matrixTotals.thPct}% / {matrixTotals.vdPct}%</strong>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateActiveExam({
                    ...activeExam,
                    matrix: [
                      ...activeExam.matrix,
                      {
                        id: generateId('mtx'),
                        topic: 'Chủ đề mới',
                        knowledgeUnit: 'Đơn vị kiến thức',
                        requirement: 'Yêu cầu cần đạt',
                        questionType: 'trac_nghiem',
                        nbCount: 1,
                        thCount: 1,
                        vdCount: 0,
                        pointsPerItem: 0.25,
                      },
                    ],
                  })
                }
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 bg-white border border-slate-200 rounded-lg ui-btn font-medium hover:bg-slate-50"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm dòng ma trận</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const blob = await exportMatrixAndSpecToDocxBlob(activeExam.title, activeExam.matrix);
                  downloadBlob(blob, 'Ma_tran_va_Dac_ta.docx');
                  onNotify('Đã xuất Ma trận & Bản đặc tả ra tệp Word (.docx).', 'success');
                }}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 bg-white border border-slate-200 rounded-lg ui-btn font-medium hover:bg-slate-50"
              >
                <Download className="w-4 h-4 text-sky-600" />
                <span>Xuất Ma trận & Đặc tả (.docx)</span>
              </button>
              <button
                type="button"
                onClick={handleGenerateFromMatrix}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-4 bg-teal-600 text-white rounded-lg ui-btn font-semibold hover:bg-teal-700"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Tạo đề từ Ma trận & Ngân hàng</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-[14px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                <tr>
                  <th className="p-2.5">Chủ đề</th>
                  <th className="p-2.5">Yêu cầu cần đạt (Đặc tả)</th>
                  <th className="p-2.5">Dạng câu</th>
                  <th className="p-2.5 w-16 text-center">NB</th>
                  <th className="p-2.5 w-16 text-center">TH</th>
                  <th className="p-2.5 w-16 text-center">VD</th>
                  <th className="p-2.5 w-20 text-center">Điểm/câu</th>
                  <th className="p-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeExam.matrix.map((row) => {
                  const upd = (patch: Partial<ExamMatrixRow>) =>
                    onUpdateActiveExam({
                      ...activeExam,
                      matrix: activeExam.matrix.map((m) => (m.id === row.id ? { ...m, ...patch } : m)),
                    });
                  return (
                    <tr key={row.id}>
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.topic}
                          onChange={(e) => upd({ topic: e.target.value })}
                          className="w-full px-2 py-1 border border-slate-200 rounded"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.requirement}
                          onChange={(e) => upd({ requirement: e.target.value })}
                          className="w-full px-2 py-1 border border-slate-200 rounded"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={row.questionType}
                          onChange={(e) => upd({ questionType: e.target.value as QuestionType })}
                          className="w-full px-2 py-1 border border-slate-200 rounded bg-white"
                        >
                          {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          value={row.nbCount}
                          onChange={(e) => upd({ nbCount: Math.max(0, Number(e.target.value)) })}
                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-center tabular-nums"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          value={row.thCount}
                          onChange={(e) => upd({ thCount: Math.max(0, Number(e.target.value)) })}
                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-center tabular-nums"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          value={row.vdCount}
                          onChange={(e) => upd({ vdCount: Math.max(0, Number(e.target.value)) })}
                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-center tabular-nums"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step={0.25}
                          min={0}
                          value={row.pointsPerItem}
                          onChange={(e) => upd({ pointsPerItem: Number(e.target.value) || 0 })}
                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-center tabular-nums"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateActiveExam({
                              ...activeExam,
                              matrix: activeExam.matrix.filter((m) => m.id !== row.id),
                            })
                          }
                          className="p-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: REVERSE PARSE FROM DOCX */}
      {subTab === 'import_docx' && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4">
          <FileUp className="w-10 h-10 text-sky-600 mx-auto" />
          <h2 className="ui-section-title text-slate-900">Nạp câu hỏi ngược từ tệp Word (.docx)</h2>
          <p className="ui-body text-slate-600 max-w-2xl mx-auto">
            Hệ thống đọc cấu trúc OOXML các đoạn bắt đầu bằng <strong>Câu 1:</strong>, <strong>Câu 2:</strong> và tự động tách phương án <strong>A. B. C. D.</strong>, đáp án cùng lời giải để chỉnh sửa lại, trình chiếu hoặc trộn đề.
          </p>
          <input
            ref={docxInputRef}
            type="file"
            accept=".docx"
            onChange={handleImportDocxQuestions}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => docxInputRef.current?.click()}
            className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2.5 bg-sky-600 text-white rounded-xl ui-btn font-semibold hover:bg-sky-700"
          >
            <FileUp className="w-4 h-4" />
            <span>Chọn tệp Word (.docx) từ máy tính</span>
          </button>
        </div>
      )}

      {/* Fullscreen Exam Presenter */}
      {presenterOpen && <ExamPresenterModal exam={activeExam} onClose={() => setPresenterOpen(false)} />}
    </div>
    {printOpen && <ExamPrintModal exam={activeExam} onClose={() => setPrintOpen(false)} />}
    </>
  );
};
