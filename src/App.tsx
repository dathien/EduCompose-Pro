import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  Info,
  Menu,
  RefreshCw,
  SlidersHorizontal,
  WifiOff,
  X,
} from 'lucide-react';
import {
  AppTab,
  DocumentBlock,
  DrawingProject,
  DrawingStudioMode,
  ExamPaper,
  FormulaItem,
  WordDocumentRecord,
  WordToolsMode,
} from './types';
import { HomePage } from './modules/home/HomePage';
import { FormulaEditorPage } from './modules/formula/FormulaEditorPage';
import { DrawingStudioPage } from './modules/drawing/DrawingStudioPage';
import { ProjectsPage } from './modules/projects/ProjectsPage';
import { GuidePage } from './modules/guide/GuidePage';
import { SAMPLE_INITIAL_EXAM } from './data/samples/sampleQuestions';
import { generateId } from './utils/vietnamese';
import { exportDocumentBlocksToDocxBlob, tryLatexToOmml } from './core/docx/docxEngine';
import { getActiveDocumentAdapter } from './adapters/wordAdapter';
import {
  runRichTextMigrationIfNeeded,
  saveExamPaper,
  saveWordDocument,
} from './storage/indexedDb';
import { usePwaController } from './pwa/usePwaController';

const OmrStudioPage = lazy(() =>
  import('./modules/omr/OmrStudioPage').then((m) => ({ default: m.OmrStudioPage }))
);
const ExamBuilderPage = lazy(() =>
  import('./modules/exam/ExamBuilderPage').then((m) => ({ default: m.ExamBuilderPage }))
);
const ExamShufflerPage = lazy(() =>
  import('./modules/exam/ExamShufflerPage').then((m) => ({ default: m.ExamShufflerPage }))
);
const BeautifyDocxPage = lazy(() =>
  import('./modules/word/BeautifyDocxPage').then((m) => ({ default: m.BeautifyDocxPage }))
);
const WordToolsPage = lazy(() =>
  import('./modules/word/WordToolsPage').then((m) => ({ default: m.WordToolsPage }))
);

export type UiFontSizeOption = 15 | 16 | 18;
const UI_FONT_STORAGE_KEY = 'smart_docx_ui_font_size';

function readStoredUiFontSize(): UiFontSizeOption {
  try {
    const raw = localStorage.getItem(UI_FONT_STORAGE_KEY);
    if (raw === '16') return 16;
    if (raw === '18') return 18;
  } catch {
    // Ignore localStorage unavailability
  }
  return 15;
}

