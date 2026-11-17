export interface VisualEquationTemplate {
  id: string;
  /** Rendered visually via KaTeX inside the toolbar button (never raw LaTeX text!) */
  previewLatex: string;
  /** Inserted into MathLive <math-field> (uses #? for fillable slots) */
  insertLatex: string;
  /** Vietnamese tooltip shown on hover */
  tooltip: string;
  /** Optional display mode when inserted into prose */
  display?: 'inline' | 'block';
}

export interface VisualEquationGroup {
  id: 'basic' | 'relations' | 'calculus' | 'geometry' | 'physics' | 'chemistry' | 'accents';
  label: string;
  items: VisualEquationTemplate[];
}

export function buildMatrixLatex(
  kind: 'pmatrix' | 'bmatrix' | 'vmatrix',
  rows: number,
  cols: number
): string {
  const rowStr = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => '#?').join(' & ')
  ).join(' \\\\ ');
  return `\\begin{${kind}} ${rowStr} \\end{${kind}}`;
}

export const ACCENT_ITEMS: VisualEquationTemplate[] = [
  {
    "id": "accent_0",
    "previewLatex": "\\overline{AB}",
    "insertLatex": "\\overline{#?}",
    "tooltip": "Gạch ngang dài"
  },
  {
    "id": "accent_1",
    "previewLatex": "\\bar{P}",
    "insertLatex": "\\bar{#?}",
    "tooltip": "Gạch ngang ngắn"
  },
  {
    "id": "accent_2",
    "previewLatex": "\\overline{\\overline{AB}}",
    "insertLatex": "\\overline{\\overline{#?}}",
    "tooltip": "Gạch ngang kép"
  },
  {
    "id": "accent_3",
    "previewLatex": "\\hat{A}",
    "insertLatex": "\\hat{#?}",
    "tooltip": "Dấu mũ"
  },
  {
    "id": "accent_4",
    "previewLatex": "\\widehat{ABC}",
    "insertLatex": "\\widehat{#?}",
    "tooltip": "Dấu mũ dài"
  },
  {
    "id": "accent_5",
    "previewLatex": "\\overrightarrow{AB}",
    "insertLatex": "\\overrightarrow{#?}",
    "tooltip": "Vectơ sang phải"
  },
  {
    "id": "accent_6",
    "previewLatex": "\\overleftarrow{AB}",
    "insertLatex": "\\overleftarrow{#?}",
    "tooltip": "Vectơ sang trái"
  },
  {
    "id": "accent_7",
    "previewLatex": "\\overleftrightarrow{AB}",
    "insertLatex": "\\overleftrightarrow{#?}",
    "tooltip": "Mũi tên hai chiều"
  },
  {
    "id": "accent_8",
    "previewLatex": "\\dot{x}",
    "insertLatex": "\\dot{#?}",
    "tooltip": "Một dấu chấm"
  },
  {
    "id": "accent_9",
    "previewLatex": "\\ddot{x}",
    "insertLatex": "\\ddot{#?}",
    "tooltip": "Hai dấu chấm"
  },
  {
    "id": "accent_10",
    "previewLatex": "\\dddot{x}",
    "insertLatex": "\\dddot{#?}",
    "tooltip": "Ba dấu chấm"
  },
  {
    "id": "accent_11",
    "previewLatex": "\\widetilde{AB}",
    "insertLatex": "\\widetilde{#?}",
    "tooltip": "Dấu ngã"
  },
  {
    "id": "accent_12",
    "previewLatex": "\\overgroup{AB}",
    "insertLatex": "\\overgroup{#?}",
    "tooltip": "Dấu cung"
  },
  {
    "id": "accent_13",
    "previewLatex": "\\underline{AB}",
    "insertLatex": "\\underline{#?}",
    "tooltip": "Gạch dưới"
  },
  {
    "id": "accent_14",
    "previewLatex": "\\overbrace{AB}",
    "insertLatex": "\\overbrace{#?}",
    "tooltip": "Ngoặc nhọn trên"
  },
  {
    "id": "accent_15",
    "previewLatex": "\\underbrace{AB}",
    "insertLatex": "\\underbrace{#?}",
    "tooltip": "Ngoặc nhọn dưới"
  },
  {
    "id": "remove_above",
    "previewLatex": "P",
    "insertLatex": "@remove-above",
    "tooltip": "Bỏ dấu trên (chọn cả biểu thức có dấu)"
  },
  {
    "id": "remove_below",
    "previewLatex": "AB",
    "insertLatex": "@remove-below",
    "tooltip": "Bỏ dấu dưới (chọn cả biểu thức có dấu)"
  }
];

