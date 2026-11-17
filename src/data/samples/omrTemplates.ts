import { OmrPaperPreset, OmrTemplateConfig } from '../../types';

function makeOmr(
  id: string,
  name: string,
  structureLabel: string,
  mcqCount: number,
  tfCount: number,
  shortCount: number,
  opts: Partial<OmrTemplateConfig> = {}
): OmrTemplateConfig {
  return {
    id,
    name,
    structureLabel,
    paperPreset: opts.paperPreset || 'A4_PORTRAIT',
    pages: opts.pages ?? 1,
    mcqCount,
    tfCount,
    shortCount,
    hasEssaySection: opts.hasEssaySection ?? false,
    essayLines: opts.essayLines ?? 0,
    hasCutOffHeader: opts.hasCutOffHeader ?? false,
    schoolName: 'TRƯỜNG: ....................................................',
    examTitle: 'PHIẾU TRẢ LỜI TRẮC NGHIỆM',
    subjectName: 'Môn thi: .........................................',
    sbdDigits: opts.sbdDigits ?? 6,
    examCodeDigits: opts.examCodeDigits ?? 3,
    columns: opts.columns ?? (mcqCount >= 40 ? 4 : mcqCount >= 20 ? 2 : 2),
    bubbleRadiusMm: opts.bubbleRadiusMm ?? 2.3,
    bubbleGapMm: opts.bubbleGapMm ?? 5.6,
    showFiducials: true,
    templateCode: `OMR-${id.toUpperCase()}`,
    instructions: 'Tô kín bằng bút chì đen (2B), không tô mờ hoặc tẩy rách ô tròn.',
    ...opts,
  };
}

