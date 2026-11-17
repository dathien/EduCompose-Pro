import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileUp,
  ListOrdered,
  Replace,
  Scissors,
  Sparkles,
  Undo2,
  Wand2,
} from 'lucide-react';
import { WordDocumentRecord } from '../../types';
import {
  LoadedDocxSession,
  applyBeautifyQuestionsAndWhitespace,
  applyControlledReplaceInXml,
  applyConvertAutoNumberToText,
  applyNormalizeTimesNewRoman13A4,
  applyStripSolutionsForStudentEdition,
  exportSessionToDocxBlob,
  inspectSessionDom,
  loadDocxSessionFromFile,
} from '../../core/docx/ooxmlProcessor';
import { exportDocumentBlocksToDocxBlob, tryLatexToOmml } from '../../core/docx/docxEngine';
import { SAMPLE_WORD_TEMPLATES } from '../../data/samples/sampleWordDocs';
import { downloadBlob } from '../../utils/vietnamese';

interface BeautifyDocxPageProps {
  activeDocument: WordDocumentRecord;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'warning') => void;
}

export const BeautifyDocxPage: React.FC<BeautifyDocxPageProps> = ({
  activeDocument,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [session, setSession] = useState<LoadedDocxSession | null>(null);
  const [lineSpacing240, setLineSpacing240] = useState<number>(276); // 1.15x
  const [boldQuestionHeader, setBoldQuestionHeader] = useState(true);
  const [cleanDoubleSpaces, setCleanDoubleSpaces] = useState(true);
  const [removeBlankDuplicates, setRemoveBlankDuplicates] = useState(true);
  const [renumberStart, setRenumberStart] = useState<string>('');
  const [resetPerPart, setResetPerPart] = useState(true);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');

  const inspection = useMemo(() => {
    if (!session) return null;
    try {
      return inspectSessionDom(session);
    } catch {
      return null;
    }
  }, [session]);

  const handleLoadFromFile = async (file: File) => {
    try {
      const loaded = await loadDocxSessionFromFile(file);
      setSession(loaded);
      onNotify(`Đã mở tệp Word "${file.name}" trực tiếp trong bộ xử lí OOXML.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể đọc tệp Word (.docx).', 'warning');
    }
  };

  const handleLoadFromRecord = async (docRecord: WordDocumentRecord) => {
    const blob = await exportDocumentBlocksToDocxBlob(docRecord.name, docRecord.blocks, tryLatexToOmml);
    const file = new File([blob], `${docRecord.name.replace(/\s+/g, '_')}.docx`, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await handleLoadFromFile(file);
  };

  const handleUndo = () => {
    if (!session || session.undoStack.length === 0) return;
    const prevXml = session.undoStack[session.undoStack.length - 1];
    setSession({
      ...session,
      documentXml: prevXml,
      undoStack: session.undoStack.slice(0, -1),
    });
    onNotify('Đã hoàn tác thao tác xử lí XML gần nhất.', 'info');
  };

  const handleNormalizeAll = () => {
    if (!session) return;
    const r1 = applyNormalizeTimesNewRoman13A4(session, { lineSpacing240 });
    const r2 = applyBeautifyQuestionsAndWhitespace(r1.session, {
      boldQuestionHeader,
      cleanDoubleSpaces,
      removeBlankDuplicates,
      renumberStart: renumberStart.trim() ? Number(renumberStart) : null,
      resetPerPart,
    });
    setSession(r2.session);
    onNotify(
      `Đã chuẩn hóa ${r1.modifiedRuns} đoạn chữ về Times New Roman 13pt A4, làm đẹp ${r2.updatedQuestions} câu hỏi và xóa ${r2.removedEmpty} dòng trống thừa (giữ nguyên toàn bộ OMML & Hình ảnh).`,
      'success'
    );
  };

  const handleConvertAutoNum = () => {
    if (!session) return;
    const res = applyConvertAutoNumberToText(session);
    setSession(res.session);
    onNotify(
      res.convertedCount > 0
        ? `Đã chuyển ${res.convertedCount} đoạn đánh số tự động (Auto-Number) sang văn bản tĩnh an toàn.`
        : 'Tài liệu không chứa danh sách đánh số tự động (w:numPr).',
      res.convertedCount > 0 ? 'success' : 'info'
    );
  };

  const handleStripSolutions = () => {
    if (!session) return;
    const res = applyStripSolutionsForStudentEdition(session);
    setSession(res.session);
    onNotify(
      res.removedCount > 0
        ? `Đã tách bỏ ${res.removedCount} đoạn lời giải / hướng dẫn chấm để xuất Bản Học sinh.`
        : 'Không tìm thấy đoạn bắt đầu bằng "Lời giải:" hoặc "Hướng dẫn giải:".',
      res.removedCount > 0 ? 'success' : 'info'
    );
  };

  const handleFindReplace = () => {
    if (!session || !findText) return;
    const res = applyControlledReplaceInXml(session, findText, replaceText);
    setSession(res.session);
    onNotify(
      res.replacements > 0
        ? `Đã thay thế ${res.replacements} vị trí "${findText}" thành "${replaceText}" an toàn trong <w:t>.`
        : `Không tìm thấy chuỗi "${findText}" trong văn bản thuần.`,
      res.replacements > 0 ? 'success' : 'info'
    );
  };

  const handleExportNewDocx = async () => {
    if (!session) return;
    const blob = await exportSessionToDocxBlob(session);
    const outName = session.fileName.replace(/\.docx$/i, '') + '_LamDep.docx';
    downloadBlob(blob, outName);
    onNotify(`Đã xuất tệp mới "${outName}" (giữ nguyên công thức OMML, bảng, ảnh và header/footer).`, 'success');
  };

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-sky-600 shrink-0" />
            <h1 className="ui-page-title text-slate-900">Làm đẹp & Chuẩn hóa Đề thi Word (.docx)</h1>
          </div>
          <p className="ui-body text-slate-600">
            Chọn đề Word, chỉnh định dạng, xem lại nội dung và tải bản mới. Tài liệu gốc không bị ghi đè.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleLoadFromFile(f);
              e.target.value = '';
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 bg-sky-600 text-white ui-btn font-semibold rounded-lg hover:bg-sky-700"
          >
            <FileUp className="w-4 h-4" />
            <span>Chọn tệp .docx từ máy</span>
          </button>

          {session && (
            <>
              <button
                type="button"
                disabled={session.undoStack.length === 0}
                onClick={handleUndo}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-white border border-slate-300 text-slate-800 ui-btn font-medium rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >
                <Undo2 className="w-4 h-4" />
                <span>Hoàn tác</span>
              </button>
              <button
                type="button"
                onClick={handleExportNewDocx}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 bg-teal-600 text-white ui-btn font-semibold rounded-lg hover:bg-teal-700"
              >
                <Download className="w-4 h-4" />
                <span>Xuất file .docx mới</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Empty State with Instant Pickers */}
      {!session && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="ui-section-title text-slate-900">Mở tài liệu Word để bắt đầu làm đẹp</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-5 border-2 border-dashed border-sky-300 bg-sky-50/50 rounded-xl text-left hover:border-sky-500 transition-colors space-y-2"
            >
              <FileUp className="w-7 h-7 text-sky-600" />
              <div className="ui-group-title text-slate-900">Tải file .docx bất kì từ máy tính</div>
              <p className="ui-caption text-slate-600">
                Chọn một tài liệu Word trên máy tính để chỉnh sửa.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleLoadFromRecord(activeDocument.blocks.length > 0 ? activeDocument : SAMPLE_WORD_TEMPLATES[6])}
              className="p-5 border border-slate-200 bg-white rounded-xl text-left hover:border-sky-400 transition-colors space-y-2"
            >
              <FileCheck2 className="w-7 h-7 text-teal-600" />
              <div className="ui-group-title text-slate-900">
                {activeDocument.blocks.length > 0 ? `Nạp "${activeDocument.name}"` : 'Thử với Đề kiểm tra mẫu 2025'}
              </div>
              <p className="ui-caption text-slate-600">
                Khởi tạo phiên .docx thật từ học liệu đang mở để kiểm thử trực tiếp các bước chuẩn hóa.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleLoadFromRecord(SAMPLE_WORD_TEMPLATES[5])}
              className="p-5 border border-slate-200 bg-white rounded-xl text-left hover:border-sky-400 transition-colors space-y-2"
            >
              <Wand2 className="w-7 h-7 text-sky-600" />
              <div className="ui-group-title text-slate-900">Thử với Đề 15 phút có OMML</div>
              <p className="ui-caption text-slate-600">
                Thực hành định dạng và đánh số câu hỏi có công thức Toán.
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Active Session Workbench */}
      {session && inspection && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Left Controls */}
          <aside className="xl:col-span-5 space-y-4">
            {/* Diagnostics */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="ui-group-title text-slate-900">Kiểm tra nội dung tài liệu</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[18px] font-bold text-slate-900 tabular-nums">{inspection.paragraphCount}</div>
                  <div className="ui-caption text-slate-500">Đoạn văn</div>
                </div>
                <div className="p-2.5 bg-sky-50 rounded-lg border border-sky-100">
                  <div className="text-[18px] font-bold text-sky-700 tabular-nums">{inspection.ommlCount}</div>
                  <div className="ui-caption text-sky-800">Công thức</div>
                </div>
                <div className="p-2.5 bg-teal-50 rounded-lg border border-teal-100">
                  <div className="text-[18px] font-bold text-teal-700 tabular-nums">{inspection.imageCount}</div>
                  <div className="ui-caption text-teal-800">Hình ảnh</div>
                </div>
              </div>
              <div className="ui-caption text-slate-600 flex flex-wrap gap-3 pt-1">
                <span>Bảng biểu: <strong>{inspection.tableCount}</strong></span>
                <span>Đầu trang / chân trang: <strong>{inspection.headerCount}/{inspection.footerCount}</strong></span>
                <span>Đánh số tự động: <strong className={inspection.autoNumberCount > 0 ? 'text-amber-700' : ''}>{inspection.autoNumberCount}</strong></span>
              </div>

              {inspection.issues.length > 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg ui-caption text-amber-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Phát hiện cần xử lí:</span>
                  </div>
                  {inspection.issues.map((iss, i) => (
                    <div key={i}>• {iss}</div>
                  ))}
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg ui-caption text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Không phát hiện lỗi trùng/thiếu số câu hoặc Auto-Number nguy hiểm.</span>
                </div>
              )}
            </div>

            {/* Formatting Controls */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="ui-group-title text-slate-900">1. Chuẩn hóa Phông chữ, Khổ giấy & Câu hỏi</div>

              <label className="block">
                <span className="ui-caption text-slate-600">Giãn dòng văn bản Word</span>
                <select
                  value={lineSpacing240}
                  onChange={(e) => setLineSpacing240(Number(e.target.value))}
                  className="w-full mt-1 min-h-[38px] px-2.5 py-1 border border-slate-200 rounded-lg bg-slate-50 ui-input"
                >
                  <option value={240}>1.0 (Khít)</option>
                  <option value={276}>1.15 (Khuyên dùng cho đề thi)</option>
                  <option value={312}>1.3 (Thoáng mắt)</option>
                  <option value={360}>1.5 (Rộng)</option>
                </select>
              </label>

              <div className="space-y-2 text-[14px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={boldQuestionHeader} onChange={(e) => setBoldQuestionHeader(e.target.checked)} />
                  <span>In đậm tự động cụm "Câu X:"</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={cleanDoubleSpaces} onChange={(e) => setCleanDoubleSpaces(e.target.checked)} />
                  <span>Xóa khoảng trắng thừa kép & khoảng trắng trước dấu câu</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={removeBlankDuplicates} onChange={(e) => setRemoveBlankDuplicates(e.target.checked)} />
                  <span>Gộp các dòng trống thừa liên tiếp</span>
                </label>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-slate-700">Đánh lại số câu từ:</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="Giữ nguyên"
                    value={renumberStart}
                    onChange={(e) => setRenumberStart(e.target.value)}
                    className="w-28 min-h-[34px] px-2 py-1 border border-slate-200 rounded-lg ui-input"
                  />
                  <label className="flex items-center gap-1.5 text-[13px] text-slate-600">
                    <input type="checkbox" checked={resetPerPart} onChange={(e) => setResetPerPart(e.target.checked)} />
                    <span>Đặt lại từ 1 qua mỗi PHẦN</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={handleNormalizeAll}
                className="w-full min-h-[42px] px-4 py-2 bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700 flex items-center justify-center gap-2"
              >
                <Wand2 className="w-4 h-4" />
                <span>Chuẩn hóa Times New Roman 13pt – A4 & Làm đẹp</span>
              </button>
            </div>

            {/* Special XML Actions */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="ui-group-title text-slate-900">2. Công cụ chuyên sâu Đề thi Word</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleConvertAutoNum}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg ui-btn font-medium text-slate-800 hover:bg-slate-100"
                >
                  <ListOrdered className="w-4 h-4 text-sky-600" />
                  <span>Khử Auto-Number</span>
                </button>
                <button
                  type="button"
                  onClick={handleStripSolutions}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg ui-btn font-medium text-slate-800 hover:bg-slate-100"
                >
                  <Scissors className="w-4 h-4 text-rose-600" />
                  <span>Tách bỏ Lời giải (Bản HS)</span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="ui-caption font-medium text-slate-700">Tìm & Thay thế an toàn (chỉ sửa nội dung chữ, không hỏng XML/OMML)</div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="Tìm chuỗi..."
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    className="flex-1 min-w-[110px] min-h-[38px] px-2.5 py-1 border border-slate-200 rounded-lg ui-input"
                  />
                  <input
                    type="text"
                    placeholder="Thay bằng..."
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    className="flex-1 min-w-[110px] min-h-[38px] px-2.5 py-1 border border-slate-200 rounded-lg ui-input"
                  />
                  <button
                    type="button"
                    onClick={handleFindReplace}
                    className="inline-flex items-center gap-1 min-h-[38px] px-3 bg-teal-600 text-white rounded-lg ui-btn font-medium hover:bg-teal-700"
                  >
                    <Replace className="w-4 h-4" />
                    <span>Thay</span>
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Right Live Paragraph & Structure Preview */}
          <section className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h2 className="ui-section-title text-slate-900">Xem trước nội dung DOM: {inspection.fileName}</h2>
                <p className="ui-caption text-slate-500">
                  Mọi công thức OMML và hình ảnh nhúng gốc được bảo toàn nguyên vẹn trong ZIP.
                </p>
              </div>
            </div>

            <div className="max-h-[640px] overflow-y-auto panel-scroll space-y-2 pr-1">
              {inspection.previewParagraphs.map((p) => (
                <div
                  key={p.index}
                  className={`p-3 rounded-lg border text-[15px] font-word leading-relaxed ${
                    p.isQuestion ? 'bg-sky-50/40 border-sky-200' : 'bg-slate-50/60 border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5 mb-1 font-sans text-[12px]">
                    <span className="text-slate-400 tabular-nums">#{p.index + 1}</span>
                    {p.isQuestion && <span className="px-1.5 py-0.5 bg-sky-100 text-sky-800 rounded font-semibold">Câu hỏi</span>}
                    {p.hasOmml && <span className="px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded font-semibold">Chứa OMML</span>}
                    {p.hasImage && <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded font-semibold">Chứa Hình</span>}
                    {p.hasAutoNum && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold">Auto-Number</span>}
                  </div>
                  <div className="text-slate-900 break-words">{p.text}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
