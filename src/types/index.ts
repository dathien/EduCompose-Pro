export type AppTab =
  | 'home'
  | 'formula'
  | 'drawing'
  | 'omr'
  | 'exam'
  | 'shuffle'
  | 'beautify'
  | 'wordtools'
  | 'projects'
  | 'guide';

export type DrawingStudioMode = 'canvas' | 'gallery' | 'graph' | 'variation' | 'chart';
export type WordToolsMode = 'format' | 'numbering' | 'answers' | 'tables' | 'audit' | 'ocr' | 'word_addin';

export type SubjectType = 'toan' | 'vat_li' | 'hoa_hoc';
export type ExtendedSubjectType = SubjectType | 'tieng_anh' | 'sinh_hoc' | 'tin_hoc' | 'chung';
export type GradeLevel = '10' | '11' | '12' | 'chung';

export interface FormulaItem {
  id: string;
  name: string;
  subject: SubjectType;
  grade: GradeLevel;
  topic: string;
  latex: string;
  variables?: string;
  condition?: string;
  keywords: string[];
  isCustom?: boolean;
  updatedAt?: number;
}

export interface RecentFormulaEntry {
  id: string;
  name: string;
  subject?: SubjectType;
  latex: string;
  usedAt: number;
}

export interface OmmlConversionResult {
  omml: string;
  supported: boolean;
  warnings: string[];
  mathml: string;
}

export type CanvasPagePreset =
  | 'A4_PORTRAIT'
  | 'A4_LANDSCAPE'
  | 'A5_PORTRAIT'
  | 'A3_LANDSCAPE'
  | 'RATIO_16_9'
  | 'RATIO_4_3'
  | 'CUSTOM';

export type StrokeDashStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot';

export type DrawingCategory =
  | 'toan_phang'
  | 'toan_khong_gian'
  | 'ly_co'
  | 'ly_dien'
  | 'ly_song_quang'
  | 'hoa_thuy_tinh'
  | 'hoa_ho_tro'
  | 'hoa_hien_tuong_phan_tu'
  | 'sinh_tin'
  | 'hinh_mau'
  | 'co_ban';

export interface DrawingParams {
  // General & Math geometry
  labels?: string;
  showHiddenEdges?: boolean;
  showRightAngle?: boolean;
  showEqualTicks?: boolean;
  showAltitude?: boolean;
  showCrossSection?: boolean;
  crossSectionColor?: string;
  angleDeg?: number;
  // Physics
  coilCount?: number;
  switchClosed?: boolean;
  arrowLabel?: string;
  waveCycles?: number;
  // Chemistry glassware & phenomena
  liquidLevel?: number;
  liquidColor?: string;
  showPrecipitate?: boolean;
  precipitateColor?: string;
  bubbleCount?: number;
  chemicalLabel?: string;
  flameActive?: boolean;
  // Text / Math element
  textContent?: string;
  fontSize?: number;
  fontFamily?: string;
  isMathFormula?: boolean;
  latex?: string;
  // Embedded pre-computed SVG path/graph/chart data for algorithmic drawings
  embeddedSvgInner?: string;
  embeddedViewBox?: string;
}

export interface DrawingElement {
  id: string;
  kind: string;
  name: string;
  category: DrawingCategory;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDash: StrokeDashStyle;
  opacity: number;
  locked: boolean;
  groupId?: string;
  zIndex: number;
  params: DrawingParams;
}

export interface DrawingProject {
  id: string;
  name: string;
  description?: string;
  subject?: ExtendedSubjectType;
  grade?: GradeLevel;
  topic?: string;
  pagePreset: CanvasPagePreset;
  widthCm: number;
  heightCm: number;
  showGrid: boolean;
  snapToGrid: boolean;
  elements: DrawingElement[];
  thumbnailSvg?: string;
  isFavorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SampleDrawingProject extends DrawingProject {
  isSample: true;
  subject: ExtendedSubjectType;
  grade: GradeLevel;
  topic: string;
}

export interface RichFormulaNodeMeta {
  id: string;
  type: 'formula';
  latex: string;
  display: 'inline' | 'block';
  format: 'latex';
  parseWarning?: boolean;
}

export interface DocumentBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'formula' | 'drawing' | 'table';
  text?: string;
  html?: string;
  formulaNodes?: RichFormulaNodeMeta[];
  latex?: string;
  ommlSupported?: boolean;
  drawingId?: string;
  drawingName?: string;
  svgContent?: string;
  pngDataUrl?: string;
  widthCm?: number;
  heightCm?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  tableHeaders?: string[];
  tableRows?: string[][];
}

export interface WordDocumentRecord {
  id: string;
  name: string;
  source: 'created' | 'imported' | 'template';
  category?: 'giao_an' | 'kiem_tra' | 'bieu_mau';
  subject?: ExtendedSubjectType;
  grade?: GradeLevel;
  blocks: DocumentBlock[];
  summaryText: string;
  ommlCount: number;
  imageCount: number;
  createdAt: number;
  updatedAt: number;
}

// OMR Types
export type OmrPaperPreset =
  | 'A4_PORTRAIT'
  | 'A4_LANDSCAPE'
  | 'A5_PORTRAIT'
  | 'A5_LANDSCAPE'
  | 'A3_PORTRAIT'
  | 'A4_TWO_A5';

export interface OmrBubbleCoord {
  part: 'SBD' | 'MADE' | 'TN' | 'DS' | 'TLN';
  questionIndex?: number;
  subIndex?: string; // e.g. 'a','b','c','d' or digit col
  option?: string;
  cxMm: number;
  cyMm: number;
  rMm: number;
}

