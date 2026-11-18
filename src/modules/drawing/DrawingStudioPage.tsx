import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Download,
  FileText,
  FolderPlus,
  Grid,
  Group,
  Image as ImageIcon,
  Layers,
  Lock,
  Magnet,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  RotateCw,
  Save,
  Search,
  Star,
  Trash2,
  Undo2,
  Ungroup,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  BarChart3,
  BookTemplate,
  Compass,
  FilePlus2,
  FunctionSquare,
  Plus,
  Table2,
} from 'lucide-react';
import {
  CanvasPagePreset,
  DocumentBlock,
  DrawingCategory,
  DrawingElement,
  DrawingProject,
  DrawingStudioMode,
  StrokeDashStyle,
} from '../../types';
import {
  DRAWING_CATEGORY_LABELS,
  DRAWING_LIBRARY_ITEMS,
  DRAWING_TEMPLATES,
  DrawingLibraryItem,
} from '../../data/drawing/drawingCatalog';
import { EXPANDED_DRAWING_PROJECTS, cloneSampleAsUserProject, drawingSubject, inferDrawingSubject } from '../../data/samples/sampleProjects';
import {
  GraphFunctionSpec,
  GraphPointSpec,
  StatChartType,
  StatDataPoint,
  VariationInterval,
  VariationNode,
  buildFunctionGraphSvgInner,
  buildStatisticalChartSvgInner,
  buildVariationTableSvgInner,
} from '../../core/math/graphEngine';
import { DrawingFormulaEditor } from './DrawingFormulaEditor';
import { formulaSvg } from './formulaSvg';
import { SvgElementRenderer, getElementAnchors } from './SvgElementRenderer';
import {
  PX_PER_CM,
  buildStandaloneSvgString,
  getContentBoundingBox,
  getElementBounds,
  renderSvgStringToPng,
} from './svgExport';
import { exportDrawingToDocxBlob } from '../../core/docx/docxEngine';
import { getActiveDocumentAdapter } from '../../adapters/wordAdapter';
import { saveDrawingProject } from '../../storage/indexedDb';
import { downloadText, generateId, matchesVietnameseQuery } from '../../utils/vietnamese';

interface DrawingStudioPageProps {
  initialProject?: DrawingProject | null;
  initialMode?: DrawingStudioMode;
  onAddToDocument: (block: DocumentBlock) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'warning') => void;
}

const PAGE_PRESETS: Record<
  Exclude<CanvasPagePreset, 'CUSTOM'>,
  { label: string; widthCm: number; heightCm: number }
> = {
  A4_PORTRAIT: { label: 'A4 Dọc (21 × 29.7 cm)', widthCm: 21, heightCm: 29.7 },
  A4_LANDSCAPE: { label: 'A4 Ngang (29.7 × 21 cm)', widthCm: 29.7, heightCm: 21 },
  A5_PORTRAIT: { label: 'A5 Dọc (14.8 × 21 cm)', widthCm: 14.8, heightCm: 21 },
  A3_LANDSCAPE: { label: 'A3 Ngang (42 × 29.7 cm)', widthCm: 42, heightCm: 29.7 },
  RATIO_16_9: { label: 'Trình chiếu 16:9 (25.4 × 14.3 cm)', widthCm: 25.4, heightCm: 14.3 },
  RATIO_4_3: { label: 'Khung 4:3 (24 × 18 cm)', widthCm: 24, heightCm: 18 },
};

