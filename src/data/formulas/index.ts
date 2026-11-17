import { MATH_FORMULAS } from './mathFormulas';
import { PHYSICS_FORMULAS } from './physicsFormulas';
import { CHEMISTRY_FORMULAS } from './chemistryFormulas';
import { FormulaItem } from '../../types';

export const BUILTIN_FORMULAS: FormulaItem[] = [
  ...MATH_FORMULAS,
  ...PHYSICS_FORMULAS,
  ...CHEMISTRY_FORMULAS,
];

// 18 công thức thông dụng tham chiếu trực tiếp từ thư viện chuẩn (không sao chép trùng lặp)
export const COMMON_FORMULA_IDS: string[] = [
  // Toán học (6)
  'toan-10-pt-1',
  'toan-11-dh-0',
  'toan-12-nh-1',
  'toan-12-nh-2',
  'toan-11-lg-1',
  'toan-10-oxy-0',
  // Vật lí (6)
  'ly-10-dh-0',
  'ly-10-dlh-1',
  'ly-10-cnl-0',
  'ly-11-dd-0',
  'ly-11-dd-6',
  'ly-11-sc-1',
  // Hóa học (6)
  'hoa-10-mol-1',
  'hoa-10-mol-2',
  'hoa-10-mol-3',
  'hoa-10-mol-4',
  'hoa-11-ph-1',
  'hoa-10-oxh-1',
];

export interface SymbolButtonItem {
  label: string;
  latex: string;
  title: string;
}