export const BUILTIN_OMR_TEMPLATES: OmrTemplateConfig[] = [
  makeOmr('12_4_6', 'Phiếu chuẩn 2025 (12 TN – 4 ĐS – 6 TLN)', '12-4-6', 12, 4, 6, {
    paperPreset: 'A4_PORTRAIT',
    columns: 2,
  }),
  makeOmr('12_4_0', 'Phiếu 12 TN – 4 Đúng/Sai', '12-4-0', 12, 4, 0, {
    paperPreset: 'A4_PORTRAIT',
    columns: 2,
  }),
  makeOmr('12_2_4', 'Phiếu gọn 12 TN – 2 ĐS – 4 TLN', '12-2-4', 12, 2, 4, {
    paperPreset: 'A5_PORTRAIT',
    columns: 2,
  }),
  makeOmr('12_0_4', 'Phiếu 12 TN – 4 Trả lời ngắn', '12-0-4', 12, 0, 4, {
    paperPreset: 'A5_PORTRAIT',
    columns: 2,
  }),
  makeOmr('10_3_4', 'Phiếu 10 TN – 3 ĐS – 4 TLN (A5 / 2×A5)', '10-3-4', 10, 3, 4, {
    paperPreset: 'A4_TWO_A5',
    columns: 2,
  }),
  makeOmr('18_4_6', 'Phiếu 18 TN – 4 ĐS – 6 TLN (Khoa học tự nhiên)', '18-4-6', 18, 4, 6, {
    paperPreset: 'A4_PORTRAIT',
    columns: 3,
  }),
  makeOmr('16_2_4', 'Phiếu 16 TN – 2 ĐS – 4 TLN', '16-2-4', 16, 2, 4, {
    paperPreset: 'A4_PORTRAIT',
    columns: 2,
  }),
  makeOmr('20_tn', 'Phiếu kiểm tra 20 câu Trắc nghiệm', '20 TN', 20, 0, 0, {
    paperPreset: 'A5_PORTRAIT',
    columns: 2,
  }),
  makeOmr('24_tn', 'Phiếu kiểm tra 24 câu Trắc nghiệm', '24 TN', 24, 0, 0, {
    paperPreset: 'A5_PORTRAIT',
    columns: 2,
  }),
  makeOmr('28_12_ds', 'Phiếu mở rộng 28 TN – 12 Đúng/Sai (2 trang)', '28 TN - 12 ĐS', 28, 12, 0, {
    paperPreset: 'A4_PORTRAIT',
    pages: 2,
    columns: 3,
  }),
  makeOmr('30_tn', 'Phiếu kiểm tra 30 câu Trắc nghiệm', '30 TN', 30, 0, 0, {
    paperPreset: 'A4_PORTRAIT',
    columns: 3,
  }),
  makeOmr('40_tn', 'Phiếu chuẩn 40 câu Trắc nghiệm (Tiếng Anh / KHTN)', '40 TN', 40, 0, 0, {
    paperPreset: 'A4_PORTRAIT',
    columns: 4,
  }),
  makeOmr('50_tn', 'Phiếu 50 câu Trắc nghiệm truyền thống', '50 TN', 50, 0, 0, {
    paperPreset: 'A4_PORTRAIT',
    columns: 4,
  }),
  makeOmr('60_tn', 'Phiếu 60 câu Trắc nghiệm (Ôn tập tổng hợp)', '60 TN', 60, 0, 0, {
    paperPreset: 'A4_PORTRAIT',
    columns: 4,
  }),
  makeOmr('80_tn', 'Phiếu 80 câu Trắc nghiệm (Đánh giá năng lực)', '80 TN', 80, 0, 0, {
    paperPreset: 'A4_PORTRAIT',
    columns: 4,
  }),
  makeOmr('100_tn', 'Phiếu 100 câu Trắc nghiệm (Khổ A4 / A3)', '100 TN', 100, 0, 0, {
    paperPreset: 'A4_PORTRAIT',
    columns: 4,
    bubbleRadiusMm: 2.0,
    bubbleGapMm: 4.8,
  }),
  makeOmr('12_ds', 'Phiếu chuyên biệt 12 câu Đúng / Sai', '12 ĐS', 0, 12, 0, {
    paperPreset: 'A4_PORTRAIT',
    columns: 2,
  }),
  makeOmr('20_ds', 'Phiếu chuyên biệt 20 câu Đúng / Sai', '20 ĐS', 0, 20, 0, {
    paperPreset: 'A4_PORTRAIT',
    columns: 2,
  }),
  makeOmr('10_tln', 'Phiếu chuyên biệt 10 câu Trả lời ngắn', '10 TLN', 0, 0, 10, {
    paperPreset: 'A4_PORTRAIT',
    columns: 2,
  }),
  makeOmr('12_4_6_tl', 'Phiếu kết hợp 12 TN – 4 ĐS – 6 TLN + Tự luận', '12-4-6 + TL', 12, 4, 6, {
    paperPreset: 'A4_PORTRAIT',
    hasEssaySection: true,
    essayLines: 14,
    hasCutOffHeader: true,
  }),
];

export const OMR_PAPER_DIMENSIONS_MM: Record<
  OmrPaperPreset,
  { label: string; widthMm: number; heightMm: number; subSheetCount: 1 | 2 }
> = {
  A4_PORTRAIT: { label: 'A4 Dọc (210 × 297 mm)', widthMm: 210, heightMm: 297, subSheetCount: 1 },
  A4_LANDSCAPE: { label: 'A4 Ngang (297 × 210 mm)', widthMm: 297, heightMm: 210, subSheetCount: 1 },
  A5_PORTRAIT: { label: 'A5 Dọc (148 × 210 mm)', widthMm: 148, heightMm: 210, subSheetCount: 1 },
  A5_LANDSCAPE: { label: 'A5 Ngang (210 × 148 mm)', widthMm: 210, heightMm: 148, subSheetCount: 1 },
  A3_PORTRAIT: { label: 'A3 Dọc (297 × 420 mm)', widthMm: 297, heightMm: 420, subSheetCount: 1 },
  A4_TWO_A5: { label: '2 phiếu A5 trên 1 trang A4 Ngang (297 × 210 mm)', widthMm: 297, heightMm: 210, subSheetCount: 2 },
};
