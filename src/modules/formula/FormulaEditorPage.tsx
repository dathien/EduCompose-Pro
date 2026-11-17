import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'mathlive';
import { convertLatexToMathMl, MathfieldElement } from 'mathlive';
import {
  AlertTriangle,
  Bookmark,
  Check,
  ClipboardCopy,
  Copy,
  Download,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Info,
  Redo2,
  RotateCcw,
  Scissors,
  Search,
  Star,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  DocumentBlock,
  FormulaItem,
  GradeLevel,
  RecentFormulaEntry,
  SubjectType,
} from '../../types';
import { ACCENT_ITEMS } from '../../components/editor/mathToolbarCatalog';
import { insertScientificMath, isAccentRemoval } from '../../components/editor/accentCommands';
import { BUILTIN_FORMULAS, SYMBOL_GROUPS } from '../../data/formulas';
import { KatexRenderer } from '../../components/KatexRenderer';
import { convertMathmlToOmml } from '../../core/omml/mathmlToOmml';
import { latexToTypst, typstToLatex } from '../../core/omml/typstConverter';
import { exportFormulaToDocxBlob } from '../../core/docx/docxEngine';
import { getActiveDocumentAdapter } from '../../adapters/wordAdapter';
import {
  deletePersonalFormula,
  listFavoriteFormulaIds,
  listPersonalFormulas,
  listRecentFormulas,
  recordRecentFormula,
  savePersonalFormula,
  setFavoriteFormula,
} from '../../storage/indexedDb';
import { downloadText, generateId, matchesVietnameseQuery } from '../../utils/vietnamese';
import {
  buildFormulaSvg,
  formatReadableFormulaFallback,
  renderFormulaPreviewToPng,
} from './formulaExport';

if (typeof window !== 'undefined' && MathfieldElement) {
  MathfieldElement.soundsDirectory = null;
  MathfieldElement.fontsDirectory = null;
}

type InputMode = 'visual' | 'latex' | 'mathml' | 'typst';
type LibraryTab = 'standard' | 'personal' | 'favorites' | 'recent';

interface FormulaEditorPageProps {
  initialFormula?: FormulaItem | null;
  onAddToDocument: (block: DocumentBlock) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'warning') => void;
}

const SUBJECT_LABELS: Record<SubjectType, string> = {
  toan: 'Toán học',
  vat_li: 'Vật lí',
  hoa_hoc: 'Hóa học',
};

const COLOR_PRESETS = [
  { label: 'Đen chuẩn in', value: '#0f172a' },
  { label: 'Xanh dương', value: '#0284c7' },
  { label: 'Xanh ngọc', value: '#0d9488' },
  { label: 'Đỏ nhấn', value: '#dc2626' },
  { label: 'Tím học thuật', value: '#7c3aed' },
];

const ALL_SYMBOL_GROUPS = [...SYMBOL_GROUPS, { id: 'accents', name: 'Dấu trên và dấu dưới', items: ACCENT_ITEMS.map(item => ({ label: item.previewLatex, latex: item.insertLatex, title: item.tooltip })) }];

const FORMULA_SIZE_OPTIONS = [18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48];

