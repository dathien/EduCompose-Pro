import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ClipboardCheck,
  Copy,
  Download,
  Edit3,
  FileCheck2,
  FileText,
  FolderOpen,
  Search,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  DrawingProject,
  ExamPaper,
  ExamQuestion,
  FormulaItem,
  OmrTemplateConfig,
  WordDocumentRecord,
} from '../../types';
import {
  deleteDrawingProject,
  deleteExamPaper,
  deleteOmrConfig,
  deletePersonalFormula,
  deleteQuestionBankItem,
  deleteWordDocument,
  exportAllDataBackup,
  importDataBackup,
  listDrawingProjects,
  listExams,
  listFavoriteFormulaIds,
  listOmrConfigs,
  listPersonalFormulas,
  listQuestionBank,
  listWordDocuments,
  saveDrawingProject,
  savePersonalFormula,
} from '../../storage/indexedDb';
import { BUILTIN_FORMULAS } from '../../data/formulas';
import { KatexRenderer } from '../../components/KatexRenderer';
import { RichMathText } from '../../components/RichMathText';
import {
  downloadText,
  formatRelativeTimeVi,
  generateId,
  matchesVietnameseQuery,
} from '../../utils/vietnamese';

interface ProjectsPageProps {
  onOpenFormula: (formula: FormulaItem) => void;
  onOpenDrawing: (project: DrawingProject) => void;
  onOpenWordDocument: (doc: WordDocumentRecord) => void;
  onOpenExam: (exam: ExamPaper) => void;
  onOpenOmrTab: () => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'warning') => void;
}