export const EQUATION_TOOLBAR_GROUPS: VisualEquationGroup[] = [
  {
    id: 'basic',
    label: 'Cơ bản & Cấu trúc',
    items: [
      { id: 'frac', previewLatex: '\\frac{a}{b}', insertLatex: '\\frac{#?}{#?}', tooltip: 'Phân số' },
      {
        id: 'nested_frac',
        previewLatex: '\\frac{\\sqrt{a}}{b}',
        insertLatex: '\\frac{\\sqrt{#?}}{#?}',
        tooltip: 'Phân số chứa căn thức',
      },
      { id: 'sup', previewLatex: 'x^{n}', insertLatex: '{#?}^{#?}', tooltip: 'Số mũ / Lũy thừa' },
      { id: 'sub', previewLatex: 'x_{n}', insertLatex: '{#?}_{#?}', tooltip: 'Chỉ số dưới' },
      {
        id: 'subsup',
        previewLatex: 'x_{i}^{n}',
        insertLatex: '{#?}_{#?}^{#?}',
        tooltip: 'Chỉ số trên và dưới đồng thời',
      },
      { id: 'sqrt', previewLatex: '\\sqrt{x}', insertLatex: '\\sqrt{#?}', tooltip: 'Căn bậc hai' },
      { id: 'cbrt', previewLatex: '\\sqrt[3]{x}', insertLatex: '\\sqrt[3]{#?}', tooltip: 'Căn bậc ba' },
      { id: 'nrt', previewLatex: '\\sqrt[n]{x}', insertLatex: '\\sqrt[#?]{#?}', tooltip: 'Căn bậc n' },
      { id: 'abs', previewLatex: '|x|', insertLatex: '\\left|#?\\right|', tooltip: 'Giá trị tuyệt đối' },
      { id: 'paren', previewLatex: '(a+b)', insertLatex: '\\left(#?\\right)', tooltip: 'Ngoặc tròn co giãn' },
      { id: 'bracket', previewLatex: '[a; b]', insertLatex: '\\left[#?\\right]', tooltip: 'Ngoặc vuông co giãn' },
      { id: 'brace', previewLatex: '\\{a, b\\}', insertLatex: '\\left\\{#?\\right\\}', tooltip: 'Ngoặc nhọn tập hợp' },
    ],
  },
  {
    id: 'accents',
    label: 'Dấu trên và dấu dưới',
    items: ACCENT_ITEMS,
  },
  {
    id: 'relations',
    label: 'Quan hệ & Tập hợp',
    items: [
      { id: 'eq', previewLatex: '=', insertLatex: '=', tooltip: 'Dấu bằng' },
      { id: 'neq', previewLatex: '\\neq', insertLatex: '\\neq', tooltip: 'Khác' },
      { id: 'approx', previewLatex: '\\approx', insertLatex: '\\approx', tooltip: 'Xấp xỉ' },
      { id: 'gt', previewLatex: '>', insertLatex: '>', tooltip: 'Lớn hơn' },
      { id: 'lt', previewLatex: '<', insertLatex: '<', tooltip: 'Nhỏ hơn' },
      { id: 'geq', previewLatex: '\\geq', insertLatex: '\\geq', tooltip: 'Lớn hơn hoặc bằng' },
      { id: 'leq', previewLatex: '\\leq', insertLatex: '\\leq', tooltip: 'Nhỏ hơn hoặc bằng' },
      { id: 'in', previewLatex: '\\in', insertLatex: '\\in', tooltip: 'Thuộc tập hợp' },
      { id: 'notin', previewLatex: '\\notin', insertLatex: '\\notin', tooltip: 'Không thuộc tập hợp' },
      { id: 'subset', previewLatex: '\\subset', insertLatex: '\\subset', tooltip: 'Tập con' },
      { id: 'cup', previewLatex: '\\cup', insertLatex: '\\cup', tooltip: 'Hợp tập hợp' },
      { id: 'cap', previewLatex: '\\cap', insertLatex: '\\cap', tooltip: 'Giao tập hợp' },
      { id: 'empty', previewLatex: '\\emptyset', insertLatex: '\\emptyset', tooltip: 'Tập rỗng' },
      { id: 'impl', previewLatex: '\\Rightarrow', insertLatex: '\\Rightarrow', tooltip: 'Suy ra' },
      { id: 'iff', previewLatex: '\\Leftrightarrow', insertLatex: '\\Leftrightarrow', tooltip: 'Tương đương' },
      { id: 'inf', previewLatex: '\\infty', insertLatex: '\\infty', tooltip: 'Vô cực' },
      { id: 'pm', previewLatex: '\\pm', insertLatex: '\\pm', tooltip: 'Cộng trừ' },
      { id: 'real', previewLatex: '\\mathbb{R}', insertLatex: '\\mathbb{R}', tooltip: 'Tập số thực R' },
    ],
  },
  {
    id: 'calculus',
    label: 'Đại số & Giải tích',
    items: [
      { id: 'fx', previewLatex: 'f(x)', insertLatex: 'f(#?)', tooltip: 'Hàm số f(x)' },
      { id: 'dfx', previewLatex: "f'(x)", insertLatex: "f'(#?)", tooltip: 'Đạo hàm cấp một' },
      { id: 'd2fx', previewLatex: "f''(x)", insertLatex: "f''(#?)", tooltip: 'Đạo hàm cấp hai' },
      { id: 'ddx', previewLatex: '\\frac{d}{dx}', insertLatex: '\\frac{d}{dx}\\left(#?\\right)', tooltip: 'Vi phân d/dx' },
      { id: 'lim', previewLatex: '\\lim_{x \\to a}', insertLatex: '\\lim_{x \\to #?} #?', tooltip: 'Giới hạn hàm số' },
      { id: 'sum', previewLatex: '\\sum_{i=1}^{n}', insertLatex: '\\sum_{i=#?}^{#?} #?', tooltip: 'Tổng xích-ma' },
      { id: 'prod', previewLatex: '\\prod_{i=1}^{n}', insertLatex: '\\prod_{i=#?}^{#?} #?', tooltip: 'Tích pi' },
      { id: 'int', previewLatex: '\\int f(x)dx', insertLatex: '\\int #? \\, dx', tooltip: 'Nguyên hàm' },
      {
        id: 'def_int',
        previewLatex: '\\int_{a}^{b} f(x)dx',
        insertLatex: '\\int_{#?}^{#?} #? \\, dx',
        tooltip: 'Tích phân xác định có cận',
      },
      { id: 'log', previewLatex: '\\log_{a} b', insertLatex: '\\log_{#?}\\left(#?\\right)', tooltip: 'Logarit cơ số a' },
      { id: 'ln', previewLatex: '\\ln x', insertLatex: '\\ln\\left(#?\\right)', tooltip: 'Logarit tự nhiên ln' },
      { id: 'exp_a', previewLatex: 'a^{x}', insertLatex: 'a^{#?}', tooltip: 'Hàm mũ cơ số a' },
      { id: 'exp_e', previewLatex: 'e^{x}', insertLatex: 'e^{#?}', tooltip: 'Hàm mũ e^x' },
      { id: 'sin', previewLatex: '\\sin x', insertLatex: '\\sin\\left(#?\\right)', tooltip: 'Hàm sin' },
      { id: 'cos', previewLatex: '\\cos x', insertLatex: '\\cos\\left(#?\\right)', tooltip: 'Hàm cos' },
      { id: 'tan', previewLatex: '\\tan x', insertLatex: '\\tan\\left(#?\\right)', tooltip: 'Hàm tan' },
      { id: 'cot', previewLatex: '\\cot x', insertLatex: '\\cot\\left(#?\\right)', tooltip: 'Hàm cot' },
      { id: 'comb', previewLatex: 'C_{n}^{k}', insertLatex: 'C_{#?}^{#?}', tooltip: 'Tổ hợp chập k của n' },
      { id: 'perm', previewLatex: 'A_{n}^{k}', insertLatex: 'A_{#?}^{#?}', tooltip: 'Chỉnh hợp chập k của n' },
      { id: 'fact', previewLatex: 'n!', insertLatex: '{#?}!', tooltip: 'Giai thừa' },
    ],
  },
  {
    id: 'geometry',
    label: 'Hình học, Vectơ & Hệ',
    items: [
      { id: 'vec', previewLatex: '\\vec{v}', insertLatex: '\\vec{#?}', tooltip: 'Vectơ ký hiệu 1 chữ' },
      {
        id: 'overarrow',
        previewLatex: '\\overrightarrow{AB}',
        insertLatex: '\\overrightarrow{#?}',
        tooltip: 'Vectơ hai điểm AB',
      },
      { id: 'angle', previewLatex: '\\widehat{ABC}', insertLatex: '\\widehat{#?}', tooltip: 'Góc' },
      { id: 'deg', previewLatex: '90^\\circ', insertLatex: '{#?}^\\circ', tooltip: 'Độ (°)' },
      { id: 'perp', previewLatex: '\\perp', insertLatex: '\\perp', tooltip: 'Vuông góc' },
      { id: 'para', previewLatex: '\\parallel', insertLatex: '\\parallel', tooltip: 'Song song' },
      { id: 'norm', previewLatex: '|\\vec{a}|', insertLatex: '\\left|\\vec{#?}\\right|', tooltip: 'Độ dài vectơ' },
      { id: 'coord', previewLatex: '(x; y)', insertLatex: '(#?;\\,#?)', tooltip: 'Tọa độ (x; y)' },
      { id: 'coord3', previewLatex: '(x; y; z)', insertLatex: '(#?;\\,#?;\\,#?)', tooltip: 'Tọa độ không gian Oxyz' },
      { id: 'dot', previewLatex: '\\vec{a}\\cdot\\vec{b}', insertLatex: '\\vec{#?}\\cdot\\vec{#?}', tooltip: 'Tích vô hướng hai vectơ' },
      {
        id: 'sys2',
        previewLatex: '\\begin{cases} a \\\\ b \\end{cases}',
        insertLatex: '\\begin{cases} #? \\\\ #? \\end{cases}',
        tooltip: 'Hệ phương trình 2 dòng',
      },
      {
        id: 'sys3',
        previewLatex: '\\begin{cases} a \\\\ b \\\\ c \\end{cases}',
        insertLatex: '\\begin{cases} #? \\\\ #? \\\\ #? \\end{cases}',
        tooltip: 'Hệ phương trình 3 dòng',
      },
      {
        id: 'piecewise',
        previewLatex: 'f(x)=\\begin{cases} x \\\\ -x \\end{cases}',
        insertLatex: 'f(x) = \\begin{cases} #? & \\text{khi } #? \\\\ #? & \\text{khi } #? \\end{cases}',
        tooltip: 'Biểu thức chia trường hợp',
      },
      {
        id: 'mat2',
        previewLatex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
        insertLatex: '\\begin{pmatrix} #? & #? \\\\ #? & #? \\end{pmatrix}',
        tooltip: 'Ma trận 2×2',
      },
      {
        id: 'det2',
        previewLatex: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}',
        insertLatex: '\\begin{vmatrix} #? & #? \\\\ #? & #? \\end{vmatrix}',
        tooltip: 'Định thức 2×2',
      },
    ],
  },
  {
    id: 'physics',
    label: 'Ký hiệu Vật lí',
    items: [
      { id: 'Delta', previewLatex: '\\Delta', insertLatex: '\\Delta', tooltip: 'Delta (độ biến thiên)' },
      { id: 'Omega', previewLatex: '\\Omega', insertLatex: '\\Omega', tooltip: 'Ôm (đơn vị điện trở)' },
      { id: 'omega', previewLatex: '\\omega', insertLatex: '\\omega', tooltip: 'Tần số góc omega' },
      { id: 'lambda', previewLatex: '\\lambda', insertLatex: '\\lambda', tooltip: 'Bước sóng lam-đa' },
      { id: 'alpha', previewLatex: '\\alpha', insertLatex: '\\alpha', tooltip: 'Alpha' },
      { id: 'beta', previewLatex: '\\beta', insertLatex: '\\beta', tooltip: 'Beta' },
      { id: 'gamma', previewLatex: '\\gamma', insertLatex: '\\gamma', tooltip: 'Gamma' },
      { id: 'varphi', previewLatex: '\\varphi', insertLatex: '\\varphi', tooltip: 'Pha ban đầu phi' },
      { id: 'mu', previewLatex: '\\mu', insertLatex: '\\mu', tooltip: 'Hệ số ma sát / micro' },
      { id: 'vecF', previewLatex: '\\vec{F}', insertLatex: '\\vec{F}', tooltip: 'Vectơ lực F' },
      { id: 'vecv', previewLatex: '\\vec{v}', insertLatex: '\\vec{v}', tooltip: 'Vectơ vận tốc v' },
      { id: 'veca', previewLatex: '\\vec{a}', insertLatex: '\\vec{a}', tooltip: 'Vectơ gia tốc a' },
      { id: 'unit_ms2', previewLatex: '\\mathrm{m/s^2}', insertLatex: '\\,\\mathrm{m/s^2}', tooltip: 'Đơn vị gia tốc m/s²' },
      { id: 'unit_ms', previewLatex: '\\mathrm{m/s}', insertLatex: '\\,\\mathrm{m/s}', tooltip: 'Đơn vị vận tốc m/s' },
      { id: 'tempC', previewLatex: '^\\circ\\mathrm{C}', insertLatex: '^\\circ\\mathrm{C}', tooltip: 'Nhiệt độ độ C' },
      { id: 'sci10', previewLatex: '\\times 10^{n}', insertLatex: '\\times 10^{#?}', tooltip: 'Số mũ khoa học ×10ⁿ' },
    ],
  },
  {
    id: 'chemistry',
    label: 'Ký hiệu Hóa học',
    items: [
      { id: 'chem_h2o', previewLatex: '\\mathrm{H_2O}', insertLatex: '\\mathrm{H_2O}', tooltip: 'Nước (ký hiệu nguyên tố đứng thẳng)' },
      { id: 'chem_h2so4', previewLatex: '\\mathrm{H_2SO_4}', insertLatex: '\\mathrm{H_2SO_4}', tooltip: 'Axit sunfuric' },
      {
        id: 'chem_elem',
        previewLatex: '\\mathrm{X}_{a}^{b}',
        insertLatex: '\\mathrm{#?}_{#?}^{#?}',
        tooltip: 'Nguyên tố kèm chỉ số / điện tích (chữ đứng thẳng)',
      },
      { id: 'chem_ion', previewLatex: '\\mathrm{SO_4^{2-}}', insertLatex: '\\mathrm{SO_4^{2-}}', tooltip: 'Ion sunfat SO₄²⁻' },
      { id: 'chem_fe3', previewLatex: '\\mathrm{Fe^{3+}}', insertLatex: '\\mathrm{Fe^{3+}}', tooltip: 'Ion Fe³⁺' },
      {
        id: 'chem_ox',
        previewLatex: '\\stackrel{+6}{\\mathrm{S}}',
        insertLatex: '\\stackrel{#?}{\\mathrm{#?}}',
        tooltip: 'Số oxi hóa trên nguyên tố',
      },
      {
        id: 'chem_iso',
        previewLatex: '{}^{14}_{6}\\mathrm{C}',
        insertLatex: '{}^{#?}_{#?}\\mathrm{#?}',
        tooltip: 'Ký hiệu đồng vị hạt nhân',
      },
      { id: 'chem_arrow', previewLatex: '\\rightarrow', insertLatex: '\\rightarrow', tooltip: 'Mũi tên phản ứng một chiều' },
      { id: 'chem_eq', previewLatex: '\\rightleftharpoons', insertLatex: '\\rightleftharpoons', tooltip: 'Mũi tên phản ứng thuận nghịch' },
      {
        id: 'chem_cond',
        previewLatex: '\\xrightarrow{t^\\circ, \\mathrm{xt}}',
        insertLatex: '\\xrightarrow{#?}',
        tooltip: 'Mũi tên có điều kiện phản ứng',
      },
      { id: 'chem_s', previewLatex: '\\mathrm{C-C}', insertLatex: '\\mathrm{#?- #?}', tooltip: 'Liên kết đơn' },
      { id: 'chem_d', previewLatex: '\\mathrm{C=C}', insertLatex: '\\mathrm{#?=#?}', tooltip: 'Liên kết đôi' },
      { id: 'chem_t', previewLatex: '\\mathrm{C\\equiv C}', insertLatex: '\\mathrm{#?\\equiv#?}', tooltip: 'Liên kết ba' },
      { id: 'chem_gas', previewLatex: '\\uparrow', insertLatex: '\\uparrow', tooltip: 'Chất khí thoát ra' },
      { id: 'chem_ppt', previewLatex: '\\downarrow', insertLatex: '\\downarrow', tooltip: 'Kết tủa' },
      { id: 'chem_aq', previewLatex: '\\mathrm{(dd)}', insertLatex: '\\mathrm{(dd)}', tooltip: 'Trạng thái dung dịch (dd)' },
      { id: 'chem_r', previewLatex: '\\mathrm{(r)}', insertLatex: '\\mathrm{(r)}', tooltip: 'Trạng thái rắn (r)' },
      { id: 'chem_k', previewLatex: '\\mathrm{(k)}', insertLatex: '\\mathrm{(k)}', tooltip: 'Trạng thái khí (k)' },
    ],
  },
];