export interface OmrTemplateConfig {
  id: string;
  name: string;
  structureLabel: string;
  paperPreset: OmrPaperPreset;
  pages: number;
  mcqCount: number; // Phần I: TN (A,B,C,D)
  tfCount: number; // Phần II: ĐS (a,b,c,d Đ/S)
  shortCount: number; // Phần III: TLN (6 ô -,.,0..9)
  hasEssaySection: boolean;
  essayLines: number;
  hasCutOffHeader: boolean; // Cắt phách
  schoolName: string;
  examTitle: string;
  subjectName: string;
  sbdDigits: number;
  examCodeDigits: number;
  columns: number;
  bubbleRadiusMm: number;
  bubbleGapMm: number;
  showFiducials: boolean;
  templateCode: string;
  instructions: string;
  updatedAt?: number;
}

export interface OmrExportSchema {
  schemaVersion: '1.0';
  templateId: string;
  templateCode: string;
  name: string;
  paperPreset: OmrPaperPreset;
  pageWidthMm: number;
  pageHeightMm: number;
  fiducialsMm: { id: string; xMm: number; yMm: number; sizeMm: number }[];
  sbdRegionMm: { xMm: number; yMm: number; wMm: number; hMm: number; digits: number };
  examCodeRegionMm: { xMm: number; yMm: number; wMm: number; hMm: number; digits: number };
  parts: {
    mcqCount: number;
    tfCount: number;
    shortCount: number;
  };
  bubbles: OmrBubbleCoord[];
  recognitionRules: string;
}

// Exam Authoring, Bank, Matrix & Shuffling
export type QuestionType =
  | 'trac_nghiem'
  | 'dung_sai'
  | 'tra_loi_ngan'
  | 'tu_luan'
  | 'dien_khuyet'
  | 'ghep_noi';

export type CognitiveLevel = 'nhan_biet' | 'thong_hieu' | 'van_dung';

export interface QuestionOptionItem {
  id: string; // Stable ID for shuffling!
  text: string;
  isLockedPosition?: boolean; // e.g., "Cả A và B đều đúng"
}

export interface TrueFalseSubItem {
  id: string;
  text: string;
  isTrue: boolean;
}

export interface ExamQuestion {
  id: string; // Stable ID across shuffles
  subject: ExtendedSubjectType;
  grade: GradeLevel;
  topic: string;
  lesson: string;
  requirement: string; // Yêu cầu cần đạt
  level: CognitiveLevel;
  type: QuestionType;
  points: number;
  sourceName: string;
  verified: boolean; // Đã kiểm duyệt
  stem: string; // Nội dung câu hỏi (có thể chứa $LaTeX$)
  passage?: string; // Ngữ liệu chung (cố định nhóm khi trộn)
  svgIllustration?: string; // Hình vẽ / đồ thị SVG kèm theo
  options?: QuestionOptionItem[]; // Cho trắc nghiệm nhiều lựa chọn
  correctOptionId?: string; // Stable ID of correct option
  tfItems?: TrueFalseSubItem[]; // Cho Đúng/Sai a, b, c, d
  shortAnswer?: string; // Cho trả lời ngắn / điền khuyết
  matchingPairs?: { id: string; left: string; right: string }[]; // Cho ghép nối
  solution?: string; // Lời giải chi tiết
  gradingGuide?: string; // Hướng dẫn chấm
  lockOrder?: boolean; // Cố định vị trí khi trộn
  allowSubItemShuffle?: boolean; // Cho phép trộn ý a,b,c,d nếu là ĐS
  formulaNodes?: RichFormulaNodeMeta[];
  createdAt: number;
  updatedAt: number;
}

export interface ExamMatrixRow {
  id: string;
  topic: string;
  knowledgeUnit: string;
  requirement: string;
  questionType: QuestionType;
  nbCount: number;
  thCount: number;
  vdCount: number;
  pointsPerItem: number;
}

export interface ExamPaper {
  id: string;
  title: string;
  subject: ExtendedSubjectType;
  grade: GradeLevel;
  examPeriod: string; // Thường xuyên / Giữa kì / Cuối kì / Ôn tập / Tốt nghiệp THPT
  durationMinutes: number;
  questionIds: string[];
  questions: ExamQuestion[];
  matrix: ExamMatrixRow[];
  createdAt: number;
  updatedAt: number;
}

export interface ShuffleConfig {
  numCodes: number;
  startCode: number;
  shuffleQuestionsWithinPart: boolean;
  shuffleMcqOptions: boolean;
  shuffleTfSubItems: boolean;
  keepPassageGroupsTogether: boolean;
}

export interface ShuffledVariant {
  code: string;
  questions: ExamQuestion[];
  // Maps original question stable ID -> new question number (1-based)
  questionOrderMap: Record<string, number>;
  // Maps original question stable ID -> option/tf answer string in this variant
  answerKeyByQuestionNum: Record<number, string>;
  // Exact mapping of options e.g. { "1": "C (gốc A)" }
  permutationDetails: {
    newNum: number;
    originalQuestionId: string;
    originalNum: number;
    type: QuestionType;
    answerInVariant: string;
    optionMap?: string;
  }[];
}

export interface AppBackupPayload {
  app: 'SMART DOCX PRO';
  version: number;
  exportedAt: number;
  personalFormulas: FormulaItem[];
  favoriteFormulaIds: string[];
  recentFormulas: RecentFormulaEntry[];
  drawings: DrawingProject[];
  documents: WordDocumentRecord[];
  favoriteDrawingIds?: string[];
  omrConfigs?: OmrTemplateConfig[];
  questionBank?: ExamQuestion[];
  exams?: ExamPaper[];
}