export interface SymbolGroup {
  id: string;
  name: string;
  items: SymbolButtonItem[];
}

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: 'co_ban',
    name: 'Cơ bản & Cấu trúc',
    items: [
      { label: 'a/b', latex: '\\frac{#?}{#?}', title: 'Phân số đứng' },
      { label: 'xⁿ', latex: '^{#?}', title: 'Lũy thừa / Chỉ số trên' },
      { label: 'xₙ', latex: '_{#?}', title: 'Chỉ số dưới' },
      { label: '√x', latex: '\\sqrt{#?}', title: 'Căn bậc hai' },
      { label: 'ⁿ√x', latex: '\\sqrt[#?]{#?}', title: 'Căn bậc n' },
      { label: '|x|', latex: '\\left|#?\\right|', title: 'Giá trị tuyệt đối' },
      { label: '( )', latex: '\\left(#?\\right)', title: 'Dấu ngoặc tròn co giãn' },
      { label: '[ ]', latex: '\\left[#?\\right]', title: 'Dấu ngoặc vuông co giãn' },
      { label: '±', latex: '\\pm', title: 'Cộng trừ' },
      { label: '∓', latex: '\\mp', title: 'Trừ cộng' },
      { label: '×', latex: '\\times', title: 'Dấu nhân' },
      { label: '·', latex: '\\cdot', title: 'Nhân chấm' },
      { label: '÷', latex: '\\div', title: 'Dấu chia' },
      { label: '°', latex: '^\\circ', title: 'Độ' },
    ],
  },
  {
    id: 'quan_he',
    name: 'Quan hệ & Tập hợp & Logic',
    items: [
      { label: '≠', latex: '\\neq', title: 'Khác' },
      { label: '≤', latex: '\\le', title: 'Nhỏ hơn hoặc bằng' },
      { label: '≥', latex: '\\ge', title: 'Lớn hơn hoặc bằng' },
      { label: '≈', latex: '\\approx', title: 'Xấp xỉ' },
      { label: '≡', latex: '\\equiv', title: 'Đồng nhất / Tương đương' },
      { label: '∈', latex: '\\in', title: 'Thuộc' },
      { label: '∉', latex: '\\notin', title: 'Không thuộc' },
      { label: '⊂', latex: '\\subset', title: 'Tập con' },
      { label: '⊆', latex: '\\subseteq', title: 'Tập con hoặc bằng' },
      { label: '∪', latex: '\\cup', title: 'Hợp' },
      { label: '∩', latex: '\\cap', title: 'Giao' },
      { label: '∅', latex: '\\emptyset', title: 'Tập rỗng' },
      { label: '∀', latex: '\\forall', title: 'Với mọi' },
      { label: '∃', latex: '\\exists', title: 'Tồn tại' },
      { label: '⇒', latex: '\\Rightarrow', title: 'Suy ra' },
      { label: '⇔', latex: '\\Leftrightarrow', title: 'Tương đương' },
      { label: '∧', latex: '\\land', title: 'Và (hội)' },
      { label: '∨', latex: '\\lor', title: 'Hoặc (tuyển)' },
      { label: 'ℝ', latex: '\\mathbb{R}', title: 'Tập số thực' },
      { label: 'ℕ', latex: '\\mathbb{N}', title: 'Tập số tự nhiên' },
      { label: 'ℤ', latex: '\\mathbb{Z}', title: 'Tập số nguyên' },
    ],
  },
  {
    id: 'giai_tich',
    name: 'Tổng, Giới hạn, Tích phân, Log',
    items: [
      { label: '∑', latex: '\\sum_{#?}^{#?}{#?}', title: 'Tổng Sigma' },
      { label: '∏', latex: '\\prod_{#?}^{#?}{#?}', title: 'Tích Pi' },
      { label: 'lim', latex: '\\lim_{x \\to #?}{#?}', title: 'Giới hạn' },
      { label: '∞', latex: '\\infty', title: 'Vô cực' },
      { label: '∫', latex: '\\int_{#?}^{#?} #? \\, dx', title: 'Tích phân xác định' },
      { label: '∫dx', latex: '\\int #? \\, dx', title: 'Nguyên hàm' },
      { label: 'd/dx', latex: '\\frac{d#?}{dx}', title: 'Đạo hàm' },
      { label: '∂/∂x', latex: '\\frac{\\partial #?}{\\partial x}', title: 'Đạo hàm riêng' },
      { label: 'logₐ', latex: '\\log_{#?}{#?}', title: 'Logarithm cơ số a' },
      { label: 'ln', latex: '\\ln\\left(#?\\right)', title: 'Logarithm tự nhiên' },
      { label: 'sin', latex: '\\sin\\left(#?\\right)', title: 'Sin' },
      { label: 'cos', latex: '\\cos\\left(#?\\right)', title: 'Cos' },
      { label: 'tan', latex: '\\tan\\left(#?\\right)', title: 'Tan' },
      { label: 'cot', latex: '\\cot\\left(#?\\right)', title: 'Cot' },
    ],
  },
  {
    id: 'hinh_ma_tran',
    name: 'Vectơ, Ma trận, Hệ PT, Hình học',
    items: [
      { label: '→v', latex: '\\vec{#?}', title: 'Vectơ' },
      { label: '→AB', latex: '\\overrightarrow{AB}', title: 'Vectơ AB' },
      { label: 'Hệ 2', latex: '\\begin{cases} #? \\\\ #? \\end{cases}', title: 'Hệ 2 phương trình' },
      { label: 'Hệ 3', latex: '\\begin{cases} #? \\\\ #? \\\\ #? \\end{cases}', title: 'Hệ 3 phương trình' },
      { label: '[2×2]', latex: '\\begin{pmatrix} #? & #? \\\\ #? & #? \\end{pmatrix}', title: 'Ma trận 2×2' },
      { label: '|2×2|', latex: '\\begin{vmatrix} #? & #? \\\\ #? & #? \\end{vmatrix}', title: 'Định thức 2×2' },
      { label: 'Cₙᵏ', latex: 'C_{#?}^{#?}', title: 'Tổ hợp' },
      { label: 'Aₙᵏ', latex: 'A_{#?}^{#?}', title: 'Chỉnh hợp' },
      { label: 'x̄', latex: '\\overline{x}', title: 'Trung bình cộng / gạch ngang' },
      { label: '∠', latex: '\\angle', title: 'Góc' },
      { label: '⊥', latex: '\\perp', title: 'Vuông góc' },
      { label: '∥', latex: '\\parallel', title: 'Song song' },
      { label: '△', latex: '\\triangle', title: 'Tam giác' },
    ],
  },
  {
    id: 'hy_lap_ly_hoa',
    name: 'Hy Lạp & Lý – Hóa',
    items: [
      { label: 'α', latex: '\\alpha', title: 'Alpha' },
      { label: 'β', latex: '\\beta', title: 'Beta' },
      { label: 'γ', latex: '\\gamma', title: 'Gamma' },
      { label: 'Δ', latex: '\\Delta', title: 'Delta' },
      { label: 'ε', latex: '\\varepsilon', title: 'Epsilon' },
      { label: 'λ', latex: '\\lambda', title: 'Lambda' },
      { label: 'μ', latex: '\\mu', title: 'Muy' },
      { label: 'π', latex: '\\pi', title: 'Pi' },
      { label: 'ρ', latex: '\\rho', title: 'Rho' },
      { label: 'σ', latex: '\\sigma', title: 'Sigma' },
      { label: 'φ', latex: '\\varphi', title: 'Phi' },
      { label: 'ω', latex: '\\omega', title: 'Omega nhỏ' },
      { label: 'Ω', latex: '\\Omega', title: 'Ohm (Omega lớn)' },
      { label: '→(t°)', latex: '\\xrightarrow{t^\\circ}', title: 'Mũi tên phản ứng nhiệt độ' },
      { label: '⇌', latex: '\\rightleftharpoons', title: 'Phản ứng thuận nghịch' },
      { label: '↑', latex: '\\uparrow', title: 'Chất khí bay lên' },
      { label: '↓', latex: '\\downarrow', title: 'Chất kết tủa' },
      { label: 'ᴬ_Z X', latex: '{}^{#?}_{#?}\\text{#?}', title: 'Kí hiệu đồng vị / hạt nhân' },
    ],
  },
];
