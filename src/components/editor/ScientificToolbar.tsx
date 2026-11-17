import React, { useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import katex from 'katex';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Compass,
  FunctionSquare,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Palette,
  Redo2,
  Sigma,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table2,
  Underline as UnderlineIcon,
  Undo2,
  Wrench,
} from 'lucide-react';
import {
  EQUATION_TOOLBAR_GROUPS,
  VisualEquationGroup,
  buildMatrixLatex,
} from './mathToolbarCatalog';
import { isEditorAlive, useScientificEditorGroup } from './editorRegistry';
import {
  buildFunctionGraphSvgInner,
  buildVariationTableSvgInner,
} from '../../core/math/graphEngine';
import { SAMPLE_DRAWING_PROJECTS } from '../../data/samples/sampleProjects';

interface ScientificToolbarProps {
  editor: Editor | null;
  onInsertLatex?: (latex: string, display?: 'inline' | 'block') => void;
  compact?: boolean;
  showFormattingBar?: boolean;
  defaultEquationOpen?: boolean;
  onToggleAdvancedSource?: () => void;
  advancedSourceOpen?: boolean;
}

const FONT_FAMILIES = [
  { label: 'Times New Roman', value: 'Times New Roman, Times, serif' },
  { label: 'Inter', value: 'Inter, Segoe UI, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Cambria', value: 'Cambria, Georgia, serif' },
];

const FONT_SIZES = ['11pt', '12pt', '13pt', '14pt', '16pt', '18pt', '20pt'];

const TEXT_COLORS = [
  { label: 'Đen', value: '#0f172a' },
  { label: 'Xanh dương', value: '#0284c7' },
  { label: 'Đỏ', value: '#dc2626' },
  { label: 'Xanh lá', value: '#059669' },
  { label: 'Tím', value: '#7c3aed' },
];

const HIGHLIGHT_COLORS = [
  { label: 'Vàng', value: '#fef08a' },
  { label: 'Xanh nhạt', value: '#bae6fd' },
  { label: 'Lục nhạt', value: '#bbf7d0' },
  { label: 'Hồng nhạt', value: '#fecdd3' },
  { label: 'Bỏ tô nền', value: '' },
];

const KatexSymbolButton: React.FC<{
  previewLatex: string;
  tooltip: string;
  onClick: () => void;
}> = React.memo(({ previewLatex, tooltip, onClick }) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(previewLatex, {
        displayMode: false,
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      return previewLatex;
    }
  }, [previewLatex]);

  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="min-h-[34px] min-w-[36px] px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-400 text-slate-900 flex items-center justify-center transition-colors shrink-0"
    >
      <span className="text-[14px] leading-none pointer-events-none" dangerouslySetInnerHTML={{ __html: html }} />
    </button>
  );
});

