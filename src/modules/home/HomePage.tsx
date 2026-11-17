import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  FolderPlus,
  FolderUp,
  FunctionSquare,
  Plus,
  ScanText,
  Shuffle,
  Sigma,
  Sparkles,
  Star,
  Trash2,
  Wand2,
  WifiOff,
  X,
} from 'lucide-react';
import {
  AppTab,
  DocumentBlock,
  DrawingElement,
  DrawingProject,
  DrawingStudioMode,
  FormulaItem,
  RecentFormulaEntry,
  SampleDrawingProject,
  WordDocumentRecord,
  WordToolsMode,
} from '../../types';
import { BUILTIN_FORMULAS, COMMON_FORMULA_IDS } from '../../data/formulas';
import {
  DRAWING_LIBRARY_ITEMS,
  DRAWING_TEMPLATES,
  RECOMMENDED_DRAWING_SPECS,
  RecommendedDrawingSpec,
} from '../../data/drawing/drawingCatalog';
import { SAMPLE_DRAWING_PROJECTS, cloneSampleAsUserProject } from '../../data/samples/sampleProjects';
import { SAMPLE_WORD_TEMPLATES, cloneSampleWordDoc } from '../../data/samples/sampleWordDocs';
import { KatexRenderer } from '../../components/KatexRenderer';
import { RichMathText } from '../../components/RichMathText';
import { ScientificRichTextEditor } from '../../components/editor/ScientificRichTextEditor';
import { hasRichContent } from '../../core/math/richTextCodec';
import { SvgElementRenderer } from '../drawing/SvgElementRenderer';
import { PX_PER_CM } from '../drawing/svgExport';
import {
  listDrawingProjects,
  listFavoriteDrawingIds,
  listFavoriteFormulaIds,
  listPersonalFormulas,
  listRecentFormulas,
  listWordDocuments,
  saveWordDocument,
  setFavoriteDrawingId,
  setFavoriteFormula,
} from '../../storage/indexedDb';
import {
  exportDocumentBlocksToDocxBlob,
  inspectDocxFile,
  tryLatexToOmml,
} from '../../core/docx/docxEngine';
import { getActiveDocumentAdapter } from '../../adapters/wordAdapter';
import { formatRelativeTimeVi, generateId } from '../../utils/vietnamese';

export interface HomePwaState {
  isInstallable: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  isOnline: boolean;
  offlineVerified: boolean;
  triggerInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

interface HomePageProps {
  activeDocument: WordDocumentRecord;
  onUpdateActiveDocument: (doc: WordDocumentRecord) => void;
  onCreateNewDocument: () => void;
  onNavigate: (
    tab: AppTab,
    opts?: { drawingMode?: DrawingStudioMode; wordMode?: WordToolsMode }
  ) => void;
  onOpenFormula: (formula: FormulaItem) => void;
  onOpenDrawing: (project: DrawingProject) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'warning') => void;
  pwa?: HomePwaState;
}

const SUBJECT_BADGE: Record<string, string> = {
  toan: 'Toán học',
  vat_li: 'Vật lí',
  hoa_hoc: 'Hóa học',
  tieng_anh: 'Tiếng Anh',
  sinh_hoc: 'Sinh học',
  tin_hoc: 'Tin học',
  chung: 'Dùng chung',
};

function buildPreviewElementsForSpec(spec: RecommendedDrawingSpec): {
  elements: DrawingElement[];
  viewBox: string;
} {
  if (spec.templateId) {
    const tpl = DRAWING_TEMPLATES.find((t) => t.id === spec.templateId);
    if (tpl) {
      const built = tpl.buildElements(210, 150).map((item, idx) => ({
        ...item,
        id: `prev_${spec.id}_${idx}`,
        zIndex: idx + 1,
      }));
      return { elements: built, viewBox: '0 0 420 300' };
    }
  }
  const libItem = DRAWING_LIBRARY_ITEMS.find((i) => i.kind === spec.kind);
  if (libItem) {
    const w = Math.max(libItem.defaultWidth, 60);
    const h = Math.max(libItem.defaultHeight, 60);
    const el: DrawingElement = {
      id: `prev_${spec.id}`,
      kind: libItem.kind,
      name: libItem.name,
      category: libItem.category,
      x: w / 2 + 16,
      y: h / 2 + 16,
      width: libItem.defaultWidth,
      height: libItem.defaultHeight,
      rotation: 0,
      fill: libItem.defaultFill,
      stroke: libItem.defaultStroke,
      strokeWidth: 1.8,
      strokeDash: 'solid',
      opacity: 1,
      locked: false,
      zIndex: 1,
      params: { ...libItem.defaultParams },
    };
    return { elements: [el], viewBox: `0 0 ${w + 32} ${h + 32}` };
  }
  return { elements: [], viewBox: '0 0 200 150' };
}