type ProjectSectionTab = 'drawings' | 'formulas' | 'documents' | 'omr' | 'exams';

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  onOpenFormula,
  onOpenDrawing,
  onOpenWordDocument,
  onOpenExam,
  onOpenOmrTab,
  onNotify,
}) => {
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectSectionTab>('drawings');
  const [search, setSearch] = useState('');

  const [drawings, setDrawings] = useState<DrawingProject[]>([]);
  const [personalFormulas, setPersonalFormulas] = useState<FormulaItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [documents, setDocuments] = useState<WordDocumentRecord[]>([]);
  const [omrConfigs, setOmrConfigs] = useState<OmrTemplateConfig[]>([]);
  const [exams, setExams] = useState<ExamPaper[]>([]);
  const [questionBank, setQuestionBank] = useState<ExamQuestion[]>([]);

  // Inline rename / delete confirmation states (no window.confirm)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reloadAll = useCallback(async () => {
    const [drw, per, fav, docs, omr, exs, qb] = await Promise.all([
      listDrawingProjects(),
      listPersonalFormulas(),
      listFavoriteFormulaIds(),
      listWordDocuments(),
      listOmrConfigs(),
      listExams(),
      listQuestionBank(),
    ]);
    setDrawings(drw);
    setPersonalFormulas(per);
    setFavoriteIds(fav);
    setDocuments(docs);
    setOmrConfigs(omr);
    setExams(exs);
    setQuestionBank(qb);
  }, []);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const handleRenameDrawing = async (drw: DrawingProject) => {
    if (!editingName.trim()) return;
    await saveDrawingProject({ ...drw, name: editingName.trim(), updatedAt: Date.now() });
    setEditingId(null);
    await reloadAll();
    onNotify('Đã đổi tên dự án hình vẽ.', 'success');
  };

  const handleDuplicateDrawing = async (drw: DrawingProject) => {
    const clone: DrawingProject = {
      ...drw,
      id: generateId('drw'),
      name: `${drw.name} (Bản sao)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveDrawingProject(clone);
    await reloadAll();
    onNotify(`Đã nhân bản "${drw.name}".`, 'success');
  };

  const handleDeleteDrawing = async (id: string) => {
    await deleteDrawingProject(id);
    setConfirmDeleteId(null);
    await reloadAll();
    onNotify('Đã xóa dự án hình vẽ.', 'info');
  };

  const handleRenameFormula = async (f: FormulaItem) => {
    if (!editingName.trim()) return;
    await savePersonalFormula({ ...f, name: editingName.trim(), updatedAt: Date.now() });
    setEditingId(null);
    await reloadAll();
    onNotify('Đã đổi tên công thức cá nhân.', 'success');
  };

  const handleExportBackup = async () => {
    const payload = await exportAllDataBackup();
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadText(
      JSON.stringify(payload, null, 2),
      `smart_docx_pro_backup_${dateStamp}.json`,
      'application/json'
    );
    onNotify('Đã xuất tệp sao lưu toàn bộ dự án.', 'success');
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const counts = await importDataBackup(parsed);
      await reloadAll();
      onNotify(
        `Đã khôi phục ${counts.drawings} hình vẽ, ${counts.formulas} công thức, ${counts.documents} tài liệu, ${counts.questions} câu hỏi, ${counts.exams} đề thi.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Tệp sao lưu không hợp lệ.', 'warning');
    } finally {
      e.target.value = '';
    }
  };

  const filteredDrawings = drawings.filter((d) =>
    matchesVietnameseQuery(search, [d.name, d.description])
  );

  const favoriteBuiltin = BUILTIN_FORMULAS.filter((f) => favoriteIds.includes(f.id));
  const combinedFormulas = [...personalFormulas, ...favoriteBuiltin].filter((f) =>
    matchesVietnameseQuery(search, [f.name, f.topic, ...f.keywords])
  );

  const filteredDocs = documents.filter((d) =>
    matchesVietnameseQuery(search, [d.name, d.summaryText])
  );

  const filteredOmr = omrConfigs.filter((o) =>
    matchesVietnameseQuery(search, [o.name, o.structureLabel, o.templateCode])
  );

  const filteredExams = exams.filter((ex) =>
    matchesVietnameseQuery(search, [ex.title, ex.examPeriod])
  );

  const filteredQuestions = questionBank.filter((q) =>
    matchesVietnameseQuery(search, [q.stem, q.topic, q.lesson])
  );

  return (
    <div className="max-w-[1280px] mx-auto space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="ui-page-title text-slate-900">Dự án & Kho lưu trữ cá nhân</h1>
          <p className="ui-body text-slate-600 mt-1.5">
            Dữ liệu được lưu trên trình duyệt này. Hãy sao lưu định kỳ và trước khi chuyển sang máy tính khác.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={backupInputRef}
            type="file"
            accept=".json"
            onChange={handleImportBackup}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => backupInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 min-h-[40px] ui-btn font-medium bg-white border border-slate-200 text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-sky-600" />
            <span>Khôi phục từ sao lưu</span>
          </button>
          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-2 px-4 min-h-[40px] ui-btn font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Xuất bản sao lưu</span>
          </button>
        </div>
      </div>

      {/* Filter & Tabs Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('drawings')}
            className={`px-3.5 min-h-[38px] ui-btn font-medium rounded-md whitespace-nowrap ${
              activeTab === 'drawings' ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hình vẽ ({drawings.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('formulas')}
            className={`px-3.5 min-h-[38px] ui-btn font-medium rounded-md whitespace-nowrap ${
              activeTab === 'formulas' ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Công thức ({personalFormulas.length + favoriteBuiltin.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={`px-3.5 min-h-[38px] ui-btn font-medium rounded-md whitespace-nowrap ${
              activeTab === 'documents' ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tài liệu Word ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('omr')}
            className={`px-3.5 min-h-[38px] ui-btn font-medium rounded-md whitespace-nowrap ${
              activeTab === 'omr' ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mẫu OMR ({omrConfigs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('exams')}
            className={`px-3.5 min-h-[38px] ui-btn font-medium rounded-md whitespace-nowrap ${
              activeTab === 'exams' ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Đề thi & Ngân hàng ({exams.length + questionBank.length})
          </button>
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm dự án, công thức, đề thi..."
            className="w-full min-h-[40px] pl-9 pr-3 py-2 ui-input bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600 focus:bg-white"
          />
        </div>
      </div>

      {/* DRAWINGS LIST */}
      {activeTab === 'drawings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDrawings.length === 0 ? (
            <div className="col-span-full bg-white border border-slate-200 rounded-xl p-10 text-center ui-body text-slate-500">
              Chưa có dự án hình vẽ nào được lưu khớp tìm kiếm.
            </div>
          ) : (
            filteredDrawings.map((drw) => (
              <div
                key={drw.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-3">
                  <div className="h-40 bg-slate-50 border border-slate-100 rounded-lg overflow-hidden flex items-center justify-center p-2.5">
                    {drw.thumbnailSvg ? (
                      <div
                        className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full"
                        dangerouslySetInnerHTML={{ __html: drw.thumbnailSvg }}
                      />
                    ) : (
                      <FolderOpen className="w-7 h-7 text-slate-300" />
                    )}
                  </div>

                  {editingId === drw.id ? (
                    <div className="flex flex-wrap gap-1.5">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 min-h-[38px] px-2.5 py-1.5 ui-input border border-sky-500 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => handleRenameDrawing(drw)}
                        className="min-h-[38px] px-3 ui-btn font-medium bg-sky-600 text-white rounded-lg"
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="min-h-[38px] px-3 ui-btn border border-slate-200 rounded-lg"
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="ui-formula-name text-slate-900 break-words">{drw.name}</div>
                        <div className="ui-caption text-slate-500 mt-1">
                          {drw.elements.length} đối tượng · {drw.widthCm}×{drw.heightCm} cm · {formatRelativeTimeVi(drw.updatedAt)}
                        </div>
                      </div>
                      {drw.isFavorite && <Star className="w-4 h-4 fill-amber-400 text-amber-500 shrink-0 mt-1" />}
                    </div>
                  )}
                </div>

                {confirmDeleteId === drw.id ? (
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 ui-guide">
                    <span className="text-red-700 font-medium">Xóa dự án này?</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDeleteDrawing(drw.id)}
                        className="min-h-[36px] px-3 py-1 bg-red-600 text-white rounded-lg ui-btn font-medium"
                      >
                        Xóa hẳn
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[36px] px-3 py-1 border border-slate-200 rounded-lg ui-btn"
                      >
                        Giữ lại
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => onOpenDrawing(drw)}
                      className="min-h-[38px] px-3.5 py-1.5 ui-btn font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                    >
                      Mở trong bảng vẽ
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Đổi tên"
                        onClick={() => {
                          setEditingId(drw.id);
                          setEditingName(drw.name);
                        }}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Nhân bản"
                        onClick={() => handleDuplicateDrawing(drw)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Xóa dự án"
                        onClick={() => setConfirmDeleteId(drw.id)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* FORMULAS LIST */}
      {activeTab === 'formulas' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {combinedFormulas.length === 0 ? (
            <div className="col-span-full bg-white border border-slate-200 rounded-xl p-10 text-center ui-body text-slate-500">
              Chưa có công thức cá nhân hoặc công thức yêu thích nào.
            </div>
          ) : (
            combinedFormulas.map((f) => (
              <div key={f.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  {editingId === f.id ? (
                    <div className="flex gap-2 flex-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 min-h-[38px] px-2.5 py-1.5 ui-input border border-sky-500 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => handleRenameFormula(f)}
                        className="min-h-[38px] px-3.5 ui-btn font-medium bg-sky-600 text-white rounded-lg"
                      >
                        Lưu
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="ui-formula-name text-slate-900">{f.name}</div>
                      <div className="ui-caption text-slate-500 mt-1">
                        {f.isCustom ? 'Công thức cá nhân' : 'Thư viện yêu thích'} · {f.topic}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-lg overflow-x-auto">
                  <KatexRenderer latex={f.latex} fontSize={20} />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenFormula(f)}
                    className="min-h-[38px] px-4 py-1.5 ui-btn font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                  >
                    Mở chỉnh sửa & Xuất Word
                  </button>

                  {f.isCustom && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Đổi tên"
                        onClick={() => {
                          setEditingId(f.id);
                          setEditingName(f.name);
                        }}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Xóa"
                        onClick={async () => {
                          await deletePersonalFormula(f.id);
                          await reloadAll();
                          onNotify('Đã xóa công thức cá nhân.', 'info');
                        }}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* WORD DOCUMENTS LIST */}
      {activeTab === 'documents' && (
        <div className="space-y-3">
          {filteredDocs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center ui-body text-slate-500">
              Chưa có tài liệu Word nào được lưu.
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                    <span className="ui-formula-name text-slate-900 truncate">{doc.name}.docx</span>
                  </div>
                  <div className="ui-caption text-slate-500">
                    {doc.source === 'imported' ? 'Tải từ máy' : 'Tạo trong ứng dụng'} · {doc.blocks.length} mục · {doc.ommlCount} OMML · {formatRelativeTimeVi(doc.updatedAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenWordDocument(doc)}
                    className="min-h-[38px] px-4 py-1.5 ui-btn font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                  >
                    Nạp vào Trang chủ
                  </button>
                  <button
                    type="button"
                    title="Xóa bản ghi tài liệu"
                    onClick={async () => {
                      await deleteWordDocument(doc.id);
                      await reloadAll();
                      onNotify('Đã xóa bản ghi tài liệu.', 'info');
                    }}
                    className="min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* OMR CONFIGS LIST */}
      {activeTab === 'omr' && (
        <div className="space-y-3">
          {filteredOmr.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
              <p className="ui-body text-slate-500">
                Chưa có mẫu phiếu OMR tùy chỉnh nào được lưu trong kho cá nhân. Bạn có thể chọn sẵn 20 mẫu chuẩn tại phân hệ Phiếu OMR.
              </p>
              <button
                type="button"
                onClick={onOpenOmrTab}
                className="inline-flex items-center gap-2 px-4 min-h-[40px] bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Mở phân hệ Phiếu OMR</span>
              </button>
            </div>
          ) : (
            filteredOmr.map((cfg) => (
              <div
                key={cfg.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="ui-formula-name text-slate-900">{cfg.name}</div>
                  <div className="ui-caption text-slate-500">
                    {cfg.structureLabel} · Mã mẫu {cfg.templateCode} · {cfg.paperPreset}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenOmrTab}
                    className="min-h-[38px] px-4 bg-sky-50 border border-sky-200 text-sky-700 rounded-lg ui-btn font-semibold hover:bg-sky-100"
                  >
                    Mở Phiếu OMR
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteOmrConfig(cfg.id);
                      await reloadAll();
                      onNotify('Đã xóa mẫu OMR.', 'info');
                    }}
                    className="min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* EXAMS & QUESTION BANK LIST */}
      {activeTab === 'exams' && (
        <div className="space-y-5">
          <div className="space-y-3">
            <h2 className="ui-section-title text-slate-900">Đề kiểm tra đã lưu ({filteredExams.length})</h2>
            {filteredExams.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center ui-body text-slate-500">
                Chưa có đề kiểm tra nào được lưu vào kho. Hãy nhấn "Lưu đề vào kho" trong phân hệ Soạn đề.
              </div>
            ) : (
              filteredExams.map((ex) => (
                <div
                  key={ex.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="ui-formula-name text-slate-900 flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>{ex.title}</span>
                    </div>
                    <div className="ui-caption text-slate-500 mt-1">
                      {ex.examPeriod} · {ex.durationMinutes} phút · {ex.questions.length} câu · {formatRelativeTimeVi(ex.updatedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenExam(ex)}
                      className="min-h-[38px] px-4 bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700"
                    >
                      Mở trong Soạn đề
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteExamPaper(ex.id);
                        await reloadAll();
                        onNotify('Đã xóa đề kiểm tra.', 'info');
                      }}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3">
            <h2 className="ui-section-title text-slate-900">
              Câu hỏi đã lưu trong ngân hàng cá nhân ({filteredQuestions.length})
            </h2>
            {filteredQuestions.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center ui-body text-slate-500">
                Chưa có câu hỏi cá nhân lưu thêm ngoài ngân hàng mẫu.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="ui-caption text-sky-700 font-semibold">
                        {q.topic} · Lớp {q.grade}
                      </div>
                      <div className="ui-body text-slate-800 line-clamp-2">
                        <RichMathText text={q.stem} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteQuestionBankItem(q.id);
                        await reloadAll();
                        onNotify('Đã xóa câu hỏi khỏi ngân hàng cá nhân.', 'info');
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