export const ScientificToolbar: React.FC<ScientificToolbarProps> = ({
  editor: directEditor,
  onInsertLatex: directInsertLatex,
  compact = false,
  showFormattingBar = true,
  defaultEquationOpen = true,
  onToggleAdvancedSource,
  advancedSourceOpen = false,
}) => {
  const groupCtx = useScientificEditorGroup();
  const candidateEditor = directEditor || groupCtx?.activeEditor || null;
  const editor = isEditorAlive(candidateEditor) ? candidateEditor : null;

  const [equationOpen, setEquationOpen] = useState(defaultEquationOpen);
  const [activeEqGroup, setActiveEqGroup] = useState<VisualEquationGroup['id']>('basic');
  const [openPopover, setOpenPopover] = useState<
    null | 'color' | 'highlight' | 'table' | 'matrix' | 'visual'
  >(null);
  const [hoverTableCell, setHoverTableCell] = useState<[number, number]>([3, 3]);
  const [hoverMatrixCell, setHoverMatrixCell] = useState<[number, number]>([2, 2]);
  const [matrixKind, setMatrixKind] = useState<'pmatrix' | 'bmatrix' | 'vmatrix'>('pmatrix');
  const [quickGraphExpr, setQuickGraphExpr] = useState('x^3 - 3*x + 2');
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const handleInsertFormula = (latex: string, display: 'inline' | 'block' = 'inline') => {
    if (directInsertLatex) {
      directInsertLatex(latex, display);
    } else if (groupCtx) {
      groupCtx.insertFormulaLatex(latex, display);
    }
    setOpenPopover(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        editor.chain().focus().setImage({ src: reader.result, alt: file.name }).run();
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const insertSampleGraph = () => {
    if (!editor) return;
    const inner = buildFunctionGraphSvgInner({
      width: 340,
      height: 220,
      xMin: -4,
      xMax: 4,
      yMin: -3,
      yMax: 5,
      showGrid: true,
      showTicks: true,
      functions: [{ id: 'f1', expr: quickGraphExpr || 'x^2', color: '#0284c7', strokeWidth: 2.2 }],
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 220" width="340" height="220"><rect width="340" height="220" fill="#ffffff"/>${inner}</svg>`;
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'scientificSvg',
        attrs: { svg, label: `Đồ thị hàm số y = ${quickGraphExpr}` },
      })
      .run();
    setOpenPopover(null);
  };

  const insertSampleVariationTable = () => {
    if (!editor) return;
    const inner = buildVariationTableSvgInner(
      {
        yPrimeSymbol: "y'",
        ySymbol: 'y',
        nodes: [
          { xLabel: '-∞', yPrimeAtNode: '', yValueTop: '-∞', yPos: 'bot' },
          { xLabel: '-1', yPrimeAtNode: '0', yValueTop: '4', yPos: 'top' },
          { xLabel: '1', yPrimeAtNode: '0', yValueTop: '0', yPos: 'bot' },
          { xLabel: '+∞', yPrimeAtNode: '', yValueTop: '+∞', yPos: 'top' },
        ],
        intervals: [
          { sign: '+', trend: 'up' },
          { sign: '-', trend: 'down' },
          { sign: '+', trend: 'up' },
        ],
      },
      520,
      195
    );
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 195" width="520" height="195"><rect width="520" height="195" fill="#ffffff"/>${inner}</svg>`;
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'scientificSvg',
        attrs: { svg, label: 'Bảng biến thiên hàm bậc ba' },
      })
      .run();
    setOpenPopover(null);
  };

  const insertPresetGeometrySvg = () => {
    if (!editor) return;
    const sample = SAMPLE_DRAWING_PROJECTS[0];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200"><rect width="320" height="200" fill="#ffffff"/><polygon points="70,165 250,165 135,45" fill="none" stroke="#0f172a" stroke-width="2"/><line x1="135" y1="45" x2="135" y2="165" stroke="#0284c7" stroke-width="1.6" stroke-dasharray="4 3"/><polyline points="135,153 147,153 147,165" fill="none" stroke="#0f172a" stroke-width="1.4"/><text x="128" y="36" font-family="Times New Roman" font-size="15" font-style="italic">A</text><text x="54" y="172" font-family="Times New Roman" font-size="15" font-style="italic">B</text><text x="256" y="172" font-family="Times New Roman" font-size="15" font-style="italic">C</text><text x="131" y="182" font-family="Times New Roman" font-size="15" font-style="italic">H</text></svg>`;
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'scientificSvg',
        attrs: { svg, label: sample?.name || 'Hình tam giác có đường cao AH' },
      })
      .run();
    setOpenPopover(null);
  };

  const activeGroup =
    EQUATION_TOOLBAR_GROUPS.find((g) => g.id === activeEqGroup) || EQUATION_TOOLBAR_GROUPS[0];

  const tbBtnClass = (active = false) =>
    `min-h-[32px] min-w-[32px] px-1.5 rounded-md border flex items-center justify-center transition-colors ${
      active
        ? 'bg-sky-100 border-sky-400 text-sky-800'
        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
    }`;

  return (
    <div
      data-scientific-toolbar="true"
      className="bg-slate-50 border border-slate-200 rounded-t-xl p-2 space-y-2 select-none"
    >
      {/* ROW 1: WORD FORMATTING TOOLBAR */}
      {showFormattingBar && (
        <div className="flex flex-wrap items-center gap-1 pb-1.5 border-b border-slate-200">
          {!compact && (
            <>
              <select
                title="Phông chữ"
                aria-label="Phông chữ"
                onMouseDown={(e) => e.stopPropagation()}
                value={(editor?.getAttributes('textStyle')?.fontFamily as string) || FONT_FAMILIES[0].value}
                onChange={(e) => editor?.chain().focus().setFontFamily(e.target.value).run()}
                className="h-[32px] px-2 bg-white border border-slate-200 rounded-md text-[13px] text-slate-800"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.label} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>

              <select
                title="Cỡ chữ văn bản"
                aria-label="Cỡ chữ văn bản"
                onMouseDown={(e) => e.stopPropagation()}
                value={(editor?.getAttributes('textStyle')?.fontSize as string) || '13pt'}
                onChange={(e) => editor?.chain().focus().setFontSize(e.target.value).run()}
                className="h-[32px] px-1.5 bg-white border border-slate-200 rounded-md text-[13px] text-slate-800"
              >
                {FONT_SIZES.map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>

              <span className="w-px h-5 bg-slate-300 mx-0.5" />
            </>
          )}

          {/* Basic Formatting */}
          <button
            type="button"
            title="In đậm (Ctrl+B)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={tbBtnClass(editor?.isActive('bold'))}
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="In nghiêng (Ctrl+I)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={tbBtnClass(editor?.isActive('italic'))}
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Gạch chân (Ctrl+U)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            className={tbBtnClass(editor?.isActive('underline'))}
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Gạch ngang chữ"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            className={tbBtnClass(editor?.isActive('strike'))}
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          {/* Superscript / Subscript */}
          <button
            type="button"
            title="Chỉ số trên (x²)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleSuperscript().run()}
            className={tbBtnClass(editor?.isActive('superscript'))}
          >
            <SuperscriptIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Chỉ số dưới (x₂)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleSubscript().run()}
            className={tbBtnClass(editor?.isActive('subscript'))}
          >
            <SubscriptIcon className="w-4 h-4" />
          </button>

          {/* Text Color & Highlight */}
          <div className="relative">
            <button
              type="button"
              title="Màu chữ"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpenPopover((p) => (p === 'color' ? null : 'color'))}
              className={tbBtnClass(openPopover === 'color')}
            >
              <Palette className="w-4 h-4" />
            </button>
            {openPopover === 'color' && (
              <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-lg shadow-lg p-2 flex gap-1.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      editor?.chain().focus().setColor(c.value).run();
                      setOpenPopover(null);
                    }}
                    className="w-6 h-6 rounded border border-slate-300"
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              title="Tô màu nền chữ"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpenPopover((p) => (p === 'highlight' ? null : 'highlight'))}
              className={tbBtnClass(openPopover === 'highlight')}
            >
              <Highlighter className="w-4 h-4" />
            </button>
            {openPopover === 'highlight' && (
              <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-lg shadow-lg p-2 flex gap-1.5">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    title={c.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (c.value) {
                        editor?.chain().focus().toggleHighlight({ color: c.value }).run();
                      } else {
                        editor?.chain().focus().unsetHighlight().run();
                      }
                      setOpenPopover(null);
                    }}
                    className="w-6 h-6 rounded border border-slate-300 text-[11px] font-bold"
                    style={{ backgroundColor: c.value || '#ffffff' }}
                  >
                    {!c.value ? '×' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!compact && (
            <>
              <span className="w-px h-5 bg-slate-300 mx-0.5" />
              <button
                type="button"
                title="Căn trái"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().setTextAlign('left').run()}
                className={tbBtnClass(editor?.isActive({ textAlign: 'left' }))}
              >
                <AlignLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Căn giữa"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().setTextAlign('center').run()}
                className={tbBtnClass(editor?.isActive({ textAlign: 'center' }))}
              >
                <AlignCenter className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Căn phải"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().setTextAlign('right').run()}
                className={tbBtnClass(editor?.isActive({ textAlign: 'right' }))}
              >
                <AlignRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Căn đều"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
                className={tbBtnClass(editor?.isActive({ textAlign: 'justify' }))}
              >
                <AlignJustify className="w-4 h-4" />
              </button>

              <span className="w-px h-5 bg-slate-300 mx-0.5" />
              <button
                type="button"
                title="Danh sách đầu dòng"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                className={tbBtnClass(editor?.isActive('bulletList'))}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Danh sách đánh số"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                className={tbBtnClass(editor?.isActive('orderedList'))}
              >
                <ListOrdered className="w-4 h-4" />
              </button>

              {/* Insert Table Picker */}
              <div className="relative">
                <button
                  type="button"
                  title="Chèn bảng biểu"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOpenPopover((p) => (p === 'table' ? null : 'table'))}
                  className={tbBtnClass(openPopover === 'table')}
                >
                  <Table2 className="w-4 h-4" />
                </button>
                {openPopover === 'table' && (
                  <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-48 space-y-2">
                    <div className="text-[12px] font-semibold text-slate-700">
                      Chèn bảng {hoverTableCell[0]} × {hoverTableCell[1]}
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {Array.from({ length: 25 }, (_, i) => {
                        const r = Math.floor(i / 5) + 1;
                        const c = (i % 5) + 1;
                        const active = r <= hoverTableCell[0] && c <= hoverTableCell[1];
                        return (
                          <button
                            key={i}
                            type="button"
                            onMouseEnter={() => setHoverTableCell([r, c])}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              editor
                                ?.chain()
                                .focus()
                                .insertTable({ rows: r, cols: c, withHeaderRow: true })
                                .run();
                              setOpenPopover(null);
                            }}
                            className={`w-6 h-5 rounded-xs border ${
                              active ? 'bg-sky-500 border-sky-600' : 'bg-slate-50 border-slate-300'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Insert Image */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                type="button"
                title="Chèn hình ảnh từ máy tính"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => imageInputRef.current?.click()}
                className={tbBtnClass(false)}
              >
                <ImagePlus className="w-4 h-4" />
              </button>

              {/* Insert Graph / Variation Table / Geometry */}
              <div className="relative">
                <button
                  type="button"
                  title="Chèn đồ thị hàm số, bảng biến thiên hoặc hình vẽ"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOpenPopover((p) => (p === 'visual' ? null : 'visual'))}
                  className={`${tbBtnClass(openPopover === 'visual')} gap-1 px-2 text-[13px] font-medium`}
                >
                  <Compass className="w-4 h-4 text-teal-600" />
                  <span className="hidden xl:inline">Hình / Đồ thị</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {openPopover === 'visual' && (
                  <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-72 space-y-2.5">
                    <div className="text-[13px] font-semibold text-slate-800">
                      Chèn minh họa trực quan vào câu hỏi
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[12px] text-slate-600">
                        Vẽ nhanh đồ thị hàm số y =
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={quickGraphExpr}
                          onChange={(e) => setQuickGraphExpr(e.target.value)}
                          className="flex-1 px-2 py-1 border border-slate-200 rounded text-[13px]"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={insertSampleGraph}
                          className="px-2.5 py-1 bg-sky-600 text-white rounded text-[12px] font-semibold hover:bg-sky-700"
                        >
                          Chèn đồ thị
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={insertSampleVariationTable}
                      className="w-full text-left px-2.5 py-1.5 bg-slate-50 hover:bg-sky-50 border border-slate-200 rounded-lg text-[13px] text-slate-800 flex items-center gap-2"
                    >
                      <FunctionSquare className="w-4 h-4 text-sky-600" />
                      <span>Chèn Bảng biến thiên mẫu</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={insertPresetGeometrySvg}
                      className="w-full text-left px-2.5 py-1.5 bg-slate-50 hover:bg-sky-50 border border-slate-200 rounded-lg text-[13px] text-slate-800 flex items-center gap-2"
                    >
                      <Compass className="w-4 h-4 text-teal-600" />
                      <span>Chèn hình tam giác đường cao AH</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <span className="w-px h-5 bg-slate-300 mx-0.5" />

          {/* Direct Insert Inline / Block Formula */}
          <button
            type="button"
            title="Chèn công thức cùng dòng văn bản"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleInsertFormula('#?', 'inline')}
            className="min-h-[32px] px-2.5 rounded-md border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 text-[13px] font-semibold inline-flex items-center gap-1"
          >
            <Sigma className="w-3.5 h-3.5" />
            <span>Chèn công thức</span>
          </button>

          {!compact && (
            <button
              type="button"
              title="Chèn công thức căn giữa trên dòng riêng"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleInsertFormula('#?', 'block')}
              className="min-h-[32px] px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-[12px] font-medium"
            >
              Công thức dòng riêng
            </button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              title="Hoàn tác (Ctrl+Z)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().undo().run()}
              className={tbBtnClass(false)}
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Làm lại (Ctrl+Y)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().redo().run()}
              className={tbBtnClass(false)}
            >
              <Redo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setEquationOpen((v) => !v)}
              className="min-h-[32px] px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[12px] font-medium text-slate-700"
            >
              {equationOpen ? 'Ẩn bảng công thức' : 'Hiện bảng công thức'}
            </button>
            {onToggleAdvancedSource && (
              <button
                type="button"
                title="Công cụ nâng cao (chỉ dành cho người dùng chuyên sâu)"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onToggleAdvancedSource}
                className={`${tbBtnClass(advancedSourceOpen)} px-2 gap-1 text-[12px]`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span className="hidden 2xl:inline">Công cụ nâng cao</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ROW 2: 6-GROUP VISUAL EQUATION TOOLBAR */}
      {equationOpen && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {EQUATION_TOOLBAR_GROUPS.map((grp) => {
                const isAct = grp.id === activeEqGroup;
                return (
                  <button
                    key={grp.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveEqGroup(grp.id)}
                    className={`px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors ${
                      isAct
                        ? 'bg-sky-600 text-white font-semibold'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {grp.label}
                  </button>
                );
              })}

              {/* Matrix Custom Row x Col Picker */}
              <div className="relative">
                <button
                  type="button"
                  title="Chèn ma trận / định thức tùy chọn số hàng và cột"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOpenPopover((p) => (p === 'matrix' ? null : 'matrix'))}
                  className="px-2.5 py-1 rounded-md text-[13px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-sky-50 hover:border-sky-300 inline-flex items-center gap-1"
                >
                  <span>Ma trận (m×n)</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {openPopover === 'matrix' && (
                  <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-56 space-y-2">
                    <div className="flex gap-1">
                      {(
                        [
                          ['pmatrix', '( ... )'],
                          ['bmatrix', '[ ... ]'],
                          ['vmatrix', '| ... |'],
                        ] as const
                      ).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setMatrixKind(kind)}
                          className={`flex-1 py-1 rounded text-[12px] font-semibold border ${
                            matrixKind === kind
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="text-[12px] font-medium text-slate-700">
                      Kích thước: {hoverMatrixCell[0]} hàng × {hoverMatrixCell[1]} cột
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {Array.from({ length: 25 }, (_, i) => {
                        const r = Math.floor(i / 5) + 1;
                        const c = (i % 5) + 1;
                        const active = r <= hoverMatrixCell[0] && c <= hoverMatrixCell[1];
                        return (
                          <button
                            key={i}
                            type="button"
                            onMouseEnter={() => setHoverMatrixCell([r, c])}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              handleInsertFormula(buildMatrixLatex(matrixKind, r, c), 'inline')
                            }
                            className={`w-7 h-5 rounded-xs border ${
                              active ? 'bg-sky-500 border-sky-600' : 'bg-slate-50 border-slate-300'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Visual Symbol Buttons Grid */}
          <div className="flex flex-wrap items-center gap-1.5">
            {activeGroup.items.map((item) => (
              <KatexSymbolButton
                key={item.id}
                previewLatex={item.previewLatex}
                tooltip={item.tooltip}
                onClick={() => handleInsertFormula(item.insertLatex, item.display || 'inline')}
              />
            ))}
          </div>

          <div className="text-[13px] text-slate-600">
            Chọn biểu tượng trên thanh công cụ để chèn công thức. Nhấp trực tiếp vào công thức để chỉnh sửa.
          </div>
        </div>
      )}
    </div>
  );
};