function createEmptyProject(): DrawingProject {
  const now = Date.now();
  return {
    id: generateId('drw'),
    name: 'Hình vẽ khoa học mới',
    pagePreset: 'A4_LANDSCAPE',
    widthCm: 24,
    heightCm: 16,
    showGrid: true,
    snapToGrid: true,
    elements: [],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

type DragInteraction =
  | {
      mode: 'move';
      startX: number;
      startY: number;
      initialPositions: Record<string, { x: number; y: number }>;
    }
  | {
      mode: 'resize';
      elementId: string;
      handle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
      startX: number;
      startY: number;
      orig: { x: number; y: number; width: number; height: number };
    }
  | {
      mode: 'rotate';
      elementId: string;
      cx: number;
      cy: number;
      startAngle: number;
      origRotation: number;
    }
  | {
      mode: 'marquee';
      startX: number;
      startY: number;
      curX: number;
      curY: number;
    };

export const DrawingStudioPage: React.FC<DrawingStudioPageProps> = ({
  initialProject,
  initialMode = 'canvas',
  onAddToDocument,
  onNotify,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const studioWrapperRef = useRef<HTMLDivElement | null>(null);
  const jsonUploadRef = useRef<HTMLInputElement | null>(null);

  const [studioMode, setStudioMode] = useState<DrawingStudioMode>(initialMode);
  const [project, setProject] = useState<DrawingProject>(() => initialProject || createEmptyProject());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboardElements, setClipboardElements] = useState<DrawingElement[]>([]);
  const [history, setHistory] = useState<DrawingElement[][]>([]);
  const [future, setFuture] = useState<DrawingElement[][]>([]);

  // Layout panels
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  useEffect(() => { setRightOpen(selectedIds.length > 0); }, [selectedIds]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Library filters
  const [libCategory, setLibCategory] = useState<DrawingCategory | 'all'>('all');
  const [libSearch, setLibSearch] = useState('');

  // Gallery filter
  const [gallerySubject, setGallerySubject] = useState<string>('all');
  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryGrade, setGalleryGrade] = useState('all');
  const [libSubject, setLibSubject] = useState(() => inferDrawingSubject(project));
  const [galleryLimit, setGalleryLimit] = useState(24);
  useEffect(() => { setGalleryLimit(24); }, [gallerySubject, gallerySearch, galleryGrade]);
  useEffect(() => { setLibSubject(inferDrawingSubject(project)); setLibCategory('all'); setLibSearch(''); }, [project.id, project.subject]);

  // Function Graph state
  const [graphFuncs, setGraphFuncs] = useState<GraphFunctionSpec[]>([
    { id: 'f1', expr: 'x^3 - 3*x + 1', color: '#0284c7', strokeWidth: 2.3 },
    { id: 'f2', expr: '', color: '#0d9488', strokeWidth: 2 },
  ]);
  const [graphRange, setGraphRange] = useState({ xMin: -4, xMax: 4, yMin: -4, yMax: 5 });
  const [graphAsymX, setGraphAsymX] = useState('');
  const [graphAsymY, setGraphAsymY] = useState('');
  const [graphPointsRaw, setGraphPointsRaw] = useState('-1, 3, CĐ(-1;3)\n1, -1, CT(1;-1)');
  const [graphGrid, setGraphGrid] = useState(true);
  const [graphTicks, setGraphTicks] = useState(true);

  // Variation Table state
  const [varNodes, setVarNodes] = useState<VariationNode[]>([
    { xLabel: '-∞', yPrimeAtNode: '', yValueTop: '-∞', yPos: 'bot' },
    { xLabel: '-1', yPrimeAtNode: '0', yValueTop: '3', yPos: 'top' },
    { xLabel: '1', yPrimeAtNode: '0', yValueTop: '-1', yPos: 'bot' },
    { xLabel: '+∞', yPrimeAtNode: '', yValueTop: '+∞', yPos: 'top' },
  ]);
  const [varIntervals, setVarIntervals] = useState<VariationInterval[]>([
    { sign: '+', trend: 'up' },
    { sign: '-', trend: 'down' },
    { sign: '+', trend: 'up' },
  ]);

  // Statistical Chart state
  const [chartType, setChartType] = useState<StatChartType>('bar');
  const [chartTitle, setChartTitle] = useState('Phổ điểm kiểm tra giữa kì');
  const [chartColor, setChartColor] = useState('#0284c7');
  const [chartNormalParams, setChartNormalParams] = useState({ mu: 6.5, sigma: 1.4 });
  const [chartPoints, setChartPoints] = useState<StatDataPoint[]>([
    { label: 'Yếu (<5)', value: 4, x: 4 },
    { label: 'TB (5-6.5)', value: 12, x: 5.8 },
    { label: 'Khá (6.5-8)', value: 18, x: 7.2 },
    { label: 'Giỏi (≥8)', value: 9, x: 8.8 },
  ]);

  // Viewport & Export controls
  const [zoom, setZoom] = useState<number>(0.85);
  const [cropToContent, setCropToContent] = useState<boolean>(true);
  const [exportDpi, setExportDpi] = useState<96 | 150 | 300>(300);
  const [saveIndicator, setSaveIndicator] = useState<string>('Sẵn sàng');
  const [dragState, setDragState] = useState<DragInteraction | null>(null);

  const adapter = useMemo(() => getActiveDocumentAdapter(), []);

  useEffect(() => {
    setStudioMode(initialProject ? 'canvas' : initialMode);
  }, [initialMode, initialProject]);

  // Load external project when opened from Home or Projects
  useEffect(() => {
    if (initialProject) {
      setProject(initialProject);
      setStudioMode('canvas');
      setSelectedIds([]);
      setHistory([]);
      setFuture([]);
    }
  }, [initialProject]);

  const canvasWidthPx = Math.round(project.widthCm * PX_PER_CM);
  const canvasHeightPx = Math.round(project.heightCm * PX_PER_CM);

  // Auto-save to IndexedDB whenever project changes (debounced)
  const persistProjectToDb = useCallback(async (proj: DrawingProject) => {
    try {
      let thumb: string | undefined = proj.thumbnailSvg;
      if (svgRef.current) {
        const box = getContentBoundingBox(
          proj.elements,
          Math.round(proj.widthCm * PX_PER_CM),
          Math.round(proj.heightCm * PX_PER_CM),
          proj.elements.length > 0,
          12
        );
        thumb = buildStandaloneSvgString(svgRef.current, box, true);
      }
      await saveDrawingProject({ ...proj, thumbnailSvg: thumb, updatedAt: Date.now() });
      setSaveIndicator('Đã tự động lưu');
    } catch {
      setSaveIndicator('Chưa lưu được');
    }
  }, []);

  useEffect(() => {
    if (project.elements.length === 0 && project.name === 'Hình vẽ khoa học mới') return;
    setSaveIndicator('Đang lưu...');
    const timer = setTimeout(() => {
      persistProjectToDb(project);
    }, 800);
    return () => clearTimeout(timer);
  }, [project, persistProjectToDb]);

  // History helper
  const commitElements = useCallback(
    (updater: (prev: DrawingElement[]) => DrawingElement[], pushHistory = true) => {
      setProject((prev) => {
        if (pushHistory) {
          setHistory((h) => [...h.slice(-30), prev.elements]);
          setFuture([]);
        }
        return {
          ...prev,
          elements: updater(prev.elements),
          updatedAt: Date.now(),
        };
      });
    },
    []
  );

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [project.elements, ...f]);
    setProject((p) => ({ ...p, elements: previous }));
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, project.elements]);
    setProject((p) => ({ ...p, elements: next }));
  };

  // Convert client pointer position to SVG canvas coordinates
  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 200, y: 150 };
    const rect = svg.getBoundingClientRect();
    const scaleX = svg.viewBox.baseVal.width / rect.width;
    const scaleY = svg.viewBox.baseVal.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const snapValue = useCallback(
    (val: number) => (project.snapToGrid ? Math.round(val / 10) * 10 : Math.round(val)),
    [project.snapToGrid]
  );

  // Add library item
  const addItemAt = useCallback(
    (item: DrawingLibraryItem, cx?: number, cy?: number) => {
      const targetX = snapValue(cx ?? canvasWidthPx / 2 + (Math.random() * 40 - 20));
      const targetY = snapValue(cy ?? canvasHeightPx / 2 + (Math.random() * 40 - 20));
      const maxZ = project.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
      const newEl: DrawingElement = {
        id: generateId('el'),
        kind: item.kind,
        name: item.name,
        category: item.category,
        x: targetX,
        y: targetY,
        width: item.defaultWidth,
        height: item.defaultHeight,
        rotation: 0,
        fill: item.defaultFill,
        stroke: item.defaultStroke,
        strokeWidth: 1.8,
        strokeDash: 'solid',
        opacity: 1,
        locked: false,
        zIndex: maxZ + 1,
        params: { ...item.defaultParams },
      };
      commitElements((prev) => [...prev, newEl]);
      setSelectedIds([newEl.id]);
    },
    [canvasWidthPx, canvasHeightPx, project.elements, commitElements, snapValue]
  );

  const addTemplateAt = useCallback(
    (tplId: string, cx?: number, cy?: number) => {
      const tpl = DRAWING_TEMPLATES.find((t) => t.id === tplId);
      if (!tpl) return;
      const ox = snapValue(cx ?? canvasWidthPx / 2);
      const oy = snapValue(cy ?? canvasHeightPx / 2);
      const rawItems = tpl.buildElements(ox, oy);
      let nextZ = project.elements.reduce((m, el) => Math.max(m, el.zIndex), 0) + 1;
      const created: DrawingElement[] = rawItems.map((item) => ({
        ...item,
        id: generateId('el'),
        zIndex: nextZ++,
      }));
      commitElements((prev) => [...prev, ...created]);
      setSelectedIds(created.map((c) => c.id));
      onNotify(`Đã chèn hình mẫu "${tpl.name}". Bạn có thể nhấn "Rã nhóm" để chỉnh sửa từng chi tiết.`, 'info');
    },
    [canvasWidthPx, canvasHeightPx, project.elements, commitElements, snapValue, onNotify]
  );

  // Canvas pointer move / up for Drag, Resize, Rotate, Marquee
  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: PointerEvent) => {
      const pt = clientToCanvas(e.clientX, e.clientY);

      if (dragState.mode === 'move') {
        const dx = pt.x - dragState.startX;
        const dy = pt.y - dragState.startY;
        setProject((prev) => ({
          ...prev,
          elements: prev.elements.map((el) => {
            const init = dragState.initialPositions[el.id];
            if (!init || el.locked) return el;
            return {
              ...el,
              x: snapValue(init.x + dx),
              y: snapValue(init.y + dy),
            };
          }),
        }));
      } else if (dragState.mode === 'resize') {
        const dx = pt.x - dragState.startX;
        const dy = pt.y - dragState.startY;
        const { orig, handle, elementId } = dragState;
        let newW = orig.width;
        let newH = orig.height;
        let newX = orig.x;
        let newY = orig.y;

        if (handle.includes('e')) {
          newW = Math.max(20, orig.width + dx);
          newX = orig.x + (newW - orig.width) / 2;
        }
        if (handle.includes('w')) {
          newW = Math.max(20, orig.width - dx);
          newX = orig.x - (newW - orig.width) / 2;
        }
        if (handle.includes('s')) {
          newH = Math.max(20, orig.height + dy);
          newY = orig.y + (newH - orig.height) / 2;
        }
        if (handle.includes('n')) {
          newH = Math.max(20, orig.height - dy);
          newY = orig.y - (newH - orig.height) / 2;
        }

        setProject((prev) => ({
          ...prev,
          elements: prev.elements.map((el) =>
            el.id === elementId && !el.locked
              ? { ...el, x: Math.round(newX), y: Math.round(newY), width: Math.round(newW), height: Math.round(newH) }
              : el
          ),
        }));
      } else if (dragState.mode === 'rotate') {
        const curAngle = Math.atan2(pt.y - dragState.cy, pt.x - dragState.cx) * (180 / Math.PI);
        let nextRot = dragState.origRotation + (curAngle - dragState.startAngle);
        if (e.shiftKey) {
          nextRot = Math.round(nextRot / 15) * 15;
        }
        nextRot = Math.round(((nextRot % 360) + 360) % 360);
        setProject((prev) => ({
          ...prev,
          elements: prev.elements.map((el) =>
            el.id === dragState.elementId && !el.locked ? { ...el, rotation: nextRot } : el
          ),
        }));
      } else if (dragState.mode === 'marquee') {
        setDragState((d) => (d && d.mode === 'marquee' ? { ...d, curX: pt.x, curY: pt.y } : d));
      }
    };

    const handleUp = () => {
      if (dragState.mode === 'marquee') {
        const x1 = Math.min(dragState.startX, dragState.curX);
        const y1 = Math.min(dragState.startY, dragState.curY);
        const x2 = Math.max(dragState.startX, dragState.curX);
        const y2 = Math.max(dragState.startY, dragState.curY);
        if (x2 - x1 > 6 || y2 - y1 > 6) {
          const hits = project.elements
            .filter((el) => {
              const b = getElementBounds(el);
              return b.maxX >= x1 && b.minX <= x2 && b.maxY >= y1 && b.minY <= y2;
            })
            .map((el) => el.id);
          setSelectedIds(hits);
        }
      }
      setDragState(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState, clientToCanvas, snapValue, project.elements]);

  // Keyboard shortcuts (Delete, Ctrl+Z, Ctrl+D, Ctrl+C, Ctrl+V)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (studioMode !== 'canvas') return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT', 'MATH-FIELD'].includes(target.tagName) || target.closest('[data-formula-editor]') || target.isContentEditable)) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        commitElements((prev) => prev.filter((el) => !selectedIds.includes(el.id) || el.locked));
        setSelectedIds([]);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedIds.length > 0) {
        e.preventDefault();
        handleDuplicateSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedIds.length > 0) {
        e.preventDefault();
        const copied = project.elements.filter((el) => selectedIds.includes(el.id));
        setClipboardElements(copied);
        onNotify(`Đã sao chép ${copied.length} đối tượng.`, 'info');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboardElements.length > 0) {
        e.preventDefault();
        let maxZ = project.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
        const pasted = clipboardElements.map((el) => ({
          ...el,
          id: generateId('el'),
          x: el.x + 24,
          y: el.y + 24,
          locked: false,
          groupId: undefined,
          zIndex: ++maxZ,
          params: { ...el.params },
        }));
        commitElements((prev) => [...prev, ...pasted]);
        setSelectedIds(pasted.map((p) => p.id));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Selection helpers
  const selectedElements = useMemo(
    () => project.elements.filter((el) => selectedIds.includes(el.id)),
    [project.elements, selectedIds]
  );
  const primarySelected = selectedElements.length === 1 ? selectedElements[0] : null;

  const updateSelectedElements = (
    patchFn: (el: DrawingElement) => DrawingElement,
    pushHistory = false
  ) => {
    commitElements(
      (prev) => prev.map((el) => (selectedIds.includes(el.id) ? patchFn(el) : el)),
      pushHistory
    );
  };

  const handleDuplicateSelected = () => {
    if (selectedElements.length === 0) return;
    let maxZ = project.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
    const clones: DrawingElement[] = selectedElements.map((el) => ({
      ...el,
      id: generateId('el'),
      x: el.x + 20,
      y: el.y + 20,
      locked: false,
      groupId: undefined,
      zIndex: ++maxZ,
      params: { ...el.params },
    }));
    commitElements((prev) => [...prev, ...clones]);
    setSelectedIds(clones.map((c) => c.id));
  };

  const handleGroupSelected = () => {
    if (selectedIds.length < 2) return;
    const gid = generateId('grp');
    updateSelectedElements((el) => ({ ...el, groupId: gid }), true);
    onNotify('Đã nhóm các đối tượng đã chọn.', 'info');
  };

  const handleUngroupSelected = () => {
    const groupIds = new Set(selectedElements.map((e) => e.groupId).filter(Boolean));
    if (groupIds.size === 0) return;
    commitElements(
      (prev) => prev.map((el) => (el.groupId && groupIds.has(el.groupId) ? { ...el, groupId: undefined } : el)),
      true
    );
    onNotify('Đã rã nhóm. Bạn có thể chọn và chỉnh sửa từng thành phần.', 'info');
  };

  const handleAlign = (dir: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom') => {
    if (selectedElements.length < 2) return;
    const boundsList = selectedElements.map((el) => ({ el, b: getElementBounds(el) }));
    const minX = Math.min(...boundsList.map((x) => x.b.minX));
    const maxX = Math.max(...boundsList.map((x) => x.b.maxX));
    const minY = Math.min(...boundsList.map((x) => x.b.minY));
    const maxY = Math.max(...boundsList.map((x) => x.b.maxY));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    commitElements((prev) =>
      prev.map((el) => {
        if (!selectedIds.includes(el.id) || el.locked) return el;
        const b = getElementBounds(el);
        const w = b.maxX - b.minX;
        const h = b.maxY - b.minY;
        if (dir === 'left') return { ...el, x: Math.round(minX + w / 2) };
        if (dir === 'centerX') return { ...el, x: Math.round(midX) };
        if (dir === 'right') return { ...el, x: Math.round(maxX - w / 2) };
        if (dir === 'top') return { ...el, y: Math.round(minY + h / 2) };
        if (dir === 'centerY') return { ...el, y: Math.round(midY) };
        return { ...el, y: Math.round(maxY - h / 2) };
      })
    );
  };

  const handleZOrder = (direction: 'front' | 'back') => {
    if (selectedIds.length === 0) return;
    const maxZ = project.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
    const minZ = project.elements.reduce((m, el) => Math.min(m, el.zIndex), 0);
    updateSelectedElements(
      (el) => ({ ...el, zIndex: direction === 'front' ? maxZ + 1 : minZ - 1 }),
      true
    );
  };

  const handleFitContent = () => {
    if (!canvasScrollRef.current) return;
    const box = canvasScrollRef.current.getBoundingClientRect();
    const zx = (box.width - 48) / canvasWidthPx;
    const zy = (box.height - 48) / canvasHeightPx;
    setZoom(Math.max(0.35, Math.min(1.5, Number(Math.min(zx, zy).toFixed(2)))));
  };

  // Export handlers
  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const box = getContentBoundingBox(project.elements, canvasWidthPx, canvasHeightPx, cropToContent);
    const svgStr = buildStandaloneSvgString(svgRef.current, box, true);
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/gi, '_') || 'hinh_ve';
    downloadText(svgStr, `${slug}.svg`, 'image/svg+xml;charset=utf-8');
    onNotify('Đã xuất tệp vector SVG.', 'success');
  };

  const handleExportPng = async (transparent: boolean, copyOnly = false) => {
    if (!svgRef.current) return;
    const box = getContentBoundingBox(project.elements, canvasWidthPx, canvasHeightPx, cropToContent);
    const svgStr = buildStandaloneSvgString(svgRef.current, box, !transparent);
    try {
      const { blob } = await renderSvgStringToPng(svgStr, box.width, box.height, exportDpi);
      if (copyOnly) {
        const res = await adapter.copyImageToClipboard(blob);
        onNotify(res.message, 'success');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name.replace(/\s+/g, '_')}_${exportDpi}dpi.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        onNotify(`Đã xuất ảnh PNG (${exportDpi} DPI${transparent ? ', nền trong suốt' : ''}).`, 'success');
      }
    } catch {
      onNotify('Không thể xuất ảnh PNG từ bảng vẽ.', 'warning');
    }
  };

  const handleExportDocx = async () => {
    if (!svgRef.current) return;
    const box = getContentBoundingBox(project.elements, canvasWidthPx, canvasHeightPx, cropToContent);
    const svgStr = buildStandaloneSvgString(svgRef.current, box, true);
    const { dataUrl, pixelWidth, pixelHeight } = await renderSvgStringToPng(
      svgStr,
      box.width,
      box.height,
      exportDpi
    );
    const blob = await exportDrawingToDocxBlob({
      title: project.name,
      pngDataUrl: dataUrl,
      widthPx: Math.round(pixelWidth / (exportDpi / 96)),
      heightPx: Math.round(pixelHeight / (exportDpi / 96)),
      caption: project.description,
    });
    const res = await adapter.exportDocxFile(blob, `${project.name.replace(/\s+/g, '_')}.docx`);
    onNotify(res.message, 'success');
  };

  const handleAddDrawingToDocument = async () => {
    if (!svgRef.current) return;
    const box = getContentBoundingBox(project.elements, canvasWidthPx, canvasHeightPx, cropToContent);
    const svgStr = buildStandaloneSvgString(svgRef.current, box, true);
    const { dataUrl } = await renderSvgStringToPng(svgStr, box.width, box.height, 150);
    onAddToDocument({
      id: generateId('blk'),
      type: 'drawing',
      drawingId: project.id,
      drawingName: project.name,
      svgContent: svgStr,
      pngDataUrl: dataUrl,
    });
    onNotify(`Đã đưa hình vẽ "${project.name}" vào tài liệu Word đang soạn.`, 'success');
  };

  const handleExportJson = () => {
    downloadText(JSON.stringify(project, null, 2), `${project.name.replace(/\s+/g, '_')}.smartdraw.json`, 'application/json');
    onNotify('Đã lưu dự án dạng tệp JSON (giữ nguyên toàn bộ đối tượng và tham số).', 'success');
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as DrawingProject;
      if (!parsed || !Array.isArray(parsed.elements)) {
        throw new Error('Cấu trúc tệp dự án không hợp lệ.');
      }
      setProject({ ...parsed, updatedAt: Date.now() });
      setStudioMode('canvas');
      setHistory([]); setFuture([]);
      setSelectedIds([]);
      onNotify(`Đã mở dự án "${parsed.name}".`, 'success');
    } catch {
      onNotify('Không đọc được tệp dự án JSON này.', 'warning');
    } finally {
      e.target.value = '';
    }
  };

  // Filtered Library Items
  const filteredLibItems = useMemo(() => {
    return DRAWING_LIBRARY_ITEMS.filter((item) => {
      const subject = drawingSubject(item.category,item.kind);
      if (!['toan','vat_li','hoa_hoc'].includes(subject) && item.category !== 'co_ban') return false;
      if (libSubject !== 'all' && subject !== libSubject && item.category !== 'co_ban') return false;
      if (libCategory !== 'all' && libCategory !== 'hinh_mau' && item.category !== libCategory) {
        return false;
      }
      if (libCategory === 'hinh_mau') return false;
      return matchesVietnameseQuery(libSearch, [item.name, item.kind]);
    });
  }, [libCategory, libSearch, libSubject]);

  const filteredTemplates = useMemo(() => {
    if (libCategory !== 'all' && libCategory !== 'hinh_mau') return [];
    return DRAWING_TEMPLATES.filter((t) => (t.buildElements(0,0).every(el => ['toan','vat_li','hoa_hoc','chung'].includes(drawingSubject(el.category,el.kind))) && (libSubject === 'all' || t.buildElements(0,0).some(el => drawingSubject(el.category,el.kind) === libSubject))) && matchesVietnameseQuery(libSearch, [t.name, t.description]));
  }, [libCategory, libSearch, libSubject]);

  const sortedElements = useMemo(
    () => [...project.elements].sort((a, b) => a.zIndex - b.zIndex),
    [project.elements]
  );

  // Electrical snap anchors rendered lightly when moving electric items
  const visibleAnchors = useMemo(() => {
    if (!dragState || dragState.mode !== 'move') return [];
    return project.elements
      .filter((el) => el.category === 'ly_dien')
      .flatMap((el) => getElementAnchors(el));
  }, [dragState, project.elements]);

  // Computed SVGs for Graph / Variation / Chart modes
  const parsedGraphPoints: GraphPointSpec[] = useMemo(() => {
    return graphPointsRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [xs, ys, label] = line.split(',').map((s) => s.trim());
        const x = Number(xs);
        const y = Number(ys);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y, label: label || undefined, color: '#dc2626' };
      })
      .filter(Boolean) as GraphPointSpec[];
  }, [graphPointsRaw]);

  const generatedGraphInner = useMemo(() => {
    const axList = graphAsymX
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && graphAsymX.trim() !== '');
    const ayList = graphAsymY
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && graphAsymY.trim() !== '');
    return buildFunctionGraphSvgInner({
      width: 460,
      height: 360,
      xMin: graphRange.xMin,
      xMax: graphRange.xMax,
      yMin: graphRange.yMin,
      yMax: graphRange.yMax,
      showGrid: graphGrid,
      showTicks: graphTicks,
      functions: graphFuncs.filter((f) => f.expr.trim().length > 0),
      asymptotesX: axList,
      asymptotesY: ayList,
      points: parsedGraphPoints,
    });
  }, [graphFuncs, graphRange, graphAsymX, graphAsymY, parsedGraphPoints, graphGrid, graphTicks]);

  const generatedVariationInner = useMemo(
    () => buildVariationTableSvgInner({ nodes: varNodes, intervals: varIntervals }, 580, 220),
    [varNodes, varIntervals]
  );

  const generatedChartInner = useMemo(
    () =>
      buildStatisticalChartSvgInner(chartType, chartTitle, chartPoints, {
        width: 500,
        height: 320,
        color: chartColor,
        mu: chartNormalParams.mu,
        sigma: chartNormalParams.sigma,
      }),
    [chartType, chartTitle, chartPoints, chartColor, chartNormalParams]
  );

  const insertEmbeddedSvgToCanvas = (
    name: string,
    svgInner: string,
    w: number,
    h: number
  ) => {
    const maxZ = project.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
    const el: DrawingElement = {
      id: generateId('el'),
      kind: 'embedded_svg',
      name,
      category: 'toan_phang',
      x: Math.round(canvasWidthPx / 2),
      y: Math.round(canvasHeightPx / 2),
      width: w,
      height: h,
      rotation: 0,
      fill: '#ffffff',
      stroke: '#0f172a',
      strokeWidth: 1.5,
      strokeDash: 'solid',
      opacity: 1,
      locked: false,
      zIndex: maxZ + 1,
      params: {
        embeddedSvgInner: svgInner,
        embeddedViewBox: `0 0 ${w} ${h}`,
      },
    };
    commitElements((prev) => [...prev, el]);
    setSelectedIds([el.id]);
    setStudioMode('canvas');
    onNotify(`Đã chèn "${name}" vào Bảng vẽ kéo thả.`, 'success');
  };

  const exportGeneratedSvgPackage = async (
    name: string,
    svgInner: string,
    w: number,
    h: number,
    format: 'svg' | 'png' | 'docx' | 'doc'
  ) => {
    const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#ffffff"/>${svgInner}</svg>`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/gi, '_') || 'hinh_toan';
    if (format === 'svg') {
      downloadText(fullSvg, `${slug}.svg`, 'image/svg+xml;charset=utf-8');
      onNotify(`Đã tải xuống SVG "${name}".`, 'success');
      return;
    }
    const { blob, dataUrl, pixelWidth, pixelHeight } = await renderSvgStringToPng(fullSvg, w, h, 300);
    if (format === 'png') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}_300dpi.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onNotify(`Đã tải xuống PNG 300 DPI "${name}".`, 'success');
      return;
    }
    if (format === 'doc') {
      onAddToDocument({
        id: generateId('blk'),
        type: 'drawing',
        drawingId: generateId('gen'),
        drawingName: name,
        svgContent: fullSvg,
        pngDataUrl: dataUrl,
      });
      onNotify(`Đã thêm "${name}" vào tài liệu Word đang soạn.`, 'success');
      return;
    }
    const docBlob = await exportDrawingToDocxBlob({
      title: name,
      pngDataUrl: dataUrl,
      widthPx: Math.round(pixelWidth / (300 / 96)),
      heightPx: Math.round(pixelHeight / (300 / 96)),
    });
    const res = await adapter.exportDocxFile(docBlob, `${slug}.docx`);
    onNotify(res.message, 'success');
  };

  const galleryResults = EXPANDED_DRAWING_PROJECTS.filter(s => (gallerySubject === 'all' || s.subject === gallerySubject) && (galleryGrade === 'all' || s.grade === galleryGrade || s.grade === 'chung') && matchesVietnameseQuery(gallerySearch,[s.name,s.topic,s.description || '']));
  useEffect(() => {
    if (studioMode !== 'canvas') return;
    const frame = requestAnimationFrame(() => { handleFitContent(); });
    return () => cancelAnimationFrame(frame);
  }, [studioMode, project.id]);

  const modeTabs: { id: DrawingStudioMode; label: string; icon: React.ReactNode }[] = [
    { id: 'canvas', label: 'Bảng vẽ kéo thả', icon: <Compass className="w-4 h-4" /> },
    { id: 'gallery', label: `Kho hình mẫu (${EXPANDED_DRAWING_PROJECTS.length})`, icon: <BookTemplate className="w-4 h-4" /> },
    { id: 'graph', label: 'Đồ thị hàm số', icon: <FunctionSquare className="w-4 h-4" /> },
    { id: 'variation', label: 'Bảng biến thiên', icon: <Table2 className="w-4 h-4" /> },
    { id: 'chart', label: 'Biểu đồ thống kê', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div
      ref={studioWrapperRef}
      className={`flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs ${
        isFullscreen ? 'fixed inset-2 z-50' : 'min-h-[calc(100vh-112px)]'
      }`}
    >
      <input ref={jsonUploadRef} type="file" accept=".json,.smartdraw.json" onChange={handleImportJson} className="hidden" />
      {/* MODE SWITCHER BAR */}
      <div className="px-3.5 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {modeTabs.map((t) => {
            const active = studioMode === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setStudioMode(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-lg ui-btn font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="ui-caption text-slate-500">
          {studioMode === 'canvas'
            ? 'Mẹo: Ctrl+C / Ctrl+V để sao chép nhanh · Giữ Shift để chọn nhiều hình'
            : 'Xuất SVG/PNG 300 DPI/DOCX hoặc nhấn "Chèn vào Bảng vẽ" để ghép nhiều hình'}
        </div>
      </div>

      {/* MODE 2: KHO HÌNH MẪU (12) */}
      {studioMode === 'gallery' && (
        <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-slate-50/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="ui-section-title text-slate-900">Kho hình vẽ khoa học</h2>
              <p className="ui-guide text-slate-600">
                Chọn bất kì mẫu nào để mở bản sao chỉnh sửa trực tiếp trên Bảng vẽ kéo thả.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ['all', 'Tất cả'], ['toan', 'Toán học'], ['vat_li', 'Vật lí'], ['hoa_hoc', 'Hóa học'],
              ].map(([sub, lbl]) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setGallerySubject(sub)}
                  className={`px-3 min-h-[38px] rounded-lg ui-btn border ${
                    gallerySubject === sub
                      ? 'bg-sky-600 text-white border-sky-600 font-semibold'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {lbl} ({EXPANDED_DRAWING_PROJECTS.filter(s => sub === 'all' || s.subject === sub).length})
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <input value={gallerySearch} onChange={e=>setGallerySearch(e.target.value)} placeholder="Tìm hình, chủ đề, dụng cụ..." className="flex-1 min-w-[200px] border rounded-lg p-3" />
            <select value={galleryGrade} onChange={e=>setGalleryGrade(e.target.value)} className="border rounded-lg p-3" aria-label="Khối lớp"><option value="all">Mọi khối lớp</option><option value="10">Lớp 10</option><option value="11">Lớp 11</option><option value="12">Lớp 12</option></select>
            <button className="bg-sky-600 text-white rounded-lg p-3" onClick={()=>{setProject(createEmptyProject());setSelectedIds([]);setHistory([]);setFuture([]);setStudioMode('canvas');}}>Tạo hình mới</button>
            <button className="border rounded-lg p-3" onClick={()=>jsonUploadRef.current?.click()}>Mở dự án từ tệp</button>
          </div>
          <p className="ui-guide">{galleryResults.length} hình phù hợp · Mẫu không phân khối được hiển thị ở mọi khối lớp.</p>
          {galleryResults.length === 0 && <p>Không tìm thấy hình phù hợp. Hãy đổi từ khóa hoặc bộ lọc.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {galleryResults.slice(0,galleryLimit).map((sample) => {
              const vw = Math.round(sample.widthCm * PX_PER_CM);
              const vh = Math.round(sample.heightCm * PX_PER_CM);
              const bounds = getContentBoundingBox(sample.elements,vw,vh,true,20);
              return (
                <div
                  key={sample.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-sky-400 transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="h-44 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center p-2 overflow-hidden">
                      <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} className="max-w-full max-h-full">
                        {sample.elements.map((el) => (
                          <SvgElementRenderer key={el.id} element={el} uniqueSuffix={`gal_${sample.id}`} />
                        ))}
                      </svg>
                    </div>
                    <div className="ui-formula-name text-slate-900">{sample.name}</div>
                    <div className="ui-caption text-slate-600">{sample.description}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const cloned = cloneSampleAsUserProject(sample);
                      setProject(cloned);
                      setHistory([]); setFuture([]);
                      setSelectedIds([]);
                      setStudioMode('canvas');
                      onNotify(`Đã mở bản sao "${sample.name}" để chỉnh sửa.`, 'success');
                    }}
                    className="w-full min-h-[40px] px-4 py-2 bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700"
                  >
                    Mở chỉnh sửa trong Bảng vẽ
                  </button>
                </div>
              );
            })}
          </div>
          {galleryLimit < galleryResults.length && <button className="border rounded-lg p-3" onClick={()=>setGalleryLimit(n=>n+24)}>Xem thêm hình</button>}
        </div>
      )}

      {/* MODE 3: ĐỒ THỊ HÀM SỐ */}
      {studioMode === 'graph' && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 bg-slate-50/40">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <h2 className="ui-section-title text-slate-900">Thiết lập đồ thị hàm số y = f(x)</h2>
            {graphFuncs.map((fn, idx) => (
              <div key={fn.id} className="flex items-center gap-2">
                <span className="ui-guide font-semibold text-slate-700 w-12">y{idx + 1} =</span>
                <input
                  type="text"
                  value={fn.expr}
                  onChange={(e) =>
                    setGraphFuncs((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, expr: e.target.value } : item))
                    )
                  }
                  placeholder="VD: (2*x - 1)/(x - 1) hoặc x < 0 ? -x : x^2"
                  className="flex-1 min-h-[38px] px-3 py-1.5 ui-input font-mono-code border border-slate-200 rounded-lg"
                />
                <input
                  type="color"
                  value={fn.color}
                  onChange={(e) =>
                    setGraphFuncs((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, color: e.target.value } : item))
                    )
                  }
                  className="w-9 h-9 border border-slate-200 rounded cursor-pointer"
                />
              </div>
            ))}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(
                [
                  ['xMin', 'x min'],
                  ['xMax', 'x max'],
                  ['yMin', 'y min'],
                  ['yMax', 'y max'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="block">
                  <span className="ui-caption text-slate-600">{label}</span>
                  <input
                    type="number"
                    value={graphRange[k]}
                    onChange={(e) => setGraphRange((r) => ({ ...r, [k]: Number(e.target.value) }))}
                    className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg tabular-nums"
                  />
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="block">
                <span className="ui-caption text-slate-600">Tiệm cận đứng x = (phẩy cách)</span>
                <input
                  type="text"
                  value={graphAsymX}
                  onChange={(e) => setGraphAsymX(e.target.value)}
                  placeholder="VD: 1"
                  className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg"
                />
              </label>
              <label className="block">
                <span className="ui-caption text-slate-600">Tiệm cận ngang y = (phẩy cách)</span>
                <input
                  type="text"
                  value={graphAsymY}
                  onChange={(e) => setGraphAsymY(e.target.value)}
                  placeholder="VD: 2"
                  className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg"
                />
              </label>
            </div>

            <label className="block">
              <span className="ui-caption text-slate-600">Điểm đặc biệt (mỗi dòng: x, y, Nhãn)</span>
              <textarea
                rows={3}
                value={graphPointsRaw}
                onChange={(e) => setGraphPointsRaw(e.target.value)}
                className="w-full mt-1 p-2.5 ui-input font-mono-code border border-slate-200 rounded-lg"
              />
            </label>

            <div className="flex flex-wrap gap-4 ui-guide text-slate-800">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={graphGrid} onChange={(e) => setGraphGrid(e.target.checked)} />
                <span>Hiện lưới tọa độ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={graphTicks} onChange={(e) => setGraphTicks(e.target.checked)} />
                <span>Hiện số chia trục</span>
              </label>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
            <div className="flex-1 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl p-4">
              <svg viewBox="0 0 460 360" className="w-full max-w-[460px] bg-white border border-slate-200 rounded-lg">
                <g dangerouslySetInnerHTML={{ __html: generatedGraphInner }} />
              </svg>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => insertEmbeddedSvgToCanvas('Đồ thị hàm số', generatedGraphInner, 460, 360)}
                className="inline-flex items-center gap-2 px-4 min-h-[40px] bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>Chèn vào Bảng vẽ</span>
              </button>
              <button
                type="button"
                onClick={() => exportGeneratedSvgPackage('Đồ thị hàm số', generatedGraphInner, 460, 360, 'docx')}
                className="px-4 min-h-[40px] bg-teal-50 border border-teal-200 text-teal-800 rounded-lg ui-btn font-medium hover:bg-teal-100"
              >
                Xuất Word (.docx)
              </button>
              <button
                type="button"
                onClick={() => exportGeneratedSvgPackage('Đồ thị hàm số', generatedGraphInner, 460, 360, 'png')}
                className="px-3.5 min-h-[40px] bg-white border border-slate-200 text-slate-800 rounded-lg ui-btn hover:bg-slate-50"
              >
                Tải PNG 300 DPI
              </button>
              <button
                type="button"
                onClick={() => exportGeneratedSvgPackage('Đồ thị hàm số', generatedGraphInner, 460, 360, 'svg')}
                className="px-3.5 min-h-[40px] bg-white border border-slate-200 text-slate-800 rounded-lg ui-btn hover:bg-slate-50"
              >
                Tải SVG
              </button>
              <button
                type="button"
                onClick={() => exportGeneratedSvgPackage('Đồ thị hàm số', generatedGraphInner, 460, 360, 'doc')}
                className="px-3.5 min-h-[40px] bg-white border border-slate-200 text-slate-800 rounded-lg ui-btn hover:bg-slate-50"
              >
                Thêm vào tài liệu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODE 4: BẢNG BIẾN THIÊN */}
      {studioMode === 'variation' && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 bg-slate-50/40">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="ui-section-title text-slate-900">Cấu trúc bảng biến thiên</h2>
              <button
                type="button"
                onClick={() => {
                  const insertAt = Math.max(1, varNodes.length - 1);
                  setVarNodes((prev) => [
                    ...prev.slice(0, insertAt),
                    { xLabel: '2', yPrimeAtNode: '0', yValueTop: '0', yPos: 'mid' },
                    ...prev.slice(insertAt),
                  ]);
                  setVarIntervals((prev) => [...prev, { sign: '+', trend: 'up' }]);
                }}
                className="inline-flex items-center gap-1 px-3 min-h-[36px] bg-sky-50 border border-sky-200 text-sky-700 rounded-lg ui-btn font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm mốc x</span>
              </button>
            </div>

            <div className="space-y-2.5 max-h-[340px] overflow-y-auto panel-scroll pr-1">
              {varNodes.map((node, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between ui-caption font-semibold text-slate-700">
                    <span>Mốc {idx + 1}</span>
                    {varNodes.length > 2 && idx > 0 && idx < varNodes.length - 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setVarNodes((p) => p.filter((_, i) => i !== idx));
                          setVarIntervals((p) => p.filter((_, i) => i !== idx - 1));
                        }}
                        className="text-red-600 hover:underline"
                      >
                        Xóa mốc
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={node.xLabel}
                      onChange={(e) =>
                        setVarNodes((p) => p.map((n, i) => (i === idx ? { ...n, xLabel: e.target.value } : n)))
                      }
                      placeholder="x"
                      className="min-h-[34px] px-2 border border-slate-200 rounded bg-white ui-input"
                    />
                    <select
                      value={node.yPrimeAtNode}
                      onChange={(e) =>
                        setVarNodes((p) =>
                          p.map((n, i) =>
                            i === idx ? { ...n, yPrimeAtNode: e.target.value as VariationNode['yPrimeAtNode'] } : n
                          )
                        )
                      }
                      className="min-h-[34px] px-2 border border-slate-200 rounded bg-white ui-input"
                    >
                      <option value="">Trống (y')</option>
                      <option value="0">0 (y' = 0)</option>
                      <option value="||">|| (Không XĐ)</option>
                    </select>
                    <select
                      value={node.yPos}
                      onChange={(e) =>
                        setVarNodes((p) =>
                          p.map((n, i) => (i === idx ? { ...n, yPos: e.target.value as VariationNode['yPos'] } : n))
                        )
                      }
                      className="min-h-[34px] px-2 border border-slate-200 rounded bg-white ui-input"
                    >
                      <option value="top">y ở trên</option>
                      <option value="mid">y ở giữa</option>
                      <option value="bot">y ở dưới</option>
                      <option value="asymptote">2 giới hạn ||</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={node.yValueTop || ''}
                      onChange={(e) =>
                        setVarNodes((p) => p.map((n, i) => (i === idx ? { ...n, yValueTop: e.target.value } : n)))
                      }
                      placeholder={node.yPos === 'asymptote' ? 'Giới hạn trái ||' : 'Giá trị y'}
                      className="min-h-[34px] px-2 border border-slate-200 rounded bg-white ui-input"
                    />
                    {node.yPos === 'asymptote' && (
                      <input
                        type="text"
                        value={node.yValueBot || ''}
                        onChange={(e) =>
                          setVarNodes((p) => p.map((n, i) => (i === idx ? { ...n, yValueBot: e.target.value } : n)))
                        }
                        placeholder="Giới hạn phải ||"
                        className="min-h-[34px] px-2 border border-slate-200 rounded bg-white ui-input"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="ui-caption font-semibold text-slate-700">Dấu đạo hàm & Chiều biến thiên từng khoảng</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {varIntervals.map((intv, idx) => (
                  <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-1.5">
                    <span className="ui-caption text-slate-500">K{idx + 1}:</span>
                    <select
                      value={intv.sign}
                      onChange={(e) =>
                        setVarIntervals((p) =>
                          p.map((it, i) => (i === idx ? { ...it, sign: e.target.value as '+' | '-' } : it))
                        )
                      }
                      className="min-h-[32px] px-1.5 border border-slate-200 rounded bg-white"
                    >
                      <option value="+">+</option>
                      <option value="-">-</option>
                    </select>
                    <select
                      value={intv.trend}
                      onChange={(e) =>
                        setVarIntervals((p) =>
                          p.map((it, i) => (i === idx ? { ...it, trend: e.target.value as 'up' | 'down' } : it))
                        )
                      }
                      className="min-h-[32px] px-1.5 border border-slate-200 rounded bg-white flex-1"
                    >
                      <option value="up">↗ Tăng</option>
                      <option value="down">↘ Giảm</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
            <div className="flex-1 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl p-4">
              <svg viewBox="0 0 580 220" className="w-full max-w-[580px] bg-white border border-slate-200 rounded-lg">
                <g dangerouslySetInnerHTML={{ __html: generatedVariationInner }} />
              </svg>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => insertEmbeddedSvgToCanvas('Bảng biến thiên', generatedVariationInner, 580, 220)}
                className="inline-flex items-center gap-2 px-4 min-h-[40px] bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>Chèn vào Bảng vẽ</span>
              </button>
              <button
                type="button"
                onClick={() => exportGeneratedSvgPackage('Bảng biến thiên', generatedVariationInner, 580, 220, 'docx')}
                className="px-4 min-h-[40px] bg-teal-50 border border-teal-200 text-teal-800 rounded-lg ui-btn font-medium hover:bg-teal-100"
              >
                Xuất Word (.docx)
              </button>
              <button
                type="button"
                onClick={() => exportGeneratedSvgPackage('Bảng biến thiên', generatedVariationInner, 580, 220, 'png')}
                className="px-3.5 min-h-[40px] bg-white border border-slate-200 text-slate-800 rounded-lg ui-btn hover:bg-slate-50"
              >
                Tải PNG 300 DPI
              </button>
              <button
                type="button"
                onClick={() => exportGeneratedSvgPackage('Bảng biến thiên', generatedVariationInner, 580, 220, 'svg')}
                className="px-3.5 min-h-[40px] bg-white border border-slate-200 text-slate-800 rounded-lg ui-btn hover:bg-slate-50"
              >
                Tải SVG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODE 5: BIỂU ĐỒ THỐNG KÊ */}
      {studioMode === 'chart' && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 bg-slate-50/40">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <h2 className="ui-section-title text-slate-900">Biểu đồ thống kê & Xác suất</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="ui-caption text-slate-600">Loại biểu đồ</span>
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value as StatChartType)}
                  className="w-full mt-1 min-h-[38px] px-2.5 border border-slate-200 rounded-lg bg-white ui-input"
                >
                  <option value="bar">Biểu đồ cột (Bar)</option>
                  <option value="line">Biểu đồ đường (Line)</option>
                  <option value="pie">Biểu đồ quạt tròn (Pie)</option>
                  <option value="histogram">Biểu đồ tần số ghép nhóm (Histogram)</option>
                  <option value="boxplot">Biểu đồ hộp Boxplot (Tứ phân vị)</option>
                  <option value="scatter">Phân tán Scatter + Hồi quy</option>
                  <option value="normal">Phân phối chuẩn Gauss N(μ, σ²)</option>
                </select>
              </label>

              <label className="block">
                <span className="ui-caption text-slate-600">Màu chủ đạo</span>
                <input
                  type="color"
                  value={chartColor}
                  onChange={(e) => setChartColor(e.target.value)}
                  className="w-full mt-1 h-[38px] border border-slate-200 rounded-lg cursor-pointer"
                />
              </label>
            </div>

            <label className="block">
              <span className="ui-caption text-slate-600">Tiêu đề biểu đồ</span>
              <input
                type="text"
                value={chartTitle}
                onChange={(e) => setChartTitle(e.target.value)}
                className="w-full mt-1 min-h-[38px] px-3 py-1.5 border border-slate-200 rounded-lg ui-input"
              />
            </label>

            {chartType === 'normal' ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="ui-caption text-slate-600">Trung bình μ</span>
                  <input
                    type="number"
                    step={0.5}
                    value={chartNormalParams.mu}
                    onChange={(e) => setChartNormalParams((p) => ({ ...p, mu: Number(e.target.value) }))}
                    className="w-full mt-1 min-h-[38px] px-3 border border-slate-200 rounded-lg ui-input"
                  />
                </label>
                <label className="block">
                  <span className="ui-caption text-slate-600">Độ lệch chuẩn σ</span>
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    value={chartNormalParams.sigma}
                    onChange={(e) => setChartNormalParams((p) => ({ ...p, sigma: Math.max(0.2, Number(e.target.value)) }))}
                    className="w-full mt-1 min-h-[38px] px-3 border border-slate-200 rounded-lg ui-input"
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="ui-caption font-semibold text-slate-700">Bảng số liệu</span>
                  <button
                    type="button"
                    onClick={() => setChartPoints((p) => [...p, { label: `Mục ${p.length + 1}`, value: 10, x: p.length + 1 }])}
                    className="px-2.5 py-1 bg-sky-50 border border-sky-200 text-sky-700 rounded-lg ui-caption font-medium"
                  >
                    + Thêm dòng
                  </button>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto panel-scroll">
                  {chartPoints.map((pt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={pt.label}
                        onChange={(e) =>
                          setChartPoints((p) => p.map((d, i) => (i === idx ? { ...d, label: e.target.value } : d)))
                        }
                        className="flex-1 min-h-[34px] px-2 border border-slate-200 rounded bg-white ui-input"
                      />
                      {chartType === 'scatter' && (
                        <input
                          type="number"
                          value={pt.x ?? idx + 1}
                          onChange={(e) =>
                            setChartPoints((p) => p.map((d, i) => (i === idx ? { ...d, x: Number(e.target.value) } : d)))
                          }
                          placeholder="X"
                          className="w-20 min-h-[34px] px-2 border border-slate-200 rounded bg-white ui-input tabular-nums"
                        />
                      )}
                      <input
                        type="number"
                        value={pt.value}
                        onChange={(e) =>
                          setChartPoints((p) => p.map((d, i) => (i === idx ? { ...d, value: Number(e.target.value) } : d)))
                        }
                        className="w-24 min-h-[34px] px-2 border border-slate-200 rounded bg-white ui-input tabular-nums"
                      />
                      {chartPoints.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setChartPoints((p) => p.filter((_, i) => i !== idx))}
                          className="p-1.5 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
            <div className="flex-1 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl p-4">
              <svg viewBox="0 0 500 320" className="w-full max-w-[500px] bg-white border border-slate-200 rounded-lg">
                <g dangerouslySetInnerHTML={{ __html: generatedChartInner }} />
              </svg>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => insertEmbeddedSvgToCanvas(chartTitle || 'Biểu đồ thống kê', generatedChartInner, 500, 320)}
                className="inline-flex items-center gap-2 px-4 min-h-[40px] bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>Chèn vào Bảng vẽ</span>
              </button>
              <button
                type="button"
                onClick={() => exportGeneratedSvgPackage(chartTitle || 'Biểu đồ thống kê', generatedChartInner, 500, 320, 'docx')}
                className="px-4 min-h-[40px] bg-teal-50 border border-teal-200 text-teal-800 rounded-lg ui-btn font-medium hover:bg-teal-100"
              >
                Xuất Word (.docx)
              </button>
              <button
                type="button"
                onClick={() => exportGeneratedSvgPackage(chartTitle || 'Biểu đồ thống kê', generatedChartInner, 500, 320, 'png')}
                className="px-3.5 min-h-[40px] bg-white border border-slate-200 text-slate-800 rounded-lg ui-btn hover:bg-slate-50"
              >
                Tải PNG 300 DPI
              </button>
              <button
                type="button"
                onClick={() => exportGeneratedSvgPackage(chartTitle || 'Biểu đồ thống kê', generatedChartInner, 500, 320, 'svg')}
                className="px-3.5 min-h-[40px] bg-white border border-slate-200 text-slate-800 rounded-lg ui-btn hover:bg-slate-50"
              >
                Tải SVG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODE 1: BẢNG VẼ KÉO THẢ */}
      {studioMode === 'canvas' && (
        <>
      {/* TOP WORKSPACE TOOLBAR */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            type="button"
            title={leftOpen ? 'Thu gọn thư viện' : 'Mở thư viện đối tượng'}
            onClick={() => setLeftOpen((v) => !v)}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          >
            {leftOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={project.name}
            onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
            aria-label="Tên dự án hình vẽ"
            className="min-h-[38px] px-3 py-1.5 ui-input font-semibold text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600 w-52 sm:w-64"
          />

          <button
            type="button"
            title="Đánh dấu hình vẽ yêu thích"
            onClick={() => setProject((p) => ({ ...p, isFavorite: !p.isFavorite }))}
            className={`min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border ${
              project.isFavorite
                ? 'bg-amber-50 border-amber-300 text-amber-500'
                : 'bg-white border-slate-200 text-slate-500 hover:text-amber-500'
            }`}
          >
            <Star className={`w-4 h-4 ${project.isFavorite ? 'fill-amber-400' : ''}`} />
          </button>
        </div>

        {/* Editing & Arrangement Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            title="Hoàn tác (Ctrl+Z)"
            disabled={history.length === 0}
            onClick={handleUndo}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Làm lại"
            disabled={future.length === 0}
            onClick={handleRedo}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <span className="h-6 w-px bg-slate-200 mx-0.5" />

          <button
            type="button"
            title="Nhóm đối tượng"
            disabled={selectedIds.length < 2}
            onClick={handleGroupSelected}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50"
          >
            <Group className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Rã nhóm đối tượng"
            disabled={!selectedElements.some((e) => e.groupId)}
            onClick={handleUngroupSelected}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50"
          >
            <Ungroup className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Nhân bản (Ctrl+D)"
            disabled={selectedIds.length === 0}
            onClick={handleDuplicateSelected}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Khóa / Mở khóa đối tượng"
            disabled={selectedIds.length === 0}
            onClick={() => updateSelectedElements((el) => ({ ...el, locked: !el.locked }), true)}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50"
          >
            {primarySelected?.locked ? <Lock className="w-4 h-4 text-amber-600" /> : <Unlock className="w-4 h-4" />}
          </button>
          <button
            type="button"
            title="Xóa đối tượng đã chọn"
            disabled={selectedIds.length === 0}
            onClick={() => {
              commitElements((prev) => prev.filter((el) => !selectedIds.includes(el.id) || el.locked));
              setSelectedIds([]);
            }}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-red-600 disabled:opacity-40 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <span className="h-6 w-px bg-slate-200 mx-0.5" />

          {/* Align Controls */}
          <button type="button" title="Căn trái" disabled={selectedIds.length < 2} onClick={() => handleAlign('left')} className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50">
            <AlignStartVertical className="w-4 h-4" />
          </button>
          <button type="button" title="Căn giữa ngang" disabled={selectedIds.length < 2} onClick={() => handleAlign('centerX')} className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50">
            <AlignCenterVertical className="w-4 h-4" />
          </button>
          <button type="button" title="Căn phải" disabled={selectedIds.length < 2} onClick={() => handleAlign('right')} className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50">
            <AlignEndVertical className="w-4 h-4" />
          </button>
          <button type="button" title="Căn trên" disabled={selectedIds.length < 2} onClick={() => handleAlign('top')} className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50">
            <AlignStartHorizontal className="w-4 h-4" />
          </button>
          <button type="button" title="Căn giữa dọc" disabled={selectedIds.length < 2} onClick={() => handleAlign('centerY')} className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50">
            <AlignCenterHorizontal className="w-4 h-4" />
          </button>
          <button type="button" title="Căn dưới" disabled={selectedIds.length < 2} onClick={() => handleAlign('bottom')} className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50">
            <AlignEndHorizontal className="w-4 h-4" />
          </button>

          <span className="h-6 w-px bg-slate-200 mx-0.5" />

          <button type="button" title="Đưa lên trước" disabled={selectedIds.length === 0} onClick={() => handleZOrder('front')} className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50">
            <ArrowUpToLine className="w-4 h-4" />
          </button>
          <button type="button" title="Đưa xuống sau" disabled={selectedIds.length === 0} onClick={() => handleZOrder('back')} className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50">
            <ArrowDownToLine className="w-4 h-4" />
          </button>

          <span className="h-6 w-px bg-slate-200 mx-0.5" />

          <button
            type="button"
            title="Hiện / Ẩn lưới"
            onClick={() => setProject((p) => ({ ...p, showGrid: !p.showGrid }))}
            className={`min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border ${project.showGrid ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-slate-200 text-slate-600'}`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Căn theo lưới (Snap)"
            onClick={() => setProject((p) => ({ ...p, snapToGrid: !p.snapToGrid }))}
            className={`min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border ${project.snapToGrid ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-slate-200 text-slate-600'}`}
          >
            <Magnet className="w-4 h-4" />
          </button>
        </div>

        {/* Page Size + Zoom + Right Panel Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Khổ bảng vẽ"
            value={project.pagePreset}
            onChange={(e) => {
              const preset = e.target.value as CanvasPagePreset;
              if (preset === 'CUSTOM') {
                setProject((p) => ({ ...p, pagePreset: 'CUSTOM' }));
              } else {
                const dim = PAGE_PRESETS[preset];
                setProject((p) => ({
                  ...p,
                  pagePreset: preset,
                  widthCm: dim.widthCm,
                  heightCm: dim.heightCm,
                }));
              }
            }}
            className="min-h-[38px] px-2.5 py-1.5 ui-btn bg-white border border-slate-200 rounded-lg text-slate-800"
          >
            {Object.entries(PAGE_PRESETS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
            <option value="CUSTOM">Tùy chỉnh theo cm</option>
          </select>

          {project.pagePreset === 'CUSTOM' && (
            <div className="flex items-center gap-1.5 ui-btn">
              <input
                type="number"
                min={4}
                max={60}
                step={0.5}
                value={project.widthCm}
                onChange={(e) => setProject((p) => ({ ...p, widthCm: Math.max(4, Number(e.target.value) || 10) }))}
                className="w-16 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg bg-white text-center tabular-nums ui-input"
              />
              <span>×</span>
              <input
                type="number"
                min={4}
                max={60}
                step={0.5}
                value={project.heightCm}
                onChange={(e) => setProject((p) => ({ ...p, heightCm: Math.max(4, Number(e.target.value) || 10) }))}
                className="w-16 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg bg-white text-center tabular-nums ui-input"
              />
              <span className="text-slate-600">cm</span>
            </div>
          )}

          <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden min-h-[38px]">
            <button type="button" title="Thu nhỏ" onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.1).toFixed(2))))} className="px-2.5 min-h-[38px] text-slate-700 hover:bg-slate-50">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2.5 ui-btn font-medium text-slate-800 tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" title="Phóng to" onClick={() => setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2))))} className="px-2.5 min-h-[38px] text-slate-700 hover:bg-slate-50">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleFitContent} title="Vừa khung nhìn" className="px-3 min-h-[38px] ui-btn font-medium border-l border-slate-200 text-slate-700 hover:bg-slate-50 whitespace-nowrap">
              Vừa khung
            </button>
          </div>

          <button
            type="button"
            title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
            onClick={() => setIsFullscreen((v) => !v)}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            title={rightOpen ? 'Thu gọn bảng thuộc tính' : 'Mở bảng thuộc tính'}
            onClick={() => setRightOpen((v) => !v)}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          >
            {rightOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* MAIN 3-ZONE STUDIO BODY */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* CỘT TRÁI: THƯ VIỆN ĐỐI TƯỢNG */}
        {leftOpen && (
          <aside className="w-full lg:w-[300px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70 flex flex-col max-h-[360px] lg:max-h-[calc(100vh-220px)]">
            <div className="p-3 border-b border-slate-200 bg-white space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={libSearch}
                  onChange={(e) => setLibSearch(e.target.value)}
                  placeholder="Tìm dụng cụ, hình học..."
                  className="w-full min-h-[40px] pl-9 pr-3 py-2 ui-input bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600 focus:bg-white"
                />
              </div>

              <select aria-label="Môn học" value={libSubject} onChange={e=>{setLibSubject(e.target.value);setLibCategory('all');setLibSearch('');}} className="w-full border rounded-lg p-2 ui-input">
                <option value="all">Tất cả môn</option><option value="toan">Toán học</option><option value="vat_li">Vật lí</option><option value="hoa_hoc">Hóa học</option>
              </select>
              <select
                aria-label="Danh mục hình vẽ"
                value={libCategory}
                onChange={(e) => setLibCategory(e.target.value as DrawingCategory | 'all')}
                className="w-full min-h-[40px] px-3 py-2 ui-input bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
              >
                {DRAWING_CATEGORY_LABELS.filter(c=>c.id!=='sinh_tin'&&(libSubject==='all'||c.id==='all'||c.id==='hinh_mau'||c.id==='co_ban'||(libSubject==='toan'&&c.id.startsWith('toan_'))||(libSubject==='vat_li'&&c.id.startsWith('ly_'))||(libSubject==='hoa_hoc'&&c.id.startsWith('hoa_')))).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto panel-scroll p-3 space-y-4">
              {/* Grouped Experiment / Diagram Templates */}
              {filteredTemplates.length > 0 && (
                <div>
                  <div className="ui-guide font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-teal-600 shrink-0" />
                    <span>Hình mẫu lắp ghép (Rã nhóm được)</span>
                  </div>
                  <div className="space-y-2">
                    {filteredTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/smartdraw-template', tpl.id)}
                        onClick={() => addTemplateAt(tpl.id)}
                        className="w-full text-left p-3 bg-white border border-slate-200 rounded-lg hover:border-teal-500 hover:bg-teal-50/40 transition-colors"
                      >
                        <svg viewBox="-230 -170 460 340" className="w-full h-24" aria-hidden="true">{tpl.buildElements(0,0).map((el,i)=><SvgElementRenderer key={i} element={{...el,id:`preview_${tpl.id}_${i}`,zIndex:i}} uniqueSuffix={`sidebar_${tpl.id}_${i}`} />)}</svg>
                        <div className="ui-body font-semibold text-slate-900">{tpl.name}</div>
                        <div className="ui-caption text-slate-600 mt-1">{tpl.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Individual Parametric Objects */}
              {filteredLibItems.length > 0 && (
                <div>
                  <div className="ui-guide font-semibold text-slate-700 mb-2">
                    Đối tượng đơn lẻ (Nhấp hoặc kéo vào bảng)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {filteredLibItems.map((item) => {
                      const previewEl: DrawingElement = {
                        id: `prev_${item.kind}`,
                        kind: item.kind,
                        name: item.name,
                        category: item.category,
                        x: item.defaultWidth / 2,
                        y: item.defaultHeight / 2,
                        width: item.defaultWidth,
                        height: item.defaultHeight,
                        rotation: 0,
                        fill: item.defaultFill,
                        stroke: item.defaultStroke,
                        strokeWidth: 1.8,
                        strokeDash: 'solid',
                        opacity: 1,
                        locked: false,
                        zIndex: 1,
                        params: item.defaultParams,
                      };
                      return (
                        <button
                          key={item.kind}
                          type="button"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/smartdraw-kind', item.kind)}
                          onClick={() => addItemAt(item)}
                          className="p-2.5 bg-white border border-slate-200 rounded-lg hover:border-sky-500 hover:bg-sky-50/40 flex flex-col items-center gap-2 text-center transition-colors"
                        >
                          <div className="w-full h-20 flex items-center justify-center overflow-hidden">
                            <svg
                              viewBox={`0 0 ${item.defaultWidth} ${item.defaultHeight}`}
                              className="max-w-full max-h-full"
                            >
                              <SvgElementRenderer element={previewEl} uniqueSuffix="lib" />
                            </svg>
                          </div>
                          <span className="ui-guide font-medium text-slate-800 leading-snug">
                            {item.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* KHU VỰC GIỮA: BẢNG VẼ VECTOR TƯƠNG TÁC */}
        <div
          ref={canvasScrollRef}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const pt = clientToCanvas(e.clientX, e.clientY);
            const tplId = e.dataTransfer.getData('text/smartdraw-template');
            const kind = e.dataTransfer.getData('text/smartdraw-kind');
            if (tplId) {
              addTemplateAt(tplId, pt.x, pt.y);
            } else if (kind) {
              const item = DRAWING_LIBRARY_ITEMS.find((i) => i.kind === kind);
              if (item) addItemAt(item, pt.x, pt.y);
            }
          }}
          className="flex-1 min-w-0 bg-[#E2E8F0]/60 overflow-auto p-4 flex items-start min-h-[420px] max-h-[65vh]"
        >
          <div
            className="bg-white shadow-sm border border-slate-300 relative shrink-0 mx-auto"
            style={{
              width: Math.round(canvasWidthPx * zoom),
              height: Math.round(canvasHeightPx * zoom),
            }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${canvasWidthPx} ${canvasHeightPx}`}
              className="w-full h-full block select-none touch-none"
              onPointerDown={(e) => {
                if (e.target === svgRef.current || (e.target as Element).getAttribute('data-bg-canvas') === 'true') {
                  const pt = clientToCanvas(e.clientX, e.clientY);
                  setSelectedIds([]);
                  setDragState({ mode: 'marquee', startX: pt.x, startY: pt.y, curX: pt.x, curY: pt.y });
                }
              }}
            >
              {/* Grid Background (Editor overlay) */}
              {project.showGrid && (
                <defs data-editor-overlay="true">
                  <pattern id="editor_grid_small" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#f1f5f9" strokeWidth="0.7" />
                  </pattern>
                  <pattern id="editor_grid_major" width="50" height="50" patternUnits="userSpaceOnUse">
                    <rect width="50" height="50" fill="url(#editor_grid_small)" />
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                  </pattern>
                </defs>
              )}

              <rect
                data-bg-canvas="true"
                x={0}
                y={0}
                width={canvasWidthPx}
                height={canvasHeightPx}
                fill={project.showGrid ? 'url(#editor_grid_major)' : '#ffffff'}
              />

              {/* Rendered Elements */}
              {sortedElements.map((el) => {
                const isSel = selectedIds.includes(el.id);
                return (
                  <g
                    key={el.id}
                    className={el.locked ? 'cursor-not-allowed' : 'cursor-move'}
                    onDoubleClick={(e) => { if (el.kind === 'basic_math') { e.stopPropagation(); setSelectedIds([el.id]); setRightOpen(true); requestAnimationFrame(() => { const editor = document.querySelector('[data-formula-editor]'); editor?.scrollIntoView({block:'nearest'}); (editor?.querySelector('math-field') as HTMLElement | null)?.focus(); }); } }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const pt = clientToCanvas(e.clientX, e.clientY);

                      let nextSelection = selectedIds;
                      if (e.shiftKey) {
                        nextSelection = isSel
                          ? selectedIds.filter((id) => id !== el.id)
                          : [...selectedIds, el.id];
                      } else if (!isSel) {
                        // Also select siblings in same groupId
                        if (el.groupId) {
                          nextSelection = project.elements
                            .filter((item) => item.groupId === el.groupId)
                            .map((item) => item.id);
                        } else {
                          nextSelection = [el.id];
                        }
                      }
                      setSelectedIds(nextSelection);

                      const initialPositions: Record<string, { x: number; y: number }> = {};
                      for (const item of project.elements) {
                        if (nextSelection.includes(item.id)) {
                          initialPositions[item.id] = { x: item.x, y: item.y };
                        }
                      }
                      setHistory((h) => [...h.slice(-30), project.elements]);
                      setFuture([]);
                      setDragState({
                        mode: 'move',
                        startX: pt.x,
                        startY: pt.y,
                        initialPositions,
                      });
                    }}
                  >
                    <SvgElementRenderer element={el} uniqueSuffix="canvas" />
                    {/* Invisible generous hit area */}
                    <rect
                      transform={`translate(${el.x}, ${el.y}) rotate(${el.rotation}) translate(${-el.width / 2}, ${-el.height / 2})`}
                      x={-4}
                      y={-4}
                      width={el.width + 8}
                      height={el.height + 8}
                      fill="transparent"
                    />
                  </g>
                );
              })}

              {/* Circuit Snap Anchor Dots */}
              {visibleAnchors.length > 0 && (
                <g data-editor-overlay="true">
                  {visibleAnchors.map((pt, i) => (
                    <circle key={i} cx={pt.x} cy={pt.y} r={3.5} fill="#0ea5e9" fillOpacity={0.7} />
                  ))}
                </g>
              )}

              {/* Selection Box + Resize + Rotation Handles */}
              {selectedElements.map((el) => {
                const hw = el.width / 2;
                const hh = el.height / 2;
                return (
                  <g
                    key={`sel_${el.id}`}
                    data-editor-overlay="true"
                    transform={`translate(${el.x}, ${el.y}) rotate(${el.rotation})`}
                  >
                    <rect
                      x={-hw}
                      y={-hh}
                      width={el.width}
                      height={el.height}
                      fill="none"
                      stroke={el.locked ? '#d97706' : '#0284c7'}
                      strokeWidth={1.3}
                      strokeDasharray={el.groupId ? '4,2' : undefined}
                    />
                    {selectedElements.length === 1 && !el.locked && (
                      <>
                        {/* Rotation stem & handle */}
                        <line x1={0} y1={-hh} x2={0} y2={-hh - 22} stroke="#0284c7" strokeWidth={1.2} />
                        <circle
                          cx={0}
                          cy={-hh - 26}
                          r={6}
                          fill="#ffffff"
                          stroke="#0284c7"
                          strokeWidth={1.8}
                          className="cursor-grab"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            const pt = clientToCanvas(e.clientX, e.clientY);
                            const startAngle = Math.atan2(pt.y - el.y, pt.x - el.x) * (180 / Math.PI);
                            setHistory((h) => [...h.slice(-30), project.elements]);
                            setDragState({
                              mode: 'rotate',
                              elementId: el.id,
                              cx: el.x,
                              cy: el.y,
                              startAngle,
                              origRotation: el.rotation,
                            });
                          }}
                        />

                        {/* 8 Resize handles */}
                        {(
                          [
                            ['nw', -hw, -hh, 'nwse-resize'],
                            ['n', 0, -hh, 'ns-resize'],
                            ['ne', hw, -hh, 'nesw-resize'],
                            ['e', hw, 0, 'ew-resize'],
                            ['se', hw, hh, 'nwse-resize'],
                            ['s', 0, hh, 'ns-resize'],
                            ['sw', -hw, hh, 'nesw-resize'],
                            ['w', -hw, 0, 'ew-resize'],
                          ] as const
                        ).map(([handle, hx, hy, cursor]) => (
                          <rect
                            key={handle}
                            x={hx - 4}
                            y={hy - 4}
                            width={8}
                            height={8}
                            rx={1.5}
                            fill="#ffffff"
                            stroke="#0284c7"
                            strokeWidth={1.5}
                            style={{ cursor }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              const pt = clientToCanvas(e.clientX, e.clientY);
                              setHistory((h) => [...h.slice(-30), project.elements]);
                              setDragState({
                                mode: 'resize',
                                elementId: el.id,
                                handle,
                                startX: pt.x,
                                startY: pt.y,
                                orig: { x: el.x, y: el.y, width: el.width, height: el.height },
                              });
                            }}
                          />
                        ))}
                      </>
                    )}
                  </g>
                );
              })}

              {/* Marquee Selection Rectangle */}
              {dragState?.mode === 'marquee' && (
                <rect
                  data-editor-overlay="true"
                  x={Math.min(dragState.startX, dragState.curX)}
                  y={Math.min(dragState.startY, dragState.curY)}
                  width={Math.abs(dragState.curX - dragState.startX)}
                  height={Math.abs(dragState.curY - dragState.startY)}
                  fill="#0284c7"
                  fillOpacity={0.08}
                  stroke="#0284c7"
                  strokeWidth={1}
                  strokeDasharray="4,3"
                />
              )}
            </svg>
          </div>
        </div>

        {/* CỘT PHẢI: THUỘC TÍNH ĐỐI TƯỢNG (KHÔNG CHE BẢNG VẼ) */}
        {rightOpen && (
          <aside className="w-full lg:w-[300px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col max-h-[380px] lg:max-h-[calc(100vh-220px)] overflow-y-auto panel-scroll">
            <div className="px-4 py-3 border-b border-slate-200 ui-group-title text-slate-900">
              Thuộc tính đối tượng
            </div>

            {selectedElements.length === 0 ? (
              <div className="p-4 ui-guide text-slate-600 space-y-2">
                <p>Chưa chọn đối tượng nào trên bảng vẽ.</p>
                <p>Nhấp vào một hình vẽ ở bảng giữa hoặc chọn đối tượng từ thư viện bên trái để bắt đầu.</p>
              </div>
            ) : (
              <div className="p-4 space-y-4 ui-guide">
                <div>
                  <div className="ui-body font-semibold text-slate-900">
                    {primarySelected ? primarySelected.name : `Đang chọn ${selectedElements.length} đối tượng`}
                  </div>
                  {primarySelected?.groupId && (
                    <div className="ui-caption text-teal-700 mt-1">
                      Thuộc nhóm lắp ghép · Nhấn Rã nhóm để sửa lẻ
                    </div>
                  )}
                </div>

                {primarySelected?.kind === 'basic_math' && (
                  <DrawingFormulaEditor key={primarySelected.id} element={primarySelected} onApply={(latex, fontSize) => {
                    const math = formulaSvg(latex);
                    updateSelectedElements(el => ({ ...el, width: Math.max(el.width, math.width * fontSize / 1000 + 12), height: Math.max(el.height, math.height * fontSize / 1000 + 12), params: { ...el.params, latex, fontSize } }), true);
                  }} />
                )}

                {/* Transform */}
                {primarySelected && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="block">
                      <span className="ui-caption text-slate-600">Vị trí X</span>
                      <input
                        type="number"
                        value={Math.round(primarySelected.x)}
                        onChange={(e) => updateSelectedElements((el) => ({ ...el, x: Number(e.target.value) || 0 }))}
                        className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg tabular-nums"
                      />
                    </label>
                    <label className="block">
                      <span className="ui-caption text-slate-600">Vị trí Y</span>
                      <input
                        type="number"
                        value={Math.round(primarySelected.y)}
                        onChange={(e) => updateSelectedElements((el) => ({ ...el, y: Number(e.target.value) || 0 }))}
                        className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg tabular-nums"
                      />
                    </label>
                    <label className="block">
                      <span className="ui-caption text-slate-600">Rộng (px)</span>
                      <input
                        type="number"
                        min={20}
                        value={Math.round(primarySelected.width)}
                        onChange={(e) => updateSelectedElements((el) => ({ ...el, width: Math.max(20, Number(e.target.value) || 20) }))}
                        className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg tabular-nums"
                      />
                    </label>
                    <label className="block">
                      <span className="ui-caption text-slate-600">Cao (px)</span>
                      <input
                        type="number"
                        min={20}
                        value={Math.round(primarySelected.height)}
                        onChange={(e) => updateSelectedElements((el) => ({ ...el, height: Math.max(20, Number(e.target.value) || 20) }))}
                        className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg tabular-nums"
                      />
                    </label>
                  </div>
                )}

                {/* Rotation Slider */}
                <div>
                  <div className="flex items-center justify-between ui-caption text-slate-700 mb-1">
                    <span className="flex items-center gap-1.5">
                      <RotateCw className="w-3.5 h-3.5" />
                      Góc xoay
                    </span>
                    <span className="font-semibold tabular-nums">{primarySelected?.rotation ?? 0}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={primarySelected?.rotation ?? 0}
                    onChange={(e) => updateSelectedElements((el) => ({ ...el, rotation: Number(e.target.value) }))}
                    className="w-full accent-sky-600"
                  />
                </div>

                {/* Colors & Stroke */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="block">
                      <span className="ui-caption text-slate-600">Màu nét viền</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="color"
                          value={primarySelected?.stroke || '#0f172a'}
                          onChange={(e) => updateSelectedElements((el) => ({ ...el, stroke: e.target.value }))}
                          className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => updateSelectedElements((el) => ({ ...el, stroke: '#0f172a' }))}
                          className="px-2 py-1 ui-caption border border-slate-200 rounded-md hover:bg-slate-50"
                        >
                          Đen in
                        </button>
                      </div>
                    </label>

                    <label className="block">
                      <span className="ui-caption text-slate-600">Màu nền</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="color"
                          value={primarySelected?.fill && primarySelected.fill !== 'transparent' ? primarySelected.fill : '#ffffff'}
                          onChange={(e) => updateSelectedElements((el) => ({ ...el, fill: e.target.value }))}
                          className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => updateSelectedElements((el) => ({ ...el, fill: 'transparent' }))}
                          className="px-2 py-1 ui-caption border border-slate-200 rounded-md hover:bg-slate-50"
                        >
                          Trong suốt
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="block">
                      <span className="ui-caption text-slate-600">Độ dày nét</span>
                      <input
                        type="number"
                        min={0.5}
                        max={6}
                        step={0.3}
                        value={primarySelected?.strokeWidth ?? 1.8}
                        onChange={(e) => updateSelectedElements((el) => ({ ...el, strokeWidth: Number(e.target.value) || 1.5 }))}
                        className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg tabular-nums"
                      />
                    </label>
                    <label className="block">
                      <span className="ui-caption text-slate-600">Kiểu nét</span>
                      <select
                        value={primarySelected?.strokeDash ?? 'solid'}
                        onChange={(e) => updateSelectedElements((el) => ({ ...el, strokeDash: e.target.value as StrokeDashStyle }))}
                        className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="solid">Nét liền</option>
                        <option value="dashed">Nét đứt</option>
                        <option value="dotted">Nét chấm</option>
                        <option value="dashdot">Gạch chấm</option>
                      </select>
                    </label>
                  </div>

                  <div>
                    <div className="flex justify-between ui-caption text-slate-700">
                      <span>Độ đậm nhạt</span>
                      <span className="tabular-nums font-medium">{Math.round((primarySelected?.opacity ?? 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={100}
                      value={Math.round((primarySelected?.opacity ?? 1) * 100)}
                      onChange={(e) => updateSelectedElements((el) => ({ ...el, opacity: Number(e.target.value) / 100 }))}
                      className="w-full accent-sky-600"
                    />
                  </div>
                </div>

                {/* PARAMETRIC SCIENTIFIC PROPERTIES */}
                {primarySelected && (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div className="ui-guide font-semibold text-sky-700">Thông số khoa học</div>

                    {/* Text / Math */}
                    {(primarySelected.kind === 'basic_text' || primarySelected.kind.startsWith('it_flow_')) && (
                      <label className="block">
                        <span className="ui-caption text-slate-600">Nội dung chữ</span>
                        <input
                          type="text"
                          value={primarySelected.params.textContent || ''}
                          onChange={(e) =>
                            updateSelectedElements((el) => ({
                              ...el,
                              params: { ...el.params, textContent: e.target.value },
                            }))
                          }
                          className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg"
                        />
                      </label>
                    )}

                    {/* Math Geometry Params */}
                    {primarySelected.kind.startsWith('math_') && (
                      <>
                        <label className="block">
                          <span className="ui-caption text-slate-600">Tên đỉnh / trục (phân cách dấu phẩy)</span>
                          <input
                            type="text"
                            value={primarySelected.params.labels || ''}
                            onChange={(e) =>
                              updateSelectedElements((el) => ({
                                ...el,
                                params: { ...el.params, labels: e.target.value },
                              }))
                            }
                            className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg"
                          />
                        </label>
                        {typeof primarySelected.params.showHiddenEdges !== 'undefined' && (
                          <label className="flex items-center gap-2 cursor-pointer ui-guide text-slate-800">
                            <input
                              type="checkbox"
                              checked={primarySelected.params.showHiddenEdges !== false}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, showHiddenEdges: e.target.checked },
                                }))
                              }
                            />
                            <span>Hiện cạnh khuất nét đứt</span>
                          </label>
                        )}
                        {typeof primarySelected.params.showRightAngle !== 'undefined' && (
                          <label className="flex items-center gap-2 cursor-pointer ui-guide text-slate-800">
                            <input
                              type="checkbox"
                              checked={Boolean(primarySelected.params.showRightAngle)}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, showRightAngle: e.target.checked },
                                }))
                              }
                            />
                            <span>Đánh dấu góc vuông</span>
                          </label>
                        )}
                        {typeof primarySelected.params.showAltitude !== 'undefined' && (
                          <label className="flex items-center gap-2 cursor-pointer ui-guide text-slate-800">
                            <input
                              type="checkbox"
                              checked={Boolean(primarySelected.params.showAltitude)}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, showAltitude: e.target.checked },
                                }))
                              }
                            />
                            <span>Hiện đường cao / bán kính</span>
                          </label>
                        )}
                        {primarySelected.kind === 'math_cube' && (
                          <label className="flex items-center gap-2 cursor-pointer ui-guide text-slate-800">
                            <input
                              type="checkbox"
                              checked={Boolean(primarySelected.params.showCrossSection)}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, showCrossSection: e.target.checked },
                                }))
                              }
                            />
                            <span>Tô màu mặt thiết diện</span>
                          </label>
                        )}
                      </>
                    )}

                    {/* Physics Params */}
                    {primarySelected.kind.startsWith('phys_') && (
                      <>
                        {typeof primarySelected.params.arrowLabel !== 'undefined' && (
                          <label className="block">
                            <span className="ui-caption text-slate-600">Kí hiệu đại lượng</span>
                            <input
                              type="text"
                              value={primarySelected.params.arrowLabel || ''}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, arrowLabel: e.target.value },
                                }))
                              }
                              className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg"
                            />
                          </label>
                        )}
                        {primarySelected.kind === 'phys_spring' && (
                          <div>
                            <div className="flex justify-between ui-caption text-slate-700">
                              <span>Số vòng lò xo</span>
                              <span className="tabular-nums font-medium">{primarySelected.params.coilCount ?? 8}</span>
                            </div>
                            <input
                              type="range"
                              min={4}
                              max={16}
                              value={primarySelected.params.coilCount ?? 8}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, coilCount: Number(e.target.value) },
                                }))
                              }
                              className="w-full accent-sky-600"
                            />
                          </div>
                        )}
                        {(primarySelected.kind === 'phys_incline_plane' ||
                          primarySelected.kind === 'phys_pendulum_simple') && (
                          <div>
                            <div className="flex justify-between ui-caption text-slate-700">
                              <span>Góc nghiêng / lệch</span>
                              <span className="tabular-nums font-medium">{primarySelected.params.angleDeg ?? 25}°</span>
                            </div>
                            <input
                              type="range"
                              min={10}
                              max={60}
                              value={primarySelected.params.angleDeg ?? 25}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, angleDeg: Number(e.target.value) },
                                }))
                              }
                              className="w-full accent-sky-600"
                            />
                          </div>
                        )}
                        {primarySelected.kind === 'phys_switch' && (
                          <label className="flex items-center gap-2 cursor-pointer ui-guide text-slate-800">
                            <input
                              type="checkbox"
                              checked={Boolean(primarySelected.params.switchClosed)}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, switchClosed: e.target.checked },
                                }))
                              }
                            />
                            <span>Đóng khóa K (mạch kín)</span>
                          </label>
                        )}
                      </>
                    )}

                    {/* Chemistry Glassware & Phenomena Params */}
                    {primarySelected.kind.startsWith('chem_') && (
                      <>
                        {typeof primarySelected.params.liquidLevel !== 'undefined' && (
                          <div>
                            <div className="flex justify-between ui-caption text-slate-700">
                              <span>Mực chất lỏng</span>
                              <span className="tabular-nums font-medium">{primarySelected.params.liquidLevel}%</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={95}
                              value={primarySelected.params.liquidLevel}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, liquidLevel: Number(e.target.value) },
                                }))
                              }
                              className="w-full accent-sky-600"
                            />
                          </div>
                        )}
                        {typeof primarySelected.params.liquidColor !== 'undefined' && (
                          <label className="flex items-center justify-between">
                            <span className="ui-caption text-slate-700">Màu dung dịch</span>
                            <input
                              type="color"
                              value={primarySelected.params.liquidColor || '#bae6fd'}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, liquidColor: e.target.value },
                                }))
                              }
                              className="w-8 h-7 border border-slate-200 rounded"
                            />
                          </label>
                        )}
                        {typeof primarySelected.params.bubbleCount !== 'undefined' && (
                          <div>
                            <div className="flex justify-between ui-caption text-slate-700">
                              <span>Số lượng bọt khí</span>
                              <span className="tabular-nums font-medium">{primarySelected.params.bubbleCount}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={12}
                              value={primarySelected.params.bubbleCount}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, bubbleCount: Number(e.target.value) },
                                }))
                              }
                              className="w-full accent-sky-600"
                            />
                          </div>
                        )}
                        {typeof primarySelected.params.showPrecipitate !== 'undefined' && (
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer ui-guide text-slate-800">
                              <input
                                type="checkbox"
                                checked={Boolean(primarySelected.params.showPrecipitate)}
                                onChange={(e) =>
                                  updateSelectedElements((el) => ({
                                    ...el,
                                    params: { ...el.params, showPrecipitate: e.target.checked },
                                  }))
                                }
                              />
                              <span>Có kết tủa</span>
                            </label>
                            {primarySelected.params.showPrecipitate && (
                              <input
                                type="color"
                                value={primarySelected.params.precipitateColor || '#94a3b8'}
                                onChange={(e) =>
                                  updateSelectedElements((el) => ({
                                    ...el,
                                    params: { ...el.params, precipitateColor: e.target.value },
                                  }))
                                }
                                className="w-7 h-7 border border-slate-200 rounded"
                              />
                            )}
                          </div>
                        )}
                        {typeof primarySelected.params.chemicalLabel !== 'undefined' && (
                          <label className="block">
                            <span className="ui-caption text-slate-600">Nhãn hóa chất</span>
                            <input
                              type="text"
                              value={primarySelected.params.chemicalLabel || ''}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, chemicalLabel: e.target.value },
                                }))
                              }
                              className="w-full mt-1 min-h-[36px] px-2.5 py-1 ui-input border border-slate-200 rounded-lg"
                            />
                          </label>
                        )}
                        {primarySelected.kind === 'chem_alcohol_lamp' && (
                          <label className="flex items-center gap-2 cursor-pointer ui-guide text-slate-800">
                            <input
                              type="checkbox"
                              checked={primarySelected.params.flameActive !== false}
                              onChange={(e) =>
                                updateSelectedElements((el) => ({
                                  ...el,
                                  params: { ...el.params, flameActive: e.target.checked },
                                }))
                              }
                            />
                            <span>Bật ngọn lửa đèn cồn</span>
                          </label>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* BOTTOM STATUS & EXPORT BAR */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 ui-guide">
        <div className="flex flex-wrap items-center gap-3 text-slate-700">
          <span>{project.elements.length} đối tượng</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {project.widthCm} × {project.heightCm} cm
          </span>
          <span aria-hidden="true">·</span>
          <span>{saveIndicator}</span>

          <label className="flex items-center gap-2 cursor-pointer text-slate-800 ml-1">
            <input
              type="checkbox"
              checked={cropToContent}
              onChange={(e) => setCropToContent(e.target.checked)}
            />
            <span>Chỉ xuất vùng có nội dung</span>
          </label>

          <label className="flex items-center gap-2 text-slate-800">
            <span>Độ phân giải:</span>
            <select
              value={exportDpi}
              onChange={(e) => setExportDpi(Number(e.target.value) as 96 | 150 | 300)}
              className="min-h-[38px] px-2.5 py-1 bg-white border border-slate-200 rounded-lg ui-btn"
            >
              <option value={96}>96 DPI</option>
              <option value={150}>150 DPI</option>
              <option value={300}>300 DPI (In chuẩn)</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">

          <button
            type="button"
            onClick={() => jsonUploadRef.current?.click()}
            className="min-h-[40px] px-3.5 py-2 ui-btn font-medium bg-white border border-slate-200 rounded-lg text-slate-800 hover:bg-slate-100 whitespace-nowrap"
          >
            Mở JSON
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="min-h-[40px] px-3.5 py-2 ui-btn font-medium bg-white border border-slate-200 rounded-lg text-slate-800 hover:bg-slate-100 whitespace-nowrap"
          >
            Lưu JSON
          </button>
          <button
            type="button"
            onClick={async () => {
              await persistProjectToDb(project);
              onNotify(`Đã lưu dự án "${project.name}" vào kho lưu trữ.`, 'success');
            }}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 ui-btn font-medium bg-white border border-slate-200 rounded-lg text-slate-800 hover:bg-slate-100 whitespace-nowrap"
          >
            <Save className="w-4 h-4 text-teal-600" />
            <span>Lưu dự án</span>
          </button>
          <button
            type="button"
            onClick={() => handleExportPng(false, true)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 ui-btn font-medium bg-white border border-slate-200 rounded-lg text-slate-800 hover:bg-slate-100 whitespace-nowrap"
          >
            <ImageIcon className="w-4 h-4 text-slate-600" />
            <span>Chép ảnh</span>
          </button>
          <button
            type="button"
            onClick={handleExportSvg}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 ui-btn font-medium bg-white border border-slate-200 rounded-lg text-slate-800 hover:bg-slate-100 whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>SVG</span>
          </button>
          <button
            type="button"
            onClick={() => handleExportPng(false, false)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 ui-btn font-medium bg-white border border-slate-200 rounded-lg text-slate-800 hover:bg-slate-100 whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>PNG Trắng</span>
          </button>
          <button
            type="button"
            onClick={() => handleExportPng(true, false)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 ui-btn font-medium bg-white border border-slate-200 rounded-lg text-slate-800 hover:bg-slate-100 whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>PNG Trong suốt</span>
          </button>
          <button
            type="button"
            onClick={handleAddDrawingToDocument}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 ui-btn font-medium bg-teal-50 border border-teal-200 rounded-lg text-teal-800 hover:bg-teal-100 whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Thêm vào tài liệu</span>
          </button>
          <button
            type="button"
            onClick={handleExportDocx}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 ui-btn bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            <span>Xuất Word</span>
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