function buildProjectFromSpec(spec: RecommendedDrawingSpec): DrawingProject {
  const now = Date.now();
  let elements: DrawingElement[] = [];
  if (spec.templateId) {
    const tpl = DRAWING_TEMPLATES.find((t) => t.id === spec.templateId);
    if (tpl) {
      elements = tpl.buildElements(450, 300).map((item, idx) => ({
        ...item,
        id: generateId('el'),
        zIndex: idx + 1,
      }));
    }
  } else if (spec.kind) {
    const libItem = DRAWING_LIBRARY_ITEMS.find((i) => i.kind === spec.kind);
    if (libItem) {
      elements = [
        {
          id: generateId('el'),
          kind: libItem.kind,
          name: libItem.name,
          category: libItem.category,
          x: 450,
          y: 300,
          width: libItem.defaultWidth,
          height: libItem.defaultHeight,
          rotation: 0,
          fill: libItem.defaultFill,
          stroke: libItem.defaultStroke,
          strokeWidth: 1.8,
          strokeDash: 'solid',
          opacity: 1,
          locked: false,
          zIndex: 1,
          params: { ...libItem.defaultParams },
        },
      ];
    }
  }
  return {
    id: generateId('drw'),
    name: spec.name,
    description: `${SUBJECT_BADGE[spec.subject] || spec.subject} · Lớp ${spec.grade} · ${spec.topic}`,
    subject: spec.subject,
    grade: spec.grade,
    topic: spec.topic,
    pagePreset: 'A4_LANDSCAPE',
    widthCm: 24,
    heightCm: 16,
    showGrid: true,
    snapToGrid: true,
    elements,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

export const HomePage: React.FC<HomePageProps> = ({
  activeDocument,
  onUpdateActiveDocument,
  onCreateNewDocument,
  onNavigate,
  onOpenFormula,
  onOpenDrawing,
  onNotify,
  pwa,
}) => {
  const docxInputRef = useRef<HTMLInputElement | null>(null);
  const [drawings, setDrawings] = useState<DrawingProject[]>([]);
  const [recentFormulas, setRecentFormulas] = useState<RecentFormulaEntry[]>([]);
  const [personalFormulas, setPersonalFormulas] = useState<FormulaItem[]>([]);
  const [favoriteFormulaIds, setFavoriteFormulaIds] = useState<string[]>([]);
  const [favoriteDrawingIds, setFavoriteDrawingIds] = useState<string[]>([]);
  const [wordDocs, setWordDocs] = useState<WordDocumentRecord[]>([]);

  const [newParagraphText, setNewParagraphText] = useState('');
  const [newHeadingText, setNewHeadingText] = useState('');
  const [showDocumentComposer, setShowDocumentComposer] = useState(false);

  // Starter expansion & preview states
  const [showAllSampleProjects, setShowAllSampleProjects] = useState(false);
  const [showAllWordTemplates, setShowAllWordTemplates] = useState(false);
  const [wordTplCategory, setWordTplCategory] = useState<'all' | 'giao_an' | 'kiem_tra' | 'bieu_mau'>('all');
  const [previewWordDoc, setPreviewWordDoc] = useState<WordDocumentRecord | null>(null);
  const [showAllCommonFormulas, setShowAllCommonFormulas] = useState(false);
  const [showAllRecommendedDrawings, setShowAllRecommendedDrawings] = useState(false);

  const adapter = getActiveDocumentAdapter();

  const loadData = async () => {
    try {
      const [drw, rec, per, favF, favD, docs] = await Promise.all([
        listDrawingProjects(),
        listRecentFormulas(),
        listPersonalFormulas(),
        listFavoriteFormulaIds(),
        listFavoriteDrawingIds(),
        listWordDocuments(),
      ]);
      setDrawings(drw);
      setRecentFormulas(rec);
      setPersonalFormulas(per);
      setFavoriteFormulaIds(favF);
      setFavoriteDrawingIds(favD);
      setWordDocs(docs);
    } catch {
      // Safe fallback if IndexedDB unavailable
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const commonFormulas = useMemo(() => {
    return COMMON_FORMULA_IDS.map((id) => BUILTIN_FORMULAS.find((f) => f.id === id)).filter(
      Boolean
    ) as FormulaItem[];
  }, []);

  const filteredWordTemplates = useMemo(() => {
    if (wordTplCategory === 'all') return SAMPLE_WORD_TEMPLATES;
    return SAMPLE_WORD_TEMPLATES.filter((t) => t.category === wordTplCategory);
  }, [wordTplCategory]);

  const userStarredDrawings = drawings.filter((d) => d.isFavorite);
  const userStarredRecommended = RECOMMENDED_DRAWING_SPECS.filter((s) =>
    favoriteDrawingIds.includes(s.id)
  );
  const hasFavoriteDrawings = userStarredDrawings.length > 0 || userStarredRecommended.length > 0;

  const handleOpenWordFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const inspected = await inspectDocxFile(file);
      await saveWordDocument(inspected);
      onUpdateActiveDocument(inspected);
      setShowDocumentComposer(true);
      await loadData();
      onNotify(
        `Đã mở "${inspected.name}.docx" (${inspected.ommlCount} công thức OMML, ${inspected.imageCount} hình ảnh).`,
        'success'
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể đọc tệp Word (.docx) này.',
        'warning'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleExportDocRecord = async (doc: WordDocumentRecord) => {
    const blob = await exportDocumentBlocksToDocxBlob(doc.name, doc.blocks, tryLatexToOmml);
    if (doc.source !== 'template') {
      await saveWordDocument(doc);
      await loadData();
    }
    const slug = doc.name.replace(/\s+/g, '_') || 'tai_lieu';
    const res = await adapter.exportDocxFile(blob, `${slug}.docx`);
    onNotify(res.message, 'success');
  };

  const handleAddBlockToActiveDoc = (type: 'heading' | 'paragraph', content: string) => {
    if (!hasRichContent(content)) return;
    const block: DocumentBlock = {
      id: generateId('blk'),
      type,
      text: content.trim(),
      html: content.trim(),
    };
    const updated: WordDocumentRecord = {
      ...activeDocument,
      blocks: [...activeDocument.blocks, block],
      updatedAt: Date.now(),
    };
    onUpdateActiveDocument(updated);
    if (type === 'heading') setNewHeadingText('');
    else setNewParagraphText('');
  };

  const handleOpenRecentFormula = (entry: RecentFormulaEntry) => {
    const found =
      personalFormulas.find((f) => f.id === entry.id) ||
      BUILTIN_FORMULAS.find((f) => f.id === entry.id);
    if (found) {
      onOpenFormula(found);
      return;
    }
    onOpenFormula({
      id: entry.id,
      name: entry.name,
      subject: entry.subject || 'toan',
      grade: 'chung',
      topic: 'Gần đây',
      latex: entry.latex,
      keywords: [],
    });
  };

  const handleToggleFormulaFav = async (formula: FormulaItem) => {
    const isFav = favoriteFormulaIds.includes(formula.id);
    await setFavoriteFormula(formula.id, !isFav);
    setFavoriteFormulaIds((prev) =>
      isFav ? prev.filter((id) => id !== formula.id) : [...prev, formula.id]
    );
    onNotify(
      isFav ? `Đã bỏ "${formula.name}" khỏi yêu thích.` : `Đã thêm "${formula.name}" vào yêu thích.`,
      'info'
    );
  };

  const handleToggleRecommendedDrawingFav = async (spec: RecommendedDrawingSpec) => {
    const isFav = favoriteDrawingIds.includes(spec.id);
    await setFavoriteDrawingId(spec.id, !isFav);
    setFavoriteDrawingIds((prev) =>
      isFav ? prev.filter((id) => id !== spec.id) : [...prev, spec.id]
    );
    onNotify(
      isFav ? `Đã bỏ "${spec.name}" khỏi hình vẽ yêu thích.` : `Đã ghim "${spec.name}" vào hình vẽ yêu thích.`,
      'info'
    );
  };

  const handleOpenSampleProject = (sample: SampleDrawingProject) => {
    const cloned = cloneSampleAsUserProject(sample);
    onOpenDrawing(cloned);
    onNotify(`Đã mở bản sao "${sample.name}" để chỉnh sửa.`, 'success');
  };

  const moduleCards: {
    title: string;
    desc: string;
    icon: React.ReactNode;
    accent: string;
    action: () => void;
  }[] = [
    {
      title: 'Soạn công thức',
      desc: 'Nhập công thức Toán, Vật lí, Hóa học trực quan và xuất Word.',
      icon: <Sigma className="w-6 h-6 text-sky-600" />,
      accent: 'hover:border-sky-400',
      action: () => onNavigate('formula'),
    },
    {
      title: 'Bảng vẽ khoa học',
      desc: 'Kéo thả hình học phẳng/không gian, mạch điện, dụng cụ thí nghiệm và xuất PNG 300 DPI.',
      icon: <Compass className="w-6 h-6 text-teal-600" />,
      accent: 'hover:border-teal-400',
      action: () => onNavigate('drawing', { drawingMode: 'canvas' }),
    },
    {
      title: 'Đồ thị & Bảng biến thiên',
      desc: 'Vẽ đồ thị y = f(x) có tiệm cận và bảng biến thiên đầy đủ dấu đạo hàm, chiều tăng giảm.',
      icon: <FunctionSquare className="w-6 h-6 text-sky-600" />,
      accent: 'hover:border-sky-400',
      action: () => onNavigate('drawing', { drawingMode: 'graph' }),
    },
    {
      title: 'Biểu đồ thống kê',
      desc: 'Tạo biểu đồ cột, đường, quạt tròn, histogram, boxplot, scatter và phân phối chuẩn.',
      icon: <BarChart3 className="w-6 h-6 text-teal-600" />,
      accent: 'hover:border-teal-400',
      action: () => onNavigate('drawing', { drawingMode: 'chart' }),
    },
    {
      title: 'Tạo phiếu trả lời trắc nghiệm',
      desc: 'Tạo phiếu tô trắc nghiệm A4, A5, A3, 2×A5 chuẩn tọa độ mm, xuất PDF/PNG/SVG/JSON.',
      icon: <ClipboardCheck className="w-6 h-6 text-sky-600" />,
      accent: 'hover:border-sky-400',
      action: () => onNavigate('omr'),
    },
    {
      title: 'Soạn đề & Ma trận',
      desc: 'Soạn 3 phần (TN, Đ/S, TLN), ma trận & bản đặc tả CV 7991, trình chiếu lên bảng.',
      icon: <FileCheck2 className="w-6 h-6 text-teal-600" />,
      accent: 'hover:border-teal-400',
      action: () => onNavigate('exam'),
    },
    {
      title: 'Trộn đề & Mã đề',
      desc: 'Hoán vị câu hỏi, đáp án theo ID ổn định, giữ ngữ liệu chung và xuất bảng đáp án.',
      icon: <Shuffle className="w-6 h-6 text-sky-600" />,
      accent: 'hover:border-sky-400',
      action: () => onNavigate('shuffle'),
    },
    {
      title: 'Làm đẹp đề thi',
      desc: 'Chuẩn hóa đề Word (.docx) sang Times New Roman 13pt A4, gỡ Auto-Numbering giữ OMML.',
      icon: <Sparkles className="w-6 h-6 text-teal-600" />,
      accent: 'hover:border-teal-400',
      action: () => onNavigate('beautify'),
    },
    {
      title: 'Xử lý tài liệu Word',
      desc: 'Chuẩn hóa đánh số, xử lý bảng/biểu mẫu, kiểm tra đề lỗi và làm sạch văn bản.',
      icon: <Wand2 className="w-6 h-6 text-sky-600" />,
      accent: 'hover:border-sky-400',
      action: () => onNavigate('wordtools', { wordMode: 'format' }),
    },
    {
      title: 'OCR đề thi từ ảnh',
      desc: 'Nhận dạng chữ tiếng Việt từ ảnh chụp đề kiểm tra ngay trong trình duyệt (Tesseract.js).',
      icon: <ScanText className="w-6 h-6 text-teal-600" />,
      accent: 'hover:border-teal-400',
      action: () => onNavigate('wordtools', { wordMode: 'ocr' }),
    },
    {
      title: 'Dự án & Kho lưu trữ',
      desc: 'Quản lý hình vẽ, công thức, mẫu OMR, đề thi và sao lưu/khôi phục JSON ngoại tuyến.',
      icon: <FolderOpen className="w-6 h-6 text-sky-600" />,
      accent: 'hover:border-sky-400',
      action: () => onNavigate('projects'),
    },
    {
      title: 'Hướng dẫn sử dụng',
      desc: 'Tài liệu hướng dẫn từng bước cho giáo viên kèm ví dụ thực hành và cách in chuẩn.',
      icon: <BookOpen className="w-6 h-6 text-teal-600" />,
      accent: 'hover:border-teal-400',
      action: () => onNavigate('guide'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. BANNER GIỚI THIỆU VÀ 6 NÚT CHỨC NĂNG */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <img
              src="/icon.svg"
              alt="Biểu tượng EduCompose Pro"
              className="w-14 h-14 rounded-xl shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0 space-y-1.5">
              <h1 className="ui-app-title text-slate-900 tracking-tight">
                EduCompose Pro
              </h1>
              <p className="text-[16px] text-sky-700 font-semibold leading-snug">
                Bộ công cụ biên soạn học liệu và đề thi
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-[15px] text-slate-600">
                <span>Cài đặt ứng dụng trên máy tính từ thanh menu; các công cụ đã tải có thể sử dụng ngoại tuyến.</span>
                {pwa?.offlineVerified && (
                  <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Đã lưu bộ nhớ đệm ngoại tuyến</span>
                  </span>
                )}
                {pwa && !pwa.isOnline && (
                  <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-amber-700">
                    <WifiOff className="w-4 h-4 shrink-0" />
                    <span>Đang ngoại tuyến</span>
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Khu vực 6 nút chức năng riêng bên dưới */}
        <div className="pt-3 border-t border-slate-200">
          <input
            ref={docxInputRef}
            type="file"
            accept=".docx"
            onChange={handleOpenWordFile}
            className="hidden"
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                onCreateNewDocument();
                setShowDocumentComposer(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-3 min-h-[46px] bg-sky-600 text-white text-[14px] sm:text-[15px] font-semibold rounded-xl hover:bg-sky-700 transition-colors text-center"
            >
              <FilePlus2 className="w-4 h-4 shrink-0" />
              <span>Tạo tài liệu mới</span>
            </button>

            <button
              type="button"
              onClick={() => docxInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-3 min-h-[46px] bg-white border border-slate-300 text-slate-800 text-[14px] sm:text-[15px] font-medium rounded-xl hover:bg-slate-50 transition-colors text-center"
            >
              <FolderUp className="w-4 h-4 text-sky-600 shrink-0" />
              <span>Mở tài liệu Word</span>
            </button>

          </div>
        </div>

        {/* Khung soạn nhanh tài liệu đang mở */}
        {(showDocumentComposer || activeDocument.blocks.length > 0) && (
          <div className="mt-6 pt-5 border-t border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
                <span className="ui-group-title text-slate-900">Tài liệu đang soạn:</span>
                <input
                  type="text"
                  value={activeDocument.name}
                  onChange={(e) =>
                    onUpdateActiveDocument({
                      ...activeDocument,
                      name: e.target.value,
                      updatedAt: Date.now(),
                    })
                  }
                  aria-label="Tên tài liệu đang soạn"
                  className="ui-input font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 min-h-[40px] flex-1 max-w-md focus:bg-white focus:outline-none focus:border-sky-600"
                />
                <span className="ui-caption text-slate-500">
                  {activeDocument.blocks.length} mục · Times New Roman 13pt
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportDocRecord(activeDocument)}
                  className="inline-flex items-center gap-2 px-4 min-h-[40px] bg-sky-600 text-white ui-btn font-semibold rounded-lg hover:bg-sky-700 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>Xuất DOCX</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDocumentComposer(false)}
                  className="px-3 min-h-[40px] bg-white border border-slate-200 text-slate-600 ui-btn rounded-lg hover:bg-slate-50"
                >
                  Thu gọn
                </button>
              </div>
            </div>

            {activeDocument.blocks.length > 0 && (
              <div className="max-h-48 overflow-y-auto panel-scroll space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                {activeDocument.blocks.map((blk, idx) => (
                  <div
                    key={blk.id}
                    className="flex items-center justify-between gap-3 ui-body py-2 px-3 rounded-lg bg-white border border-slate-200"
                  >
                    <div className="min-w-0 flex-1 text-slate-800">
                      <span className="text-slate-400 mr-2 tabular-nums">{idx + 1}.</span>
                      {blk.type === 'formula' && (
                        <span>
                          Công thức: <KatexRenderer latex={blk.latex || ''} fontSize={16} />
                        </span>
                      )}
                      {blk.type === 'drawing' && <span>Hình vẽ: {blk.drawingName}</span>}
                      {blk.type === 'table' && (
                        <span>
                          Bảng ({blk.tableHeaders?.length || 0} cột × {blk.tableRows?.length || 0} dòng)
                        </span>
                      )}
                      {(blk.type === 'heading' || blk.type === 'paragraph') && (
                        <span className={blk.type === 'heading' ? 'font-semibold' : ''}>
                          <RichMathText text={blk.html || blk.text || ''} fontSize={15} inline />
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      title="Xóa mục này"
                      onClick={() =>
                        onUpdateActiveDocument({
                          ...activeDocument,
                          blocks: activeDocument.blocks.filter((b) => b.id !== blk.id),
                        })
                      }
                      className="text-slate-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newHeadingText}
                  onChange={(e) => setNewHeadingText(e.target.value)}
                  placeholder="Thêm tiêu đề mục..."
                  onKeyDown={(e) =>
                    e.key === 'Enter' && handleAddBlockToActiveDoc('heading', newHeadingText)
                  }
                  className="flex-1 px-3 py-2 min-h-[40px] ui-input bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
                <button
                  type="button"
                  onClick={() => handleAddBlockToActiveDoc('heading', newHeadingText)}
                  className="px-3 min-h-[40px] ui-btn bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 inline-flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm tiêu đề</span>
                </button>
              </div>
              <div className="space-y-2">
                <ScientificRichTextEditor
                  value={newParagraphText}
                  onChange={setNewParagraphText}
                  variant="full"
                  minHeightPx={96}
                  defaultEquationOpen={true}
                  placeholder="Soạn đoạn văn bản, bài giảng hoặc câu hỏi kèm công thức trực quan, bảng biểu, hình vẽ..."
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleAddBlockToActiveDoc('paragraph', newParagraphText)}
                    className="px-4 min-h-[38px] ui-btn bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm đoạn vào tài liệu</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. PHÂN HỆ LÀM VIỆC CHÍNH (DUY NHẤT - 12 MODULE) */}
      <section className="space-y-3.5">
        <h2 className="ui-section-title text-slate-900">Thầy cô muốn thực hiện công việc nào?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {moduleCards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={card.action}
              className={`text-left p-5 bg-white border border-slate-200 rounded-xl ${card.accent} transition-colors group flex flex-col justify-between gap-2.5`}
            >
              <div>
                <div className="mb-3">{card.icon}</div>
                <div className="text-[17px] font-semibold text-slate-900 group-hover:text-sky-700 flex items-center justify-between gap-2">
                  <span>{card.title}</span>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-sky-600 shrink-0" />
                </div>
                <p className="ui-body text-slate-600 mt-1.5">{card.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 3. HÀNG 1: DỰ ÁN (TRÁI) & TÀI LIỆU WORD (PHẢI) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* TRÁI: Dự án đang thực hiện hoặc 12 Dự án mẫu đề xuất */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="ui-section-title text-slate-900">
                {drawings.length > 0 ? 'Dự án đang thực hiện' : 'Dự án mẫu đề xuất (12 mẫu)'}
              </h2>
              <p className="ui-caption text-slate-500 mt-0.5">
                {drawings.length > 0
                  ? 'Các hình vẽ khoa học bạn đã lưu gần đây'
                  : 'Nhấp vào mẫu bất kì để mở bản sao và chỉnh sửa ngay trên Bảng vẽ'}
              </p>
            </div>
            {drawings.length > 0 ? (
              <button
                type="button"
                onClick={() => onNavigate('projects')}
                className="ui-btn font-medium text-sky-700 hover:underline"
              >
                Xem tất cả ({drawings.length})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAllSampleProjects((v) => !v)}
                className="ui-btn font-medium text-sky-700 hover:underline"
              >
                {showAllSampleProjects ? 'Thu gọn' : 'Xem tất cả 12 mẫu'}
              </button>
            )}
          </div>

          {drawings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {drawings.slice(0, 4).map((drw) => (
                <button
                  key={drw.id}
                  type="button"
                  onClick={() => onOpenDrawing(drw)}
                  className="text-left p-3 border border-slate-200 rounded-xl hover:border-sky-400 transition-colors space-y-2"
                >
                  <div className="h-28 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center p-1.5 overflow-hidden">
                    {drw.thumbnailSvg ? (
                      <div
                        className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full"
                        dangerouslySetInnerHTML={{ __html: drw.thumbnailSvg }}
                      />
                    ) : (
                      <svg
                        viewBox={`0 0 ${Math.round(drw.widthCm * PX_PER_CM)} ${Math.round(drw.heightCm * PX_PER_CM)}`}
                        className="max-w-full max-h-full"
                      >
                        {drw.elements.map((el) => (
                          <SvgElementRenderer key={el.id} element={el} uniqueSuffix={`usr_${drw.id}`} />
                        ))}
                      </svg>
                    )}
                  </div>
                  <div className="ui-formula-name text-slate-900 truncate">{drw.name}</div>
                  <div className="ui-caption text-slate-500">
                    {drw.elements.length} đối tượng · {formatRelativeTimeVi(drw.updatedAt)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(showAllSampleProjects
                ? SAMPLE_DRAWING_PROJECTS
                : SAMPLE_DRAWING_PROJECTS.slice(0, 4)
              ).map((sample) => {
                const vw = Math.round(sample.widthCm * PX_PER_CM);
                const vh = Math.round(sample.heightCm * PX_PER_CM);
                return (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => handleOpenSampleProject(sample)}
                    className="text-left p-3 border border-slate-200 rounded-xl hover:border-sky-400 transition-colors space-y-2 flex flex-col justify-between"
                  >
                    <div className="space-y-2 w-full">
                      <div className="h-28 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center p-1.5 overflow-hidden">
                        <svg viewBox={`0 0 ${vw} ${vh}`} className="max-w-full max-h-full">
                          {sample.elements.map((el) => (
                            <SvgElementRenderer
                              key={el.id}
                              element={el}
                              uniqueSuffix={`smp_${sample.id}`}
                            />
                          ))}
                        </svg>
                      </div>
                      <div className="ui-formula-name text-slate-900 line-clamp-2">{sample.name}</div>
                    </div>
                    <div className="ui-caption text-slate-500 flex items-center justify-between gap-2 w-full">
                      <span>
                        {SUBJECT_BADGE[sample.subject]} · Lớp {sample.grade}
                      </span>
                      <span className="text-sky-700 font-medium">Mở sửa</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* PHẢI: Tài liệu Word gần đây hoặc 15 Tài liệu Word mẫu */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="ui-section-title text-slate-900">
                {wordDocs.length > 0 ? 'Tài liệu Word gần đây' : 'Tài liệu Word mẫu (15 mẫu)'}
              </h2>
              <p className="ui-caption text-slate-500 mt-0.5">
                {wordDocs.length > 0
                  ? 'Các tài liệu bạn đã tạo hoặc mở từ máy'
                  : 'Mẫu giáo án, đề kiểm tra và biểu mẫu chuẩn Times New Roman 13pt'}
              </p>
            </div>
            {wordDocs.length > 0 ? (
              <FileText className="w-5 h-5 text-sky-600" />
            ) : (
              <button
                type="button"
                onClick={() => setShowAllWordTemplates((v) => !v)}
                className="ui-btn font-medium text-sky-700 hover:underline"
              >
                {showAllWordTemplates ? 'Thu gọn' : 'Xem tất cả 15 mẫu'}
              </button>
            )}
          </div>

          {wordDocs.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'Tất cả (15)'],
                  ['giao_an', 'Giáo án (5)'],
                  ['kiem_tra', 'Đề kiểm tra (5)'],
                  ['bieu_mau', 'Biểu mẫu (5)'],
                ] as const
              ).map(([cat, label]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setWordTplCategory(cat)}
                  className={`px-3 min-h-[34px] rounded-lg ui-caption border ${
                    wordTplCategory === cat
                      ? 'bg-sky-600 text-white border-sky-600 font-semibold'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {wordDocs.length > 0 ? (
            <div className="space-y-2.5">
              {wordDocs.slice(0, 5).map((doc) => (
                <div
                  key={doc.id}
                  className="p-3.5 border border-slate-200 rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="ui-formula-name text-slate-900 truncate">{doc.name}.docx</div>
                    <div className="ui-caption text-slate-500 mt-0.5">
                      {doc.blocks.length} mục · {doc.ommlCount} OMML · {formatRelativeTimeVi(doc.updatedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateActiveDocument(doc);
                      setShowDocumentComposer(true);
                      onNotify(`Đã nạp tài liệu "${doc.name}" vào khung soạn thảo.`, 'info');
                    }}
                    className="px-3 min-h-[36px] bg-sky-50 border border-sky-200 text-sky-700 rounded-lg ui-btn font-medium shrink-0 hover:bg-sky-100"
                  >
                    Nạp sửa
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto panel-scroll pr-1">
              {(showAllWordTemplates
                ? filteredWordTemplates
                : filteredWordTemplates.slice(0, 5)
              ).map((tpl) => (
                <div
                  key={tpl.id}
                  className="p-3.5 border border-slate-200 rounded-xl hover:border-sky-300 transition-colors space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="ui-formula-name text-slate-900">{tpl.name}</div>
                      <div className="ui-caption text-slate-600 mt-0.5">{tpl.summaryText}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPreviewWordDoc(tpl)}
                      className="inline-flex items-center gap-1 px-2.5 min-h-[34px] bg-white border border-slate-200 text-slate-700 rounded-lg ui-caption font-medium hover:bg-slate-50"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Xem nhanh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cloned = cloneSampleWordDoc(tpl);
                        onUpdateActiveDocument(cloned);
                        setShowDocumentComposer(true);
                        onNotify(`Đã nạp mẫu "${tpl.name}" vào tài liệu đang soạn.`, 'success');
                      }}
                      className="inline-flex items-center gap-1 px-3 min-h-[34px] bg-sky-50 border border-sky-200 text-sky-700 rounded-lg ui-caption font-semibold hover:bg-sky-100"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Nạp vào trình soạn</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportDocRecord(tpl)}
                      className="inline-flex items-center gap-1 px-3 min-h-[34px] bg-sky-600 text-white rounded-lg ui-caption font-semibold hover:bg-sky-700"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Xuất DOCX</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. HÀNG 2: CÔNG THỨC SỬ DỤNG GẦN ĐÂY HOẶC 18 CÔNG THỨC THÔNG DỤNG */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="ui-section-title text-slate-900">
              {recentFormulas.length > 0
                ? 'Công thức sử dụng gần đây'
                : 'Công thức thông dụng (18 công thức Toán – Lý – Hóa)'}
            </h2>
            <p className="ui-caption text-slate-500 mt-0.5">
              Nhấp Chỉnh sửa để mở trong trình soạn OMML hoặc Sao chép LaTeX / Thêm vào tài liệu ngay
            </p>
          </div>
          <div className="flex items-center gap-3">
            {recentFormulas.length === 0 && (
              <button
                type="button"
                onClick={() => setShowAllCommonFormulas((v) => !v)}
                className="ui-btn font-medium text-sky-700 hover:underline"
              >
                {showAllCommonFormulas ? 'Thu gọn' : `Xem tất cả ${commonFormulas.length} công thức`}
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('formula')}
              className="ui-btn font-semibold text-sky-700 hover:underline"
            >
              Mở thư viện đầy đủ
            </button>
          </div>
        </div>

        {recentFormulas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {recentFormulas.slice(0, 6).map((rf) => (
              <button
                key={rf.id}
                type="button"
                onClick={() => handleOpenRecentFormula(rf)}
                className="text-left p-4 border border-slate-200 rounded-xl hover:border-sky-400 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="ui-formula-name text-slate-900 truncate">{rf.name}</span>
                  <span className="ui-caption text-slate-400 shrink-0">
                    {formatRelativeTimeVi(rf.usedAt)}
                  </span>
                </div>
                <div className="mt-2.5 overflow-x-auto text-slate-800">
                  <KatexRenderer latex={rf.latex} fontSize={20} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {(showAllCommonFormulas ? commonFormulas : commonFormulas.slice(0, 6)).map((f) => {
              const isFav = favoriteFormulaIds.includes(f.id);
              return (
                <div
                  key={f.id}
                  className="p-4 border border-slate-200 rounded-xl hover:border-sky-300 transition-colors flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="ui-formula-name text-slate-900">{f.name}</div>
                      <button
                        type="button"
                        title={isFav ? 'Bỏ yêu thích' : 'Thêm yêu thích'}
                        onClick={() => handleToggleFormulaFav(f)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-amber-500 shrink-0"
                      >
                        <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-500' : ''}`} />
                      </button>
                    </div>
                    <div className="ui-caption text-slate-500 mt-0.5">
                      {SUBJECT_BADGE[f.subject]} · Lớp {f.grade} · {f.topic}
                    </div>
                    <div className="mt-2.5 overflow-x-auto py-1 text-slate-900">
                      <KatexRenderer latex={f.latex} fontSize={20} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => onOpenFormula(f)}
                      className="px-3 min-h-[34px] bg-sky-600 text-white rounded-lg ui-caption font-semibold hover:bg-sky-700"
                    >
                      Chỉnh sửa
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await adapter.copyTextToClipboard(f.latex, 'mã LaTeX');
                        onNotify(res.message, 'success');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 min-h-[34px] bg-white border border-slate-200 text-slate-700 rounded-lg ui-caption hover:bg-slate-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>LaTeX</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateActiveDocument({
                          ...activeDocument,
                          blocks: [
                            ...activeDocument.blocks,
                            {
                              id: generateId('blk'),
                              type: 'formula',
                              text: f.name,
                              latex: f.latex,
                              ommlSupported: true,
                            },
                          ],
                          ommlCount: activeDocument.ommlCount + 1,
                          updatedAt: Date.now(),
                        });
                        setShowDocumentComposer(true);
                        onNotify(`Đã thêm công thức "${f.name}" vào tài liệu.`, 'success');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 min-h-[34px] bg-teal-50 border border-teal-200 text-teal-800 rounded-lg ui-caption font-medium hover:bg-teal-100"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Thêm vào tài liệu</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. HÀNG 3: HÌNH VẼ YÊU THÍCH HOẶC 24 HÌNH VẼ ĐỀ XUẤT */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="ui-section-title text-slate-900">
              {hasFavoriteDrawings ? 'Hình vẽ yêu thích' : 'Hình vẽ đề xuất (24 hình Toán – Lý – Hóa)'}
            </h2>
            <p className="ui-caption text-slate-500 mt-0.5">
              Nhấn biểu tượng ngôi sao để ghim hình vẽ thường dùng hoặc mở trực tiếp vào Bảng vẽ khoa học
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAllRecommendedDrawings((v) => !v)}
            className="ui-btn font-medium text-sky-700 hover:underline"
          >
            {showAllRecommendedDrawings ? 'Thu gọn' : 'Xem tất cả 24 hình vẽ đề xuất'}
          </button>
        </div>

        {/* Nếu có hình vẽ người dùng đã gắn sao */}
        {hasFavoriteDrawings && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {userStarredDrawings.map((drw) => (
              <button
                key={drw.id}
                type="button"
                onClick={() => onOpenDrawing(drw)}
                className="text-left p-3.5 border border-amber-200 bg-amber-50/20 rounded-xl hover:border-amber-400 transition-colors space-y-2"
              >
                <div className="h-24 bg-white border border-slate-100 rounded-lg flex items-center justify-center p-1.5 overflow-hidden">
                  {drw.thumbnailSvg ? (
                    <div
                      className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full"
                      dangerouslySetInnerHTML={{ __html: drw.thumbnailSvg }}
                    />
                  ) : (
                    <Compass className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div className="ui-formula-name text-slate-900 truncate">{drw.name}</div>
                <div className="ui-caption text-slate-500">{drw.elements.length} đối tượng</div>
              </button>
            ))}

            {userStarredRecommended.map((spec) => {
              const preview = buildPreviewElementsForSpec(spec);
              return (
                <div
                  key={spec.id}
                  className="p-3.5 border border-amber-200 bg-amber-50/20 rounded-xl space-y-2.5 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="h-24 bg-white border border-slate-100 rounded-lg flex items-center justify-center p-1.5 overflow-hidden">
                      <svg viewBox={preview.viewBox} className="max-w-full max-h-full">
                        {preview.elements.map((el) => (
                          <SvgElementRenderer key={el.id} element={el} uniqueSuffix={`fav_${spec.id}`} />
                        ))}
                      </svg>
                    </div>
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="ui-formula-name text-slate-900">{spec.name}</div>
                      <button
                        type="button"
                        onClick={() => handleToggleRecommendedDrawingFav(spec)}
                        className="p-1 text-amber-500"
                        title="Bỏ yêu thích"
                      >
                        <Star className="w-4 h-4 fill-amber-400" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenDrawing(buildProjectFromSpec(spec))}
                    className="w-full min-h-[34px] px-3 bg-sky-600 text-white rounded-lg ui-caption font-semibold hover:bg-sky-700"
                  >
                    Mở trong Bảng vẽ
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Kho 24 hình vẽ đề xuất */}
        {(!hasFavoriteDrawings || showAllRecommendedDrawings) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {(showAllRecommendedDrawings
              ? RECOMMENDED_DRAWING_SPECS
              : RECOMMENDED_DRAWING_SPECS.slice(0, 8)
            ).map((spec) => {
              const preview = buildPreviewElementsForSpec(spec);
              const isFav = favoriteDrawingIds.includes(spec.id);
              return (
                <div
                  key={spec.id}
                  className="p-3.5 border border-slate-200 rounded-xl hover:border-sky-300 transition-colors flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-2">
                    <div className="h-28 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center p-2 overflow-hidden">
                      <svg viewBox={preview.viewBox} className="max-w-full max-h-full">
                        {preview.elements.map((el) => (
                          <SvgElementRenderer key={el.id} element={el} uniqueSuffix={`rec_${spec.id}`} />
                        ))}
                      </svg>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="ui-formula-name text-slate-900">{spec.name}</div>
                        <div className="ui-caption text-slate-500">
                          {SUBJECT_BADGE[spec.subject]} · Lớp {spec.grade}
                        </div>
                      </div>
                      <button
                        type="button"
                        title={isFav ? 'Bỏ yêu thích' : 'Thêm vào hình vẽ yêu thích'}
                        onClick={() => handleToggleRecommendedDrawingFav(spec)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-amber-500 shrink-0"
                      >
                        <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-500' : ''}`} />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenDrawing(buildProjectFromSpec(spec))}
                    className="w-full min-h-[36px] px-3 bg-sky-50 border border-sky-200 text-sky-700 rounded-lg ui-caption font-semibold hover:bg-sky-100"
                  >
                    Mở trong Bảng vẽ
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL XEM NHANH MẪU TÀI LIỆU WORD */}
      {previewWordDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="ui-section-title text-slate-900">{previewWordDoc.name}</h3>
                <p className="ui-caption text-slate-500">{previewWordDoc.summaryText}</p>
              </div>
              <button
                type="button"
                aria-label="Đóng xem nhanh"
                onClick={() => setPreviewWordDoc(null)}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto panel-scroll space-y-3 font-word text-[16px] leading-relaxed bg-[#FCFDFE] flex-1">
              {previewWordDoc.blocks.map((blk) => (
                <div key={blk.id}>
                  {blk.type === 'heading' && (
                    <div
                      className={`font-bold text-slate-900 text-[18px] mt-2 ${
                        blk.align === 'center' ? 'text-center' : ''
                      }`}
                    >
                      <RichMathText text={blk.text || ''} />
                    </div>
                  )}
                  {blk.type === 'paragraph' && (
                    <p
                      className={`text-slate-800 ${blk.align === 'center' ? 'text-center' : ''} ${
                        blk.bold ? 'font-bold' : ''
                      } ${blk.italic ? 'italic' : ''}`}
                    >
                      <RichMathText text={blk.text || ''} />
                    </p>
                  )}
                  {blk.type === 'formula' && (
                    <div className="py-2 flex justify-center">
                      <KatexRenderer latex={blk.latex || ''} displayMode={true} fontSize={20} />
                    </div>
                  )}
                  {blk.type === 'table' && blk.tableHeaders && (
                    <div className="overflow-x-auto my-2">
                      <table className="w-full border-collapse border border-slate-400 text-[14px]">
                        <thead>
                          <tr className="bg-slate-100">
                            {blk.tableHeaders.map((h, i) => (
                              <th key={i} className="border border-slate-400 px-2.5 py-1.5 text-left font-bold">
                                <RichMathText text={h} />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(blk.tableRows || []).map((row, ri) => (
                            <tr key={ri}>
                              {row.map((cell, ci) => (
                                <td key={ci} className="border border-slate-400 px-2.5 py-1.5 align-top">
                                  <RichMathText text={cell} />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const cloned = cloneSampleWordDoc(previewWordDoc);
                  onUpdateActiveDocument(cloned);
                  setShowDocumentComposer(true);
                  setPreviewWordDoc(null);
                  onNotify(`Đã nạp "${previewWordDoc.name}" vào tài liệu đang soạn.`, 'success');
                }}
                className="px-4 min-h-[40px] bg-white border border-slate-300 text-slate-800 rounded-lg ui-btn font-medium hover:bg-slate-100"
              >
                Nạp vào trình soạn
              </button>
              <button
                type="button"
                onClick={() => handleExportDocRecord(previewWordDoc)}
                className="inline-flex items-center gap-2 px-4 min-h-[40px] bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700"
              >
                <Download className="w-4 h-4" />
                <span>Xuất DOCX ngay</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