export const FormulaEditorPage: React.FC<FormulaEditorPageProps> = ({
  initialFormula,
  onAddToDocument,
  onNotify,
}) => {
  const mathfieldRef = useRef<MathfieldElement | null>(null);
  const previewCardRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Split pane width: 56% library grid / 44% editor+preview (draggable 28%..68%)
  const [leftWidthPct, setLeftWidthPct] = useState<number>(56);
  const isResizingRef = useRef(false);

  // Formula State
  const [formulaTitle, setFormulaTitle] = useState<string>(
    initialFormula?.name || 'Công thức nghiệm phương trình bậc hai'
  );
  const [latex, setLatex] = useState<string>(
    initialFormula?.latex || 'x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'
  );
  const [variablesNote, setVariablesNote] = useState<string>(
    initialFormula?.variables || 'a ≠ 0, Δ = b² - 4ac ≥ 0'
  );
  const [conditionNote, setConditionNote] = useState<string>(initialFormula?.condition || '');
  const [selectedSubject, setSelectedSubject] = useState<SubjectType>(
    initialFormula?.subject || 'toan'
  );
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel>(initialFormula?.grade || '10');
  const [selectedTopic, setSelectedTopic] = useState<string>(
    initialFormula?.topic || 'Công thức cá nhân'
  );
  const [activeFormulaId, setActiveFormulaId] = useState<string>(
    initialFormula?.id || 'toan-10-pt-1'
  );

  // Editor Controls (Editor default 28px, Preview default 26px, customizable 18-48px)
  const [inputMode, setInputMode] = useState<InputMode>('visual');
  const [activeSymbolGroupId, setActiveSymbolGroupId] = useState<string>(SYMBOL_GROUPS[0].id);
  const [lastInsertedSymbol, setLastInsertedSymbol] = useState<string>('');
  const [editorFontSize, setEditorFontSize] = useState<number>(28);
  const [previewFontSize, setPreviewFontSize] = useState<number>(26);
  const [formulaColor, setFormulaColor] = useState<string>('#0f172a');
  const [fractionDisplay, setFractionDisplay] = useState<'dfrac' | 'tfrac'>('dfrac');
  const [equationNumber, setEquationNumber] = useState<string>('');

  // Code mode drafts
  const [mathmlDraft, setMathmlDraft] = useState<string>('');
  const [typstDraft, setTypstDraft] = useState<string>('');
  const [typstWarnings, setTypstWarnings] = useState<string[]>([]);

  // Library Filter State
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('standard');
  const [filterSubject, setFilterSubject] = useState<'all' | SubjectType>('all');
  const [filterGrade, setFilterGrade] = useState<'all' | GradeLevel>('all');
  const [filterTopic, setFilterTopic] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // IndexedDB Collections
  const [personalFormulas, setPersonalFormulas] = useState<FormulaItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentFormulas, setRecentFormulas] = useState<RecentFormulaEntry[]>([]);
  const [showSaveDrawer, setShowSaveDrawer] = useState(false);

  const adapter = useMemo(() => getActiveDocumentAdapter(), []);

  const reloadCollections = useCallback(async () => {
    try {
      const [personal, favs, recents] = await Promise.all([
        listPersonalFormulas(),
        listFavoriteFormulaIds(),
        listRecentFormulas(),
      ]);
      setPersonalFormulas(personal);
      setFavoriteIds(favs);
      setRecentFormulas(recents);
    } catch {
      // Ignore initial IndexedDB errors in restricted mode
    }
  }, []);

  useEffect(() => {
    reloadCollections();
  }, [reloadCollections]);

  useEffect(() => {
    if (!initialFormula) return;
    setActiveFormulaId(initialFormula.id);
    setFormulaTitle(initialFormula.name);
    setLatex(initialFormula.latex);
    setVariablesNote(initialFormula.variables || '');
    setConditionNote(initialFormula.condition || '');
    setSelectedSubject(initialFormula.subject);
    setSelectedGrade(initialFormula.grade);
    setSelectedTopic(initialFormula.topic);
    if (mathfieldRef.current && mathfieldRef.current.value !== initialFormula.latex) {
      mathfieldRef.current.value = initialFormula.latex;
    }
  }, [initialFormula]);

  useEffect(() => {
    const mf = mathfieldRef.current;
    if (!mf) return;
    if (mf.value !== latex) {
      mf.value = latex;
    }

    const handleInput = () => {
      setLatex(mf.value);
    };
    mf.addEventListener('input', handleInput);
    return () => {
      mf.removeEventListener('input', handleInput);
    };
  }, [inputMode]);

  const setLatexAndSyncField = useCallback((nextLatex: string) => {
    setLatex(nextLatex);
    if (mathfieldRef.current && mathfieldRef.current.value !== nextLatex) {
      mathfieldRef.current.value = nextLatex;
    }
  }, []);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isResizingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidthPct(Math.max(28, Math.min(68, Math.round(pct))));
    };
    const handlePointerUp = () => {
      isResizingRef.current = false;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const effectiveLatex = useMemo(() => {
    if (fractionDisplay === 'tfrac') {
      return latex.replace(/\\dfrac/g, '\\tfrac').replace(/\\frac(?![a-zA-Z])/g, '\\tfrac');
    }
    return latex.replace(/\\tfrac/g, '\\dfrac');
  }, [latex, fractionDisplay]);

  const mathmlOutput = useMemo(() => {
    try {
      const raw = convertLatexToMathMl(effectiveLatex || '');
      return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${raw}</math>`;
    } catch {
      return '';
    }
  }, [effectiveLatex]);

  const ommlResult = useMemo(() => {
    return convertMathmlToOmml(mathmlOutput, effectiveLatex);
  }, [mathmlOutput, effectiveLatex]);

  const handleSwitchMode = (mode: InputMode) => {
    if (mode === 'mathml') {
      setMathmlDraft(mathmlOutput);
    } else if (mode === 'typst') {
      setTypstDraft(latexToTypst(latex));
      setTypstWarnings([]);
    }
    setInputMode(mode);
  };

  const handleInsertSymbol = (snippet: string) => {
    setLastInsertedSymbol(snippet);
    if (inputMode !== 'visual') {
      setInputMode('visual');
      setTimeout(() => {
        const mf = mathfieldRef.current;
        if (mf) {
          if (!insertScientificMath(mf, snippet)) { onNotify('Hãy chọn cả biểu thức có dấu cần bỏ.', 'info'); return; }
          setLatex(mf.value);
        }
      }, 40);
      return;
    }
    const mf = mathfieldRef.current;
    if (mf) {
      if (!insertScientificMath(mf, snippet)) { onNotify('Hãy chọn cả biểu thức có dấu cần bỏ.', 'info'); return; }
      setLatex(mf.value);
    } else if (!isAccentRemoval(snippet)) {
      setLatexAndSyncField(`${latex} ${snippet}`.trim());
    }
  };

  const handleSelectFormula = async (item: FormulaItem) => {
    setActiveFormulaId(item.id);
    setFormulaTitle(item.name);
    setLatexAndSyncField(item.latex);
    setVariablesNote(item.variables || '');
    setConditionNote(item.condition || '');
    setSelectedSubject(item.subject);
    setSelectedGrade(item.grade);
    setSelectedTopic(item.topic);

    try {
      await recordRecentFormula({
        id: item.id,
        name: item.name,
        subject: item.subject,
        latex: item.latex,
      });
      const recents = await listRecentFormulas();
      setRecentFormulas(recents);
    } catch {
      // Non-blocking
    }
  };

  const handleToggleFavorite = async (id: string) => {
    const isFav = favoriteIds.includes(id);
    await setFavoriteFormula(id, !isFav);
    setFavoriteIds((prev) => (isFav ? prev.filter((x) => x !== id) : [...prev, id]));
    onNotify(isFav ? 'Đã bỏ khỏi công thức yêu thích.' : 'Đã thêm vào công thức yêu thích.', 'info');
  };

  const handleSavePersonalFormula = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formulaTitle.trim() || !latex.trim()) {
      onNotify('Vui lòng nhập tên công thức và nội dung công thức trước khi lưu.', 'warning');
      return;
    }
    const newItem: FormulaItem = {
      id: activeFormulaId.startsWith('custom_') ? activeFormulaId : generateId('custom'),
      name: formulaTitle.trim(),
      subject: selectedSubject,
      grade: selectedGrade,
      topic: selectedTopic || 'Công thức cá nhân',
      latex: latex.trim(),
      variables: variablesNote.trim() || undefined,
      condition: conditionNote.trim() || undefined,
      keywords: [formulaTitle.trim(), selectedTopic],
      isCustom: true,
      updatedAt: Date.now(),
    };
    await savePersonalFormula(newItem);
    await reloadCollections();
    setActiveFormulaId(newItem.id);
    setShowSaveDrawer(false);
    onNotify(`Đã lưu "${newItem.name}" vào thư viện cá nhân.`, 'success');
  };

  const handleDeletePersonal = async (id: string) => {
    await deletePersonalFormula(id);
    await reloadCollections();
    onNotify('Đã xóa công thức cá nhân.', 'info');
  };

  const allCombinedFormulas = useMemo(() => {
    return [...personalFormulas, ...BUILTIN_FORMULAS];
  }, [personalFormulas]);

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    for (const f of allCombinedFormulas) {
      if (filterSubject === 'all' || f.subject === filterSubject) {
        set.add(f.topic);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [allCombinedFormulas, filterSubject]);

  const filteredFormulas = useMemo(() => {
    let source: FormulaItem[] = [];
    if (libraryTab === 'standard') {
      source = BUILTIN_FORMULAS;
    } else if (libraryTab === 'personal') {
      source = personalFormulas;
    } else if (libraryTab === 'favorites') {
      source = allCombinedFormulas.filter((f) => favoriteIds.includes(f.id));
    } else {
      source = recentFormulas.map((r) => {
        const match = allCombinedFormulas.find((f) => f.id === r.id);
        return (
          match || {
            id: r.id,
            name: r.name,
            subject: r.subject || 'toan',
            grade: 'chung',
            topic: 'Sử dụng gần đây',
            latex: r.latex,
            keywords: [],
          }
        );
      });
    }

    return source.filter((item) => {
      if (filterSubject !== 'all' && item.subject !== filterSubject) return false;
      if (filterGrade !== 'all' && item.grade !== filterGrade) return false;
      if (filterTopic !== 'all' && item.topic !== filterTopic) return false;
      return matchesVietnameseQuery(searchQuery, [
        item.name,
        item.topic,
        item.variables,
        ...item.keywords,
      ]);
    });
  }, [
    libraryTab,
    personalFormulas,
    allCombinedFormulas,
    favoriteIds,
    recentFormulas,
    filterSubject,
    filterGrade,
    filterTopic,
    searchQuery,
  ]);

  const handleExportWordOmml = async (forceImageFallback = false) => {
    if (!latex.trim()) {
      onNotify('Chưa có công thức để xuất Word.', 'warning');
      return;
    }
    if (!ommlResult.supported && !forceImageFallback) {
      onNotify(
        'Công thức chứa cú pháp chưa tương thích hoàn toàn với OMML. Vui lòng xem cảnh báo bên dưới để chọn xuất ảnh PNG 300 DPI.',
        'warning'
      );
      return;
    }

    let pngDataUrl: string | undefined;
    let widthPx = 420;
    let heightPx = 120;
    if (forceImageFallback) {
      const png = await renderFormulaPreviewToPng({
        previewEl: previewCardRef.current,
        readableText: formatReadableFormulaFallback(effectiveLatex),
        latex: effectiveLatex,
        equationNumber,
        color: formulaColor,
        fontSize: previewFontSize,
      });
      pngDataUrl = png.dataUrl;
      widthPx = png.width;
      heightPx = png.height;
    }

    const blob = await exportFormulaToDocxBlob({
      title: formulaTitle,
      omml: ommlResult.omml,
      latex: effectiveLatex,
      equationNumber,
      variables: variablesNote,
      condition: conditionNote,
      fallbackPngDataUrl: pngDataUrl,
      fallbackWidthPx: widthPx,
      fallbackHeightPx: heightPx,
      useFallbackImage: forceImageFallback,
    });

    const slug = (formulaTitle || 'cong_thuc')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '_')
      .slice(0, 32);
    const res = await adapter.exportDocxFile(blob, `${slug || 'cong_thuc'}.docx`);
    onNotify(res.message, 'success');
  };

  const handleCopyLatex = async () => {
    const res = await adapter.copyTextToClipboard(effectiveLatex, 'mã LaTeX');
    onNotify(res.message, 'success');
  };

  const handleCopyMathml = async () => {
    if (!mathmlOutput) {
      onNotify('Không tạo được mã MathML từ biểu thức hiện tại.', 'warning');
      return;
    }
    const res = await adapter.copyTextToClipboard(mathmlOutput, 'mã MathML (dán trực tiếp vào Word)');
    onNotify(res.message, 'success');
  };

  const handleCopyTypst = async () => {
    const typstOut = latexToTypst(effectiveLatex);
    const res = await adapter.copyTextToClipboard(typstOut, 'mã Typst');
    onNotify(res.message, 'success');
  };

  const handleSaveSvg = () => {
    const { svgString } = buildFormulaSvg({
      latex: effectiveLatex,
      readableText: formatReadableFormulaFallback(effectiveLatex),
      equationNumber,
      color: formulaColor,
      fontSize: previewFontSize,
    });
    downloadText(svgString, 'cong_thuc_smart_docx.svg', 'image/svg+xml;charset=utf-8');
    onNotify('Đã tải xuống tệp SVG công thức.', 'success');
  };

  const handleExportPng = async (copyToClipboard: boolean) => {
    try {
      const { blob } = await renderFormulaPreviewToPng({
        previewEl: previewCardRef.current,
        readableText: formatReadableFormulaFallback(effectiveLatex),
        latex: effectiveLatex,
        equationNumber,
        color: formulaColor,
        fontSize: previewFontSize,
      });
      if (copyToClipboard) {
        const res = await adapter.copyImageToClipboard(blob);
        onNotify(res.message, 'success');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cong_thuc_300dpi.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        onNotify('Đã xuất ảnh PNG độ phân giải cao (300 DPI).', 'success');
      }
    } catch {
      onNotify('Không thể xuất ảnh PNG cho công thức này.', 'warning');
    }
  };

  const activeGroup = ALL_SYMBOL_GROUPS.find((g) => g.id === activeSymbolGroupId) || SYMBOL_GROUPS[0];
  const isCurrentFavorite = favoriteIds.includes(activeFormulaId);

  return (
    <div
      ref={containerRef}
      style={{ '--left-col-pct': `${leftWidthPct}%` } as React.CSSProperties}
      className="flex flex-col lg:flex-row lg:min-h-[calc(100vh-132px)] bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
    >
      {/* KHU VỰC TRÁI (30–32%): THƯ VIỆN CÔNG THỨC */}
      <aside className="w-full lg:w-[var(--left-col-pct)] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70 flex flex-col max-h-[540px] lg:max-h-[calc(100vh-132px)]">
        <div className="p-4 border-b border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="ui-section-title text-slate-900">Thư viện công thức</h2>
            <span className="ui-caption text-slate-500 tabular-nums">
              {filteredFormulas.length} mẫu
            </span>
          </div>

          {/* Search box >= 40px */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm công thức (VD: tich phan, ester)..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 ui-input bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600 focus:bg-white transition-colors"
            />
          </div>

          {/* Library Source Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['standard', 'Chuẩn'],
                ['personal', 'Cá nhân'],
                ['favorites', 'Yêu thích'],
                ['recent', 'Gần đây'],
              ] as [LibraryTab, string][]
            ).map(([tabKey, label]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setLibraryTab(tabKey)}
                className={`px-2 py-2 min-h-[36px] ui-btn font-medium rounded-md transition-colors whitespace-nowrap ${
                  libraryTab === tabKey
                    ? 'bg-white text-sky-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Subject Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['all', 'Tất cả'],
                ['toan', 'Toán'],
                ['vat_li', 'Vật lí'],
                ['hoa_hoc', 'Hóa học'],
              ] as ['all' | SubjectType, string][]
            ).map(([sub, label]) => (
              <button
                key={sub}
                type="button"
                onClick={() => {
                  setFilterSubject(sub);
                  setFilterTopic('all');
                }}
                className={`px-3 py-1.5 min-h-[38px] ui-btn font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  filterSubject === sub
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Grade + Topic Selects */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              aria-label="Lọc theo khối lớp"
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value as 'all' | GradeLevel)}
              className="w-full min-h-[40px] px-3 py-1.5 ui-input bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
            >
              <option value="all">Tất cả khối lớp</option>
              <option value="10">Lớp 10</option>
              <option value="11">Lớp 11</option>
              <option value="12">Lớp 12</option>
            </select>

            <select
              aria-label="Lọc theo chủ đề"
              value={filterTopic}
              onChange={(e) => setFilterTopic(e.target.value)}
              className="w-full min-h-[40px] px-3 py-1.5 ui-input bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
            >
              <option value="all">Tất cả chủ đề</option>
              {availableTopics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Formula Grid Cards (20-24px formula rendering, generous height, no clipping) */}
        <div className="flex-1 overflow-y-auto panel-scroll p-3">
          {filteredFormulas.length === 0 ? (
            <div className="p-8 text-center text-slate-500 ui-body">
              Không tìm thấy công thức phù hợp. Thử đổi từ khóa hoặc chọn danh mục khác.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {filteredFormulas.map((item) => {
              const isSelected = activeFormulaId === item.id;
              const isFav = favoriteIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectFormula(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelectFormula(item)}
                  className={`group p-4 rounded-xl border cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-sky-50/75 border-sky-500'
                      : 'bg-white border-slate-200 hover:border-sky-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="ui-formula-name text-slate-900">
                        {item.name}
                      </div>
                      <div className="ui-caption text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                        <span>{SUBJECT_LABELS[item.subject]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.grade === 'chung' ? 'Tổng hợp' : `Lớp ${item.grade}`}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.topic}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title={isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(item.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-amber-500"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            isFav ? 'fill-amber-400 text-amber-500' : ''
                          }`}
                        />
                      </button>
                      {item.isCustom && (
                        <button
                          type="button"
                          title="Xóa công thức cá nhân"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePersonal(item.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 overflow-x-auto text-slate-900 py-1">
                    <KatexRenderer latex={item.latex} fontSize={21} />
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* THANH KÉO THAY ĐỔI ĐỘ RỘNG */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Kéo để thay đổi tỷ lệ thư viện và trình soạn thảo"
        onPointerDown={() => {
          isResizingRef.current = true;
        }}
        className="hidden lg:flex w-2 bg-slate-100 hover:bg-sky-200 cursor-col-resize items-center justify-center transition-colors shrink-0"
      >
        <div className="w-0.5 h-10 bg-slate-300 rounded-full" />
      </div>

      {/* KHU VỰC PHẢI (68–70%): SOẠN THẢO & XEM TRƯỚC / XUẤT WORD */}
      <section className="flex-1 min-w-0 flex flex-col bg-white">
        {/* PHÍA TRÊN: THANH CÔNG CỤ & TRÌNH NHẬP */}
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-4">
          {/* Header Row: Title + Quick Edit Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[240px]">
              <input
                type="text"
                value={formulaTitle}
                onChange={(e) => setFormulaTitle(e.target.value)}
                aria-label="Tên công thức"
                className="ui-page-title text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-sky-600 focus:outline-none px-1 py-0.5 w-full max-w-xl"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                title="Hoàn tác"
                onClick={() => mathfieldRef.current?.executeCommand('undo')}
                className="min-w-[38px] min-h-[38px] p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center justify-center"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Làm lại"
                onClick={() => mathfieldRef.current?.executeCommand('redo')}
                className="min-w-[38px] min-h-[38px] p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center justify-center"
              >
                <Redo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Cắt công thức"
                onClick={() => {
                  adapter.copyTextToClipboard(effectiveLatex, 'công thức');
                  setLatexAndSyncField('');
                }}
                className="min-w-[38px] min-h-[38px] p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center justify-center"
              >
                <Scissors className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Xóa trắng ô nhập"
                onClick={() => setLatexAndSyncField('')}
                className="min-w-[38px] min-h-[38px] p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center justify-center"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleToggleFavorite(activeFormulaId)}
                className={`inline-flex items-center gap-1.5 px-3 min-h-[38px] ui-btn font-medium rounded-lg border transition-colors ${
                  isCurrentFavorite
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Star className={`w-4 h-4 ${isCurrentFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
                <span>Yêu thích</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSaveDrawer((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] ui-btn font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors whitespace-nowrap"
              >
                <Bookmark className="w-4 h-4" />
                <span>Lưu vào thư viện</span>
              </button>
            </div>
          </div>

          {/* Inline Save to Personal Library Bar */}
          {showSaveDrawer && (
            <form
              onSubmit={handleSavePersonalFormula}
              className="p-4 bg-teal-50/60 border border-teal-200 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block ui-caption font-medium text-slate-700 mb-1">Môn học</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value as SubjectType)}
                  className="w-full min-h-[40px] px-3 py-1.5 ui-input bg-white border border-slate-200 rounded-lg"
                >
                  <option value="toan">Toán học</option>
                  <option value="vat_li">Vật lí</option>
                  <option value="hoa_hoc">Hóa học</option>
                </select>
              </div>
              <div>
                <label className="block ui-caption font-medium text-slate-700 mb-1">Khối lớp</label>
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value as GradeLevel)}
                  className="w-full min-h-[40px] px-3 py-1.5 ui-input bg-white border border-slate-200 rounded-lg"
                >
                  <option value="10">Lớp 10</option>
                  <option value="11">Lớp 11</option>
                  <option value="12">Lớp 12</option>
                  <option value="chung">Tổng hợp</option>
                </select>
              </div>
              <div>
                <label className="block ui-caption font-medium text-slate-700 mb-1">Chủ đề</label>
                <input
                  type="text"
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 ui-input bg-white border border-slate-200 rounded-lg"
                  placeholder="Ví dụ: Nguyên hàm & Tích phân"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="flex-1 min-h-[40px] px-3 py-1.5 ui-btn font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                >
                  Xác nhận lưu
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveDrawer(false)}
                  className="min-h-[40px] px-3 py-1.5 ui-btn text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </form>
          )}

          {/* THANH CÔNG CỤ TOÁN HỌC (>= 38x38px nút, ký hiệu 18-22px, tự xuống dòng) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2.5">
              {ALL_SYMBOL_GROUPS.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveSymbolGroupId(group.id)}
                  className={`px-3 py-1.5 min-h-[38px] ui-btn font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeSymbolGroupId === group.id
                      ? 'bg-sky-600 text-white font-semibold'
                      : 'text-slate-700 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {group.name}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {activeGroup.items.map((btn) => {
                const isLastActive = lastInsertedSymbol === btn.latex;
                return (
                  <button
                    key={btn.label + btn.latex}
                    type="button"
                    title={btn.title}
                    aria-label={btn.title}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleInsertSymbol(btn.latex)}
                    className={`min-w-[42px] min-h-[40px] px-2.5 py-1.5 text-[20px] leading-none font-medium rounded-lg border transition-colors flex items-center justify-center ${
                      isLastActive
                        ? 'bg-sky-50 border-sky-500 text-sky-800'
                        : 'bg-white border-slate-200 text-slate-900 hover:border-sky-500 hover:bg-sky-50 hover:text-sky-800'
                    }`}
                  >
                    {activeSymbolGroupId === 'accents' ? <KatexRenderer latex={btn.latex === '@remove-above' ? '\\overline{P}\\to P' : btn.latex === '@remove-below' ? '\\underline{AB}\\to AB' : btn.label} /> : btn.label}
                  </button>
                );
              })}
            </div>
            {activeSymbolGroupId === 'accents' && <p className="text-sm text-slate-600">Bôi đen ký tự để thêm dấu; chọn cả biểu thức có dấu để đổi hoặc bỏ dấu.</p>}
          </div>

          {/* Input Mode Switcher + Editor & Preview Font Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  ['visual', 'Trực quan (MathLive)'],
                  ['latex', 'LaTeX'],
                  ['mathml', 'MathML'],
                  ['typst', 'Typst'],
                ] as [InputMode, string][]
              ).map(([modeKey, label]) => (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => handleSwitchMode(modeKey)}
                  className={`px-3 py-1.5 min-h-[36px] ui-btn font-medium rounded-md transition-colors whitespace-nowrap ${
                    inputMode === modeKey
                      ? 'bg-white text-sky-700 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 ui-guide text-slate-700">
                <span>Cỡ chữ soạn:</span>
                <select
                  value={editorFontSize}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setEditorFontSize(next);
                    setPreviewFontSize(Math.max(18, next - 2));
                  }}
                  className="min-h-[36px] px-2.5 py-1 bg-white border border-slate-200 rounded-lg ui-input text-slate-900 tabular-nums"
                >
                  {FORMULA_SIZE_OPTIONS.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}px
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1.5">
                <span className="ui-guide text-slate-700 mr-0.5">Màu:</span>
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setFormulaColor(c.value)}
                    className={`w-6 h-6 rounded-full border ${
                      formulaColor === c.value ? 'ring-2 ring-sky-500 ring-offset-1' : 'border-slate-300'
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setFractionDisplay((d) => (d === 'dfrac' ? 'tfrac' : 'dfrac'))}
                className="min-h-[36px] px-3 py-1 bg-white border border-slate-200 rounded-lg ui-btn text-slate-700 hover:border-sky-400 whitespace-nowrap"
              >
                Phân số: {fractionDisplay === 'dfrac' ? 'Cỡ lớn' : 'Cỡ gọn'}
              </button>

              <label className="flex items-center gap-1.5 ui-guide text-slate-700">
                <span>Số TT:</span>
                <input
                  type="text"
                  value={equationNumber}
                  onChange={(e) => setEquationNumber(e.target.value)}
                  placeholder="1"
                  className="w-16 min-h-[36px] px-2 py-1 bg-white border border-slate-200 rounded-lg ui-input text-slate-900 text-center"
                />
              </label>
            </div>
          </div>

          {/* Active Input Area (MathLive default 28px, min-height 108px, no clipping) */}
          {inputMode === 'visual' && (
            <div className="space-y-2">
              <math-field
                style={{ '--math-editor-size': `${editorFontSize}px` } as React.CSSProperties}
                ref={(node: MathfieldElement | null) => {
                  mathfieldRef.current = node;
                  if (node && node.value !== latex) {
                    node.value = latex;
                  }
                }}
              />
              <p className="ui-guide text-slate-700">
                Nhấp trực tiếp vào công thức để chỉnh sửa. Sử dụng chuột, phím mũi tên hoặc Tab để di chuyển giữa tử số, mẫu số, căn thức và số mũ.
              </p>
            </div>
          )}

          {inputMode === 'latex' && (
            <div>
              <textarea
                value={latex}
                onChange={(e) => setLatexAndSyncField(e.target.value)}
                rows={3}
                className="w-full p-3 font-mono-code ui-input bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-sky-600 focus:bg-white"
                placeholder="Nhập mã LaTeX, ví dụ: \int_0^1 x^2 \, dx = \frac{1}{3}"
              />
            </div>
          )}

          {inputMode === 'mathml' && (
            <div className="space-y-2.5">
              <textarea
                value={mathmlDraft}
                onChange={(e) => setMathmlDraft(e.target.value)}
                rows={4}
                className="w-full p-3 font-mono-code ui-guide bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-sky-600 focus:bg-white"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 ui-guide text-slate-600">
                <span>MathML được tạo đồng bộ từ biểu thức hiện tại; bạn có thể sao chép trực tiếp để dán vào Word.</span>
                <button
                  type="button"
                  onClick={handleCopyMathml}
                  className="px-3.5 min-h-[38px] bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg ui-btn font-medium"
                >
                  Chép MathML này
                </button>
              </div>
            </div>
          )}

          {inputMode === 'typst' && (
            <div className="space-y-2.5">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <textarea
                  value={typstDraft}
                  onChange={(e) => setTypstDraft(e.target.value)}
                  rows={2}
                  placeholder="Ví dụ: frac(-b +- sqrt(b^2 - 4 a c), 2 a) hoặc integral_0^oo e^(-x) dif x"
                  className="flex-1 p-3 font-mono-code ui-input bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-sky-600 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const res = typstToLatex(typstDraft);
                    setTypstWarnings(res.warnings);
                    setLatexAndSyncField(res.output);
                    onNotify('Đã chuyển cú pháp Typst sang biểu thức công thức.', 'info');
                  }}
                  className="px-4 min-h-[40px] bg-sky-600 text-white ui-btn font-semibold rounded-lg hover:bg-sky-700 shrink-0 self-start"
                >
                  Áp dụng Typst
                </button>
              </div>
              {typstWarnings.length > 0 && (
                <div className="ui-guide text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  {typstWarnings.join(' ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* PHÍA DƯỚI: XEM TRƯỚC (min 140px, 26px mặc định), KIỂM TRA OMML & XUẤT CÔNG THỨC */}
        <div className="flex-1 p-4 sm:p-5 bg-slate-50/50 space-y-4 overflow-y-auto panel-scroll">
          {/* Live Academic Preview */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="ui-guide font-medium text-slate-600">
                Xem trước công thức (Xuất Word luôn giữ chuẩn Times New Roman 13pt)
              </span>
              <label className="flex items-center gap-2 ui-caption text-slate-600">
                <span>Cỡ xem trước:</span>
                <select
                  value={previewFontSize}
                  onChange={(e) => setPreviewFontSize(Number(e.target.value))}
                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-slate-800 tabular-nums"
                >
                  {FORMULA_SIZE_OPTIONS.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}px
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              ref={previewCardRef}
              className="min-h-[144px] flex items-center justify-between gap-4 px-5 py-6 bg-[#FCFDFE] border border-slate-200 rounded-xl"
            >
              <div className="flex-1 flex justify-center overflow-x-auto py-2">
                <KatexRenderer
                  latex={effectiveLatex}
                  displayMode={true}
                  color={formulaColor}
                  fontSize={previewFontSize}
                />
              </div>
              {equationNumber.trim() && (
                <div className="font-word text-[17px] text-slate-900 shrink-0 pr-2">
                  ({equationNumber.trim()})
                </div>
              )}
            </div>

            {/* Optional Variables & Conditions Notes */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block ui-caption font-medium text-slate-600 mb-1">
                  Tên các đại lượng (khi xuất Word)
                </label>
                <input
                  type="text"
                  value={variablesNote}
                  onChange={(e) => setVariablesNote(e.target.value)}
                  placeholder="Ví dụ: F: lực (N), m: khối lượng (kg)..."
                  className="w-full min-h-[40px] px-3 py-2 ui-input bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label className="block ui-caption font-medium text-slate-600 mb-1">
                  Điều kiện áp dụng / Bảo toàn
                </label>
                <input
                  type="text"
                  value={conditionNote}
                  onChange={(e) => setConditionNote(e.target.value)}
                  placeholder="Ví dụ: a ≠ 0 hoặc điều kiện phản ứng..."
                  className="w-full min-h-[40px] px-3 py-2 ui-input bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>
          </div>

          {/* Honest OMML Compatibility Status Box */}
          <div
            className={`p-4 rounded-xl border ui-guide flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              ommlResult.supported
                ? 'bg-emerald-50/75 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {ommlResult.supported ? (
                <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold">
                  {ommlResult.supported
                    ? 'Tương thích OMML chuẩn Microsoft Word'
                    : 'Phát hiện thành phần chưa hỗ trợ OMML trực tiếp'}
                </div>
                {ommlResult.supported ? (
                  <p className="text-emerald-800 mt-0.5">
                    Công thức sẽ được đóng gói thành thẻ Equation thật (&lt;m:oMath&gt;) trong tệp .docx để giáo viên sửa trực tiếp trong Word.
                  </p>
                ) : (
                  <ul className="list-disc pl-5 mt-1 space-y-0.5 text-amber-800">
                    {ommlResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {!ommlResult.supported && effectiveLatex.trim() && (
              <button
                type="button"
                onClick={() => handleExportWordOmml(true)}
                className="px-4 min-h-[40px] bg-amber-700 text-white rounded-lg ui-btn font-semibold hover:bg-amber-800 whitespace-nowrap shrink-0"
              >
                Xuất Word bằng ảnh 300 DPI
              </button>
            )}
          </div>

          {/* Export Action Bar (38-42px buttons, 14-15px text, wraps cleanly) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
            <div className="ui-group-title text-slate-800 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-sky-600" />
              <span>Xuất và sao chép công thức</span>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => handleExportWordOmml(false)}
                className="inline-flex items-center gap-2 px-4 min-h-[40px] ui-btn font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                <span>Xuất Word (.docx OMML)</span>
              </button>

              <button
                type="button"
                onClick={handleCopyMathml}
                className="inline-flex items-center gap-2 px-3.5 min-h-[40px] ui-btn font-medium bg-white border border-slate-200 text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <ClipboardCopy className="w-4 h-4 text-sky-600" />
                <span>Sao chép MathML</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLatex}
                className="inline-flex items-center gap-2 px-3.5 min-h-[40px] ui-btn font-medium bg-white border border-slate-200 text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Copy className="w-4 h-4 text-slate-500" />
                <span>Sao chép LaTeX</span>
              </button>

              <button
                type="button"
                onClick={handleCopyTypst}
                className="inline-flex items-center gap-2 px-3.5 min-h-[40px] ui-btn font-medium bg-white border border-slate-200 text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Copy className="w-4 h-4 text-teal-600" />
                <span>Sao chép Typst</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportPng(true)}
                className="inline-flex items-center gap-2 px-3.5 min-h-[40px] ui-btn font-medium bg-white border border-slate-200 text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <ImageIcon className="w-4 h-4 text-slate-500" />
                <span>Sao chép ảnh</span>
              </button>

              <button
                type="button"
                onClick={handleSaveSvg}
                className="inline-flex items-center gap-2 px-3.5 min-h-[40px] ui-btn font-medium bg-white border border-slate-200 text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Lưu SVG</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportPng(false)}
                className="inline-flex items-center gap-2 px-3.5 min-h-[40px] ui-btn font-medium bg-white border border-slate-200 text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Lưu PNG</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onAddToDocument({
                    id: generateId('blk'),
                    type: 'formula',
                    text: formulaTitle,
                    latex: effectiveLatex,
                    ommlSupported: ommlResult.supported,
                  });
                  onNotify('Đã đưa công thức vào tài liệu Word đang soạn.', 'success');
                }}
                className="inline-flex items-center gap-2 px-3.5 min-h-[40px] ui-btn font-medium bg-teal-50 border border-teal-200 text-teal-800 rounded-lg hover:bg-teal-100 whitespace-nowrap"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Thêm vào tài liệu</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
