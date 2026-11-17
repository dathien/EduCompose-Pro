import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  FileUp,
  Printer,
  Shuffle,
  Table2,
} from 'lucide-react';
import { ExamPaper, ExamQuestion, ShuffleConfig, ShuffledVariant } from '../../types';
import {
  QUESTION_TYPE_LABELS,
  exportExamPaperToDocxBlob,
  exportShuffledVariantsZip,
  generateShuffledVariants,
} from '../../core/exam/examEngine';
import { extractDocxExamOutline, loadDocxSessionFromFile } from '../../core/docx/ooxmlProcessor';
import { RichMathText } from '../../components/RichMathText';
import { ExamPrintModal } from './ExamPrintModal';
import { downloadBlob, generateId } from '../../utils/vietnamese';

interface ExamShufflerPageProps {
  sourceExam: ExamPaper;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'warning') => void;
}

const OPT_LETTERS = ['A', 'B', 'C', 'D'];
const SUB_LETTERS = ['a', 'b', 'c', 'd'];

export const ExamShufflerPage: React.FC<ExamShufflerPageProps> = ({ sourceExam, onNotify }) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [workingExam, setWorkingExam] = useState<ExamPaper>(sourceExam);
  const [config, setConfig] = useState<ShuffleConfig>({
    numCodes: 4,
    startCode: 101,
    shuffleQuestionsWithinPart: true,
    shuffleMcqOptions: true,
    shuffleTfSubItems: true,
    keepPassageGroupsTogether: true,
  });
  const [variants, setVariants] = useState<ShuffledVariant[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const handleRunShuffle = () => {
    const res = generateShuffledVariants(workingExam.questions, config);
    setVariants(res.variants);
    setWarnings(res.warnings);
    setSelectedCode(res.variants[0]?.code || '');
    if (res.variants.length > 0) {
      onNotify(`Đã trộn thành công ${res.variants.length} mã đề với bảng đáp án ánh xạ chính xác.`, 'success');
    } else {
      onNotify('Đề gốc chưa có câu hỏi để trộn.', 'warning');
    }
  };

  const handleImportDocxSource = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const session = await loadDocxSessionFromFile(file);
      const outline = extractDocxExamOutline(session);
      if (outline.questions.length === 0) {
        onNotify('Không nhận diện được các đoạn "Câu 1:", "Câu 2:" trong tệp Word này.', 'warning');
        return;
      }
      const qs: ExamQuestion[] = outline.questions.map((oq) => {
        const isMcq = oq.options.length >= 2;
        const opts = isMcq
          ? oq.options.slice(0, 4).map((t) => ({ id: generateId('opt'), text: t.replace(/^[A-D]\.\s*/i, '').trim() }))
          : undefined;
        let correctId = opts?.[0]?.id;
        if (opts && oq.answerLine) {
          const idx = OPT_LETTERS.indexOf(oq.answerLine.toUpperCase());
          if (idx >= 0 && opts[idx]) correctId = opts[idx].id;
        }
        return {
          id: generateId('q'),
          subject: 'chung',
          grade: 'chung',
          topic: 'Trộn từ Word',
          lesson: outline.title,
          requirement: '',
          level: 'thong_hieu',
          type: isMcq ? 'trac_nghiem' : 'tu_luan',
          points: 0.25,
          sourceName: file.name,
          verified: false,
          stem: oq.stem,
          options: opts,
          correctOptionId: correctId,
          solution: oq.solutionLines.join('\n'),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      });
      setWorkingExam({
        ...workingExam,
        title: outline.title || file.name.replace(/\.docx$/i, ''),
        questions: qs,
        questionIds: qs.map((q) => q.id),
      });
      setVariants([]);
      onNotify(`Đã nạp ${qs.length} câu hỏi từ "${file.name}" sẵn sàng trộn đề.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể đọc tệp Word.', 'warning');
    } finally {
      e.target.value = '';
    }
  };

  const activeVariant = useMemo(
    () => variants.find((v) => v.code === selectedCode) || variants[0] || null,
    [variants, selectedCode]
  );

  const handleDownloadAllZip = async () => {
    if (variants.length === 0) return;
    setIsExporting(true);
    try {
      const zipBlob = await exportShuffledVariantsZip(workingExam.title, workingExam.durationMinutes, variants);
      downloadBlob(zipBlob, `Bo_De_Tron_${variants.length}_Ma.zip`);
      onNotify(`Đã xuất trọn bộ ${variants.length} mã đề + Lời giải + Bảng đáp án tổng hợp (.zip).`, 'success');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
    <div className="space-y-5 no-print">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Shuffle className="w-6 h-6 text-sky-600 shrink-0" />
            <h1 className="ui-page-title text-slate-900">Trộn đề kiểm tra</h1>
          </div>
          <p className="ui-body text-slate-600">
            Chọn đề gốc, kiểm tra nội dung, thiết lập số mã đề và xuất đề kèm đáp án.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".docx" onChange={handleImportDocxSource} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-white border border-slate-300 text-slate-800 ui-btn font-medium rounded-lg hover:bg-slate-50"
          >
            <FileUp className="w-4 h-4 text-sky-600" />
            <span>Chọn đề Word</span>
          </button>
          <button
            type="button"
            onClick={() => setWorkingExam(sourceExam)}
            className="min-h-[40px] px-3.5 py-2 bg-slate-100 text-slate-700 ui-btn font-medium rounded-lg hover:bg-slate-200"
          >
            Lấy đề đang soạn ({sourceExam.questions.length} câu)
          </button>
          <button
            type="button"
            onClick={handleRunShuffle}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 bg-sky-600 text-white ui-btn font-semibold rounded-lg hover:bg-sky-700"
          >
            <Shuffle className="w-4 h-4" />
            <span>Thực hiện trộn đề</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2" aria-label="Quy trình trộn đề">{["1. Chọn đề gốc", "2. Kiểm tra nội dung", "3. Thiết lập và trộn", "4. Xem và xuất đề"].map(label => <div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-3 ui-guide font-medium text-slate-700">{label}</div>)}</div>
      {/* Config Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        <div className="lg:col-span-5 space-y-1">
          <div className="ui-group-title text-slate-900">Đề nguồn: {workingExam.title}</div>
          <div className="ui-caption text-slate-600">
            Tổng <strong>{workingExam.questions.length}</strong> câu hỏi · Cố định vị trí:{' '}
            <strong>{workingExam.questions.filter((q) => q.lockOrder).length}</strong> câu
          </div>
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="ui-caption text-slate-600">Số mã đề tạo</span>
            <input
              type="number"
              min={1}
              max={24}
              value={config.numCodes}
              onChange={(e) => setConfig((c) => ({ ...c, numCodes: Math.max(1, Math.min(24, Number(e.target.value))) }))}
              className="w-full mt-1 min-h-[38px] px-2.5 py-1 border border-slate-200 rounded-lg ui-input tabular-nums"
            />
          </label>
          <label className="block">
            <span className="ui-caption text-slate-600">Mã đề bắt đầu</span>
            <input
              type="number"
              min={1}
              max={999}
              value={config.startCode}
              onChange={(e) => setConfig((c) => ({ ...c, startCode: Number(e.target.value) || 101 }))}
              className="w-full mt-1 min-h-[38px] px-2.5 py-1 border border-slate-200 rounded-lg ui-input tabular-nums"
            />
          </label>
          <div className="space-y-1.5 pt-1 text-[13px]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.shuffleQuestionsWithinPart}
                onChange={(e) => setConfig((c) => ({ ...c, shuffleQuestionsWithinPart: e.target.checked }))}
              />
              <span>Trộn thứ tự câu trong từng phần</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.shuffleMcqOptions}
                onChange={(e) => setConfig((c) => ({ ...c, shuffleMcqOptions: e.target.checked }))}
              />
              <span>Trộn phương án A, B, C, D</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.shuffleTfSubItems}
                onChange={(e) => setConfig((c) => ({ ...c, shuffleTfSubItems: e.target.checked }))}
              />
              <span>Trộn ý a, b, c, d (Đúng/Sai)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Warnings if duplicate unavoidable */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 ui-guide">
          {warnings.map((w, i) => (
            <div key={i}>• {w}</div>
          ))}
        </div>
      )}

      {/* Results View */}
      {variants.length > 0 && (
        <div className="space-y-5">
          {/* Answer Key Matrix Table across all codes */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="ui-section-title text-slate-900 flex items-center gap-2">
                <Table2 className="w-5 h-5 text-teal-600" />
                <span>Bảng đáp án tổng hợp ({variants.length} mã đề)</span>
              </h2>
              <button
                type="button"
                disabled={isExporting}
                onClick={handleDownloadAllZip}
                className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 bg-teal-600 text-white ui-btn font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-60"
              >
                <Archive className="w-4 h-4" />
                <span>Tải trọn bộ {variants.length} mã đề + Đáp án (.ZIP)</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-[14px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Câu</th>
                    {variants.map((v) => (
                      <th key={v.code} className="p-2.5 text-center font-bold text-sky-700">
                        Mã {v.code}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: workingExam.questions.length }, (_, i) => i + 1).map((qNum) => (
                    <tr key={qNum}>
                      <td className="p-2 font-semibold text-slate-800">Câu {qNum}</td>
                      {variants.map((v) => (
                        <td key={v.code} className="p-2 text-center font-medium text-slate-900">
                          <RichMathText
                            text={v.answerKeyByQuestionNum[qNum] || '—'}
                            fontSize={14}
                            inline
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Individual Variant Preview + Permutation Audit */}
          {activeVariant && (
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {variants.map((v) => (
                    <button
                      key={v.code}
                      type="button"
                      onClick={() => setSelectedCode(v.code)}
                      className={`px-3.5 py-1.5 min-h-[38px] rounded-lg ui-btn font-semibold transition-colors ${
                        activeVariant.code === v.code
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Mã đề {v.code}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintOpen(true)}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 bg-white border border-slate-300 text-slate-800 rounded-lg ui-btn font-medium hover:bg-slate-50"
                  >
                    <Printer className="w-4 h-4 text-sky-600" />
                    <span>In / Lưu PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ommlWarns: string[] = [];
                      const blob = await exportExamPaperToDocxBlob(workingExam.title, activeVariant.questions, {
                        code: activeVariant.code,
                        durationMinutes: workingExam.durationMinutes,
                        onWarnings: (w) => ommlWarns.push(...w),
                      });
                      downloadBlob(blob, `De_thi_Ma_${activeVariant.code}.docx`);
                      if (ommlWarns.length > 0) {
                        onNotify(`Đã xuất Mã đề ${activeVariant.code}. Lưu ý: ${ommlWarns.length} biểu thức đã chuyển sang dạng văn bản dự phòng.`, 'warning');
                      } else {
                        onNotify(`Đã xuất Mã đề ${activeVariant.code} (Bản học sinh).`, 'success');
                      }
                    }}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700"
                  >
                    <Download className="w-4 h-4" />
                    <span>Xuất Mã {activeVariant.code} (.docx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ommlWarns: string[] = [];
                      const blob = await exportExamPaperToDocxBlob(
                        `${workingExam.title} (Đáp án & Lời giải)`,
                        activeVariant.questions,
                        {
                          code: activeVariant.code,
                          durationMinutes: workingExam.durationMinutes,
                          includeAnswers: true,
                          includeSolutions: true,
                          onWarnings: (w) => ommlWarns.push(...w),
                        }
                      );
                      downloadBlob(blob, `Loi_giai_Ma_${activeVariant.code}.docx`);
                      if (ommlWarns.length > 0) {
                        onNotify(`Đã xuất Mã đề ${activeVariant.code} kèm lời giải (${ommlWarns.length} biểu thức dùng văn bản dự phòng).`, 'warning');
                      } else {
                        onNotify(`Đã xuất Mã đề ${activeVariant.code} kèm lời giải.`, 'success');
                      }
                    }}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 bg-white border border-slate-200 text-slate-800 rounded-lg ui-btn font-medium hover:bg-slate-50"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Xuất kèm Lời giải</span>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {activeVariant.questions.map((q, idx) => {
                  const perm = activeVariant.permutationDetails[idx];
                  return (
                    <div key={`${activeVariant.code}_${q.id}`} className="p-4 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-slate-500">
                        <span className="font-bold text-slate-900 text-[15px]">
                          Câu {idx + 1} (Gốc: Câu {perm?.originalNum} · {QUESTION_TYPE_LABELS[q.type]})
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded font-semibold">
                          Đáp án đúng:{' '}
                          <RichMathText text={perm?.answerInVariant || '—'} fontSize={13} inline />
                          {perm?.optionMap ? ` · Thứ tự gốc: ${perm.optionMap}` : ''}
                        </span>
                      </div>

                      <div className="ui-body text-slate-900">
                        <RichMathText text={q.stem} fontSize={16} />
                      </div>

                      {q.type === 'trac_nghiem' && q.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[15px]">
                          {q.options.map((o, oi) => (
                            <div
                              key={o.id}
                              className={o.id === q.correctOptionId ? 'font-semibold text-emerald-700' : 'text-slate-700'}
                            >
                              {OPT_LETTERS[oi]}. <RichMathText text={o.text} fontSize={15} />
                            </div>
                          ))}
                        </div>
                      )}

                      {q.type === 'dung_sai' && q.tfItems && (
                        <div className="space-y-1 text-[14px]">
                          {q.tfItems.map((sub, si) => (
                            <div key={sub.id} className="text-slate-700">
                              <span className="font-semibold">{SUB_LETTERS[si]})</span>{' '}
                              <RichMathText text={sub.text} fontSize={14} />{' '}
                              <span className={sub.isTrue ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                                [{sub.isTrue ? 'Đúng' : 'Sai'}]
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
    {printOpen && activeVariant && (
      <ExamPrintModal
        exam={{ ...workingExam, questions: activeVariant.questions }}
        code={activeVariant.code}
        onClose={() => setPrintOpen(false)}
      />
    )}
    </>
  );
};