function createInitialDocument(): WordDocumentRecord {
  const now = Date.now();
  return {
    id: generateId('doc'),
    name: 'Giáo án và học liệu mới',
    source: 'created',
    blocks: [],
    summaryText: '',
    ommlCount: 0,
    imageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

interface ToastState {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'warning';
}

const NAV_ITEMS: { key: AppTab; label: string }[] = [
  { key: 'home', label: 'Trang chủ' },
  { key: 'formula', label: 'Công thức' },
  { key: 'drawing', label: 'Vẽ hình' },
  { key: 'omr', label: 'Phiếu OMR' },
  { key: 'exam', label: 'Soạn đề' },
  { key: 'shuffle', label: 'Trộn đề' },
  { key: 'beautify', label: 'Làm đẹp đề' },
  { key: 'wordtools', label: 'Công cụ Word' },
  { key: 'projects', label: 'Dự án' },
  { key: 'guide', label: 'Hướng dẫn' },
];

const FONT_SIZE_CHOICES: { value: UiFontSizeOption; label: string; hint: string }[] = [
  { value: 15, label: 'Tiêu chuẩn', hint: '15px' },
  { value: 16, label: 'Dễ đọc', hint: '16px' },
  { value: 18, label: 'Chữ lớn', hint: '18px' },
];

function ModuleLoadingFallback() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 text-center ui-body text-slate-600">
      Đang tải phân hệ làm việc...
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  const [uiFontSize, setUiFontSize] = useState<UiFontSizeOption>(() => readStoredUiFontSize());
  const [selectedFormula, setSelectedFormula] = useState<FormulaItem | null>(null);
  const [selectedDrawing, setSelectedDrawing] = useState<DrawingProject | null>(null);
  const [drawingStudioMode, setDrawingStudioMode] = useState<DrawingStudioMode>('canvas');
  const [wordToolsMode, setWordToolsMode] = useState<WordToolsMode>('format');

  const [activeDocument, setActiveDocument] = useState<WordDocumentRecord>(() =>
    createInitialDocument()
  );
  const [activeExam, setActiveExam] = useState<ExamPaper>(() => SAMPLE_INITIAL_EXAM);
  const [shufflerSourceExam, setShufflerSourceExam] = useState<ExamPaper>(() => SAMPLE_INITIAL_EXAM);
  const [toast, setToast] = useState<ToastState | null>(null);

  const activeDocumentRef = useRef(activeDocument);
  activeDocumentRef.current = activeDocument;
  const activeExamRef = useRef(activeExam);
  activeExamRef.current = activeExam;

  const pwa = usePwaController({
    onBeforeUpdateReload: async () => {
      const doc = activeDocumentRef.current;
      if (doc.blocks.length > 0 || doc.summaryText.trim()) {
        await saveWordDocument({ ...doc, updatedAt: Date.now() });
      }
      const exam = activeExamRef.current;
      if (exam.questions.length > 0) {
        await saveExamPaper({ ...exam, updatedAt: Date.now() });
      }
    },
  });

  // Run safe versioned one-time migration for legacy $...$ math records in IndexedDB
  useEffect(() => {
    runRichTextMigrationIfNeeded();
  }, []);

  // Sync CSS variable & localStorage whenever UI font size changes
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font-size', `${uiFontSize}px`);
    try {
      localStorage.setItem(UI_FONT_STORAGE_KEY, String(uiFontSize));
    } catch {
      // Ignore storage error
    }
  }, [uiFontSize]);

  // Close settings popover when clicking outside
  useEffect(() => {
    if (!settingsOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [settingsOpen]);

  const notify = useCallback((message: string, tone: 'info' | 'success' | 'warning' = 'info') => {
    const id = Date.now();
    setToast({ id, message, tone });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4200);
  }, []);

  const handleNavigate = useCallback(
    (tab: AppTab, opts?: { drawingMode?: DrawingStudioMode; wordMode?: WordToolsMode }) => {
      if (opts?.drawingMode) {
        setDrawingStudioMode(opts.drawingMode);
      } else if (tab === 'drawing') {
        setDrawingStudioMode('canvas');
      }
      if (opts?.wordMode) {
        setWordToolsMode(opts.wordMode);
      }
      setActiveTab(tab);
      setMobileMenuOpen(false);
    },
    []
  );

  const handleAddBlockToDocument = useCallback((block: DocumentBlock) => {
    setActiveDocument((prev) => ({
      ...prev,
      blocks: [...prev.blocks, block],
      ommlCount: prev.ommlCount + (block.type === 'formula' ? 1 : 0),
      imageCount: prev.imageCount + (block.type === 'drawing' ? 1 : 0),
      updatedAt: Date.now(),
    }));
  }, []);

  const handleQuickExportDocument = async () => {
    const adapter = getActiveDocumentAdapter();
    const blob = await exportDocumentBlocksToDocxBlob(
      activeDocument.name,
      activeDocument.blocks,
      tryLatexToOmml
    );
    await saveWordDocument(activeDocument);
    const res = await adapter.exportDocxFile(
      blob,
      `${activeDocument.name.replace(/\s+/g, '_') || 'tai_lieu'}.docx`
    );
    notify(res.message, 'success');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 no-print">
        <div className="max-w-[1560px] mx-auto px-4 sm:px-6 min-h-[60px] flex items-center justify-between gap-4">
          {/* Zone 1: Brand Title */}
          <a
            href="#trang-chu"
            onClick={(e) => {
              e.preventDefault();
              handleNavigate('home');
            }}
            className="text-[19px] font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            SMART DOCX PRO
          </a>

          {/* Zone 2: Primary Navigation Links (10 tabs, wraps cleanly at xl/lg without overflow) */}
          <nav
            aria-label="Điều hướng chính"
            className="hidden lg:flex flex-wrap items-center justify-center gap-x-4 xl:gap-x-5 gap-y-1 ui-nav font-medium"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavigate(item.key)}
                  className={`py-3.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'border-sky-600 text-sky-700 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action + Display Font Setting + Mobile Menu Trigger */}
          <div className="flex items-center gap-2 shrink-0">
            <div ref={settingsRef} className="relative">
              <button
                type="button"
                aria-expanded={settingsOpen}
                aria-label="Cài đặt cỡ chữ giao diện"
                onClick={() => setSettingsOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 min-h-[40px] ui-btn font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <SlidersHorizontal className="w-4 h-4 text-slate-600" />
                <span className="hidden sm:inline">Cỡ chữ ({uiFontSize}px)</span>
              </button>

              {settingsOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 z-50 space-y-3">
                  <div>
                    <div className="ui-group-title text-slate-900">Cỡ chữ giao diện</div>
                    <p className="ui-caption text-slate-500 mt-0.5">
                      Chỉ thay đổi cỡ chữ hiển thị màn hình; tài liệu Word xuất ra luôn giữ Times New Roman 13pt.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {FONT_SIZE_CHOICES.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setUiFontSize(opt.value);
                          notify(`Đã chuyển cỡ chữ giao diện sang ${opt.label} (${opt.hint}).`, 'info');
                        }}
                        className={`px-2 py-2 rounded-lg border text-center transition-colors ${
                          uiFontSize === opt.value
                            ? 'bg-sky-600 text-white border-sky-600 font-semibold'
                            : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-[14px] leading-tight">{opt.label}</div>
                        <div
                          className={`text-[13px] mt-0.5 tabular-nums ${
                            uiFontSize === opt.value ? 'text-sky-100' : 'text-slate-500'
                          }`}
                        >
                          {opt.hint}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleQuickExportDocument}
              className="inline-flex items-center gap-2 px-3.5 min-h-[40px] ui-btn font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
            >
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">Xuất Word</span>
            </button>

            <button
              type="button"
              aria-label="Mở menu điều hướng"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Drawer */}
        {mobileMenuOpen && (
          <nav className="lg:hidden border-t border-slate-200 bg-white px-4 py-2.5 flex flex-wrap gap-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavigate(item.key)}
                className={`px-3.5 py-2 ui-btn font-medium rounded-lg whitespace-nowrap ${
                  activeTab === item.key
                    ? 'bg-sky-50 text-sky-700 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 w-full max-w-[1560px] mx-auto px-3 sm:px-6 py-5">
        {activeTab === 'home' && (
          <HomePage
            activeDocument={activeDocument}
            onUpdateActiveDocument={setActiveDocument}
            onCreateNewDocument={() => {
              const fresh = createInitialDocument();
              setActiveDocument(fresh);
              notify('Đã tạo tài liệu Word mới sẵn sàng soạn thảo.', 'info');
            }}
            onNavigate={handleNavigate}
            onOpenFormula={(formula) => {
              setSelectedFormula(formula);
              setActiveTab('formula');
            }}
            onOpenDrawing={(drawing) => {
              setSelectedDrawing(drawing);
              setDrawingStudioMode('canvas');
              setActiveTab('drawing');
            }}
            onNotify={notify}
            pwa={pwa}
          />
        )}

        {activeTab === 'formula' && (
          <FormulaEditorPage
            initialFormula={selectedFormula}
            onAddToDocument={handleAddBlockToDocument}
            onNotify={notify}
          />
        )}

        {activeTab === 'drawing' && (
          <DrawingStudioPage
            initialProject={selectedDrawing}
            initialMode={drawingStudioMode}
            onAddToDocument={handleAddBlockToDocument}
            onNotify={notify}
          />
        )}

        {activeTab === 'omr' && (
          <Suspense fallback={<ModuleLoadingFallback />}>
            <OmrStudioPage onNotify={notify} />
          </Suspense>
        )}

        {activeTab === 'exam' && (
          <Suspense fallback={<ModuleLoadingFallback />}>
            <ExamBuilderPage
              activeExam={activeExam}
              onUpdateActiveExam={setActiveExam}
              onSendToShuffler={(exam) => {
                setShufflerSourceExam(exam);
                setActiveTab('shuffle');
                notify('Đã chuyển đề thi sang phân hệ Trộn đề.', 'info');
              }}
              onNotify={notify}
            />
          </Suspense>
        )}

        {activeTab === 'shuffle' && (
          <Suspense fallback={<ModuleLoadingFallback />}>
            <ExamShufflerPage
              key={shufflerSourceExam.id + '_' + shufflerSourceExam.updatedAt}
              sourceExam={shufflerSourceExam}
              onNotify={notify}
            />
          </Suspense>
        )}

        {activeTab === 'beautify' && (
          <Suspense fallback={<ModuleLoadingFallback />}>
            <BeautifyDocxPage activeDocument={activeDocument} onNotify={notify} />
          </Suspense>
        )}

        {activeTab === 'wordtools' && (
          <Suspense fallback={<ModuleLoadingFallback />}>
            <WordToolsPage
              key={wordToolsMode}
              activeDocument={activeDocument}
              activeExam={activeExam}
              initialMode={wordToolsMode}
              onUpdateActiveDocument={setActiveDocument}
              onOpenInFormula={(latexStr) => {
                setSelectedFormula({
                  id: generateId('ocr'),
                  name: 'Công thức từ OCR',
                  subject: 'toan',
                  grade: 'chung',
                  topic: 'OCR',
                  latex: latexStr,
                  keywords: [],
                });
                setActiveTab('formula');
              }}
              onOpenExamBuilder={() => setActiveTab('exam')}
              onNotify={notify}
            />
          </Suspense>
        )}

        {activeTab === 'projects' && (
          <ProjectsPage
            uiFontSize={uiFontSize}
            onChangeUiFontSize={setUiFontSize}
            onOpenFormula={(formula) => {
              setSelectedFormula(formula);
              setActiveTab('formula');
            }}
            onOpenDrawing={(drawing) => {
              setSelectedDrawing(drawing);
              setDrawingStudioMode('canvas');
              setActiveTab('drawing');
            }}
            onOpenWordDocument={(doc) => {
              setActiveDocument(doc);
              setActiveTab('home');
              notify(`Đã nạp tài liệu "${doc.name}" vào Trang chủ.`, 'info');
            }}
            onOpenExam={(exam) => {
              setActiveExam(exam);
              setActiveTab('exam');
            }}
            onOpenOmrTab={() => setActiveTab('omr')}
            onNotify={notify}
          />
        )}

        {activeTab === 'guide' && <GuidePage onNavigate={handleNavigate} />}
      </main>

      {/* QUIET COPYRIGHT FOOTER (13px) */}
      <footer className="border-t border-slate-200 bg-white py-3.5 px-4 text-center ui-footer text-slate-600 no-print">
        Copyright © 2026 – Phát triển bởi Thầy Hồ Nguyễn Đa Thiện.
      </footer>

      {/* NON-BLOCKING UPDATE & OFFLINE BARS */}
      {pwa.needRefresh && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-50 max-w-md bg-white border border-sky-300 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 text-[14px] text-slate-800 no-print"
        >
          <RefreshCw className={`w-4 h-4 text-sky-600 shrink-0 ${pwa.isUpdating ? 'animate-spin' : ''}`} />
          <div className="flex-1 leading-snug">
            Đã có phiên bản mới. Nội dung đang soạn sẽ được lưu trước khi cập nhật.
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={pwa.isUpdating}
              onClick={pwa.applyUpdate}
              className="px-3 min-h-[34px] bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-60 text-[13px]"
            >
              {pwa.isUpdating ? 'Đang cập nhật...' : 'Cập nhật ngay'}
            </button>
            <button
              type="button"
              onClick={pwa.dismissUpdate}
              aria-label="Để sau"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!pwa.isOnline && !pwa.needRefresh && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-40 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl shadow-sm px-3.5 py-2 flex items-center gap-2 text-[14px] font-medium no-print"
        >
          <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
          <span>Chế độ ngoại tuyến — Dữ liệu lưu trực tiếp trên thiết bị</span>
        </div>
      )}

      {/* NON-BLOCKING STATUS NOTIFICATION */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 max-w-md px-4 py-3 rounded-xl border shadow-md flex items-start gap-2.5 ui-guide no-print ${
            toast.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : toast.tone === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : toast.tone === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          )}
          <span className="flex-1 leading-snug">{toast.message}</span>
          <button
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-700 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
