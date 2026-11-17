import { OmrBubbleCoord, OmrExportSchema, OmrTemplateConfig } from '../../types';
import { OMR_PAPER_DIMENSIONS_MM } from '../../data/samples/omrTemplates';

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface GeneratedOmrOutput {
  svgString: string;
  schema: OmrExportSchema;
  widthMm: number;
  heightMm: number;
}

/**
 * Generates an exact physical millimeter SVG OMR sheet + matching JSON bubble coordinates.
 * Works with A4, A5, A3, and 2×A5 side-by-side on A4 Landscape (`A4_TWO_A5`).
 */
export function buildOmrSheetSvg(cfg: OmrTemplateConfig): GeneratedOmrOutput {
  const paper = OMR_PAPER_DIMENSIONS_MM[cfg.paperPreset] || OMR_PAPER_DIMENSIONS_MM.A4_PORTRAIT;
  const W = paper.widthMm;
  const H = paper.heightMm;

  const bubbles: OmrBubbleCoord[] = [];
  const fiducials: OmrExportSchema['fiducialsMm'] = [];
  const sheets = paper.subSheetCount === 2 ? 2 : 1;
  const sheetW = sheets === 2 ? (W - 6) / 2 : W;

  const allParts: string[] = [];
  let sbdBox = { xMm: 0, yMm: 0, wMm: 0, hMm: 0, digits: cfg.sbdDigits };
  let codeBox = { xMm: 0, yMm: 0, wMm: 0, hMm: 0, digits: cfg.examCodeDigits };

  const r = Math.max(1.5, Math.min(2.6, cfg.bubbleRadiusMm));
  const rowStep = Math.max(4.4, r * 2 + 1.4);

  for (let sIdx = 0; sIdx < sheets; sIdx++) {
    const ox = sIdx === 0 ? 0 : sheetW + 6;
    const pad = sheets === 2 ? 7 : 10;
    const innerW = sheetW - pad * 2;
    const parts: string[] = [];

    // Cut guide between 2 A5 sheets
    if (sIdx === 1) {
      parts.push(
        `<line x1="${sheetW + 3}" y1="4" x2="${sheetW + 3}" y2="${H - 4}" stroke="#94a3b8" stroke-width="0.35" stroke-dasharray="3,2"/>`
      );
    }

    // 4 Corner Fiducial Squares (5x5 mm) for scanner calibration
    if (cfg.showFiducials) {
      const fSize = sheets === 2 ? 4.2 : 5.2;
      const coords = [
        { id: `TL_${sIdx}`, x: ox + pad - 2, y: pad - 2 },
        { id: `TR_${sIdx}`, x: ox + sheetW - pad - fSize + 2, y: pad - 2 },
        { id: `BL_${sIdx}`, x: ox + pad - 2, y: H - pad - fSize + 2 },
        { id: `BR_${sIdx}`, x: ox + sheetW - pad - fSize + 2, y: H - pad - fSize + 2 },
      ];
      for (const c of coords) {
        parts.push(`<rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${fSize}" height="${fSize}" fill="#0f172a"/>`);
        if (sIdx === 0) {
          fiducials.push({ id: c.id, xMm: c.x, yMm: c.y, sizeMm: fSize });
        }
      }
    }

    let curY = pad + 4;

    // Header Title + Optional Cut-off Header (Cắt phách)
    parts.push(
      `<text x="${(ox + sheetW / 2).toFixed(2)}" y="${(curY + 3).toFixed(2)}" text-anchor="middle" font-size="3.4" font-weight="700" font-family="Inter, Arial, sans-serif" fill="#0f172a">${esc(cfg.schoolName)}</text>`
    );
    curY += 5;
    parts.push(
      `<text x="${(ox + sheetW / 2).toFixed(2)}" y="${(curY + 3.2).toFixed(2)}" text-anchor="middle" font-size="4.4" font-weight="700" font-family="Inter, Arial, sans-serif" fill="#0f172a">${esc(cfg.examTitle)}</text>`
    );
    curY += 5;
    parts.push(
      `<text x="${(ox + sheetW / 2).toFixed(2)}" y="${(curY + 2.4).toFixed(2)}" text-anchor="middle" font-size="3.1" font-family="Inter, Arial, sans-serif" fill="#334155">${esc(cfg.subjectName)}   |   Mã phiếu: ${esc(cfg.templateCode)}</text>`
    );
    curY += 5;

    // Candidate info + SBD + Mã đề block
    const infoH = 54;
    const sbdColW = Math.min(34, cfg.sbdDigits * 4.5 + 4);
    const codeColW = Math.min(22, cfg.examCodeDigits * 4.5 + 4);
    const leftInfoW = Math.max(46, innerW - sbdColW - codeColW - 6);

    // Candidate box on left
    parts.push(
      `<rect x="${ox + pad}" y="${curY}" width="${leftInfoW.toFixed(2)}" height="${infoH}" fill="none" stroke="#0f172a" stroke-width="0.4"/>`
    );
    const fields = [
      'Họ và tên: ..................................................',
      'Ngày sinh: .......................  Lớp: ................',
      'Phòng thi: .......................  Ngày thi: ............',
      'Chữ kí thí sinh: ...........................................',
      `Lưu ý: ${cfg.instructions.slice(0, 52)}`,
    ];
    fields.forEach((f, idx) => {
      parts.push(
        `<text x="${(ox + pad + 2.5).toFixed(2)}" y="${(curY + 8 + idx * 9.6).toFixed(2)}" font-size="2.9" font-family="Inter, Arial, sans-serif" fill="#0f172a">${esc(f)}</text>`
      );
    });

    // SBD Matrix (0-9)
    const sbdX = ox + pad + leftInfoW + 3;
    parts.push(
      `<rect x="${sbdX.toFixed(2)}" y="${curY}" width="${sbdColW.toFixed(2)}" height="${infoH}" fill="none" stroke="#0f172a" stroke-width="0.4"/>`
    );
    parts.push(
      `<text x="${(sbdX + sbdColW / 2).toFixed(2)}" y="${curY + 4.2}" text-anchor="middle" font-size="2.7" font-weight="700" fill="#0f172a">SỐ BÁO DANH</text>`
    );
    const sbdCellW = (sbdColW - 3) / cfg.sbdDigits;
    for (let d = 0; d < cfg.sbdDigits; d++) {
      const bx = sbdX + 1.5 + d * sbdCellW;
      parts.push(`<rect x="${bx.toFixed(2)}" y="${curY + 5.5}" width="${(sbdCellW - 0.6).toFixed(2)}" height="5" fill="#f8fafc" stroke="#0f172a" stroke-width="0.28"/>`);
      for (let digit = 0; digit <= 9; digit++) {
        const cx = bx + (sbdCellW - 0.6) / 2;
        const cy = curY + 13.5 + digit * 4.05;
        const rb = Math.min(1.55, r * 0.72);
        parts.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${rb.toFixed(2)}" fill="#ffffff" stroke="#0f172a" stroke-width="0.28"/>`);
        parts.push(`<text x="${cx.toFixed(2)}" y="${(cy + 0.95).toFixed(2)}" text-anchor="middle" font-size="2.2" fill="#334155">${digit}</text>`);
        if (sIdx === 0) {
          bubbles.push({ part: 'SBD', questionIndex: d + 1, option: String(digit), cxMm: cx, cyMm: cy, rMm: rb });
        }
      }
    }
    if (sIdx === 0) sbdBox = { xMm: sbdX, yMm: curY, wMm: sbdColW, hMm: infoH, digits: cfg.sbdDigits };

    // Mã đề Matrix (0-9)
    const codeX = sbdX + sbdColW + 3;
    parts.push(
      `<rect x="${codeX.toFixed(2)}" y="${curY}" width="${codeColW.toFixed(2)}" height="${infoH}" fill="none" stroke="#0f172a" stroke-width="0.4"/>`
    );
    parts.push(
      `<text x="${(codeX + codeColW / 2).toFixed(2)}" y="${curY + 4.2}" text-anchor="middle" font-size="2.7" font-weight="700" fill="#0f172a">MÃ ĐỀ</text>`
    );
    const codeCellW = (codeColW - 3) / cfg.examCodeDigits;
    for (let d = 0; d < cfg.examCodeDigits; d++) {
      const bx = codeX + 1.5 + d * codeCellW;
      parts.push(`<rect x="${bx.toFixed(2)}" y="${curY + 5.5}" width="${(codeCellW - 0.6).toFixed(2)}" height="5" fill="#f8fafc" stroke="#0f172a" stroke-width="0.28"/>`);
      for (let digit = 0; digit <= 9; digit++) {
        const cx = bx + (codeCellW - 0.6) / 2;
        const cy = curY + 13.5 + digit * 4.05;
        const rb = Math.min(1.55, r * 0.72);
        parts.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${rb.toFixed(2)}" fill="#ffffff" stroke="#0f172a" stroke-width="0.28"/>`);
        parts.push(`<text x="${cx.toFixed(2)}" y="${(cy + 0.95).toFixed(2)}" text-anchor="middle" font-size="2.2" fill="#334155">${digit}</text>`);
        if (sIdx === 0) {
          bubbles.push({ part: 'MADE', questionIndex: d + 1, option: String(digit), cxMm: cx, cyMm: cy, rMm: rb });
        }
      }
    }
    if (sIdx === 0) codeBox = { xMm: codeX, yMm: curY, wMm: codeColW, hMm: infoH, digits: cfg.examCodeDigits };

    curY += infoH + 4;

    // Optional Cut-off Dashed Line
    if (cfg.hasCutOffHeader) {
      parts.push(
        `<line x1="${ox + pad}" y1="${curY}" x2="${ox + sheetW - pad}" y2="${curY}" stroke="#0f172a" stroke-width="0.35" stroke-dasharray="2.5,2"/>`
      );
      parts.push(
        `<text x="${(ox + sheetW / 2).toFixed(2)}" y="${(curY - 0.8).toFixed(2)}" text-anchor="middle" font-size="2.2" fill="#475569">✂ Đường rọc phách (Phần bài làm bên dưới)</text>`
      );
      curY += 3.5;
    }

    // SECTION I: MULTIPLE CHOICE (A, B, C, D)
    if (cfg.mcqCount > 0) {
      parts.push(
        `<text x="${ox + pad}" y="${curY + 3}" font-size="3.1" font-weight="700" fill="#0f172a">PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (${cfg.mcqCount} câu)</text>`
      );
      curY += 5;

      const cols = Math.max(1, Math.min(5, cfg.columns));
      const perCol = Math.ceil(cfg.mcqCount / cols);
      const colW = (innerW - (cols - 1) * 3) / cols;
      const boxH = Math.max(12, perCol * rowStep + 5);

      for (let c = 0; c < cols; c++) {
        const cx0 = ox + pad + c * (colW + 3);
        parts.push(`<rect x="${cx0.toFixed(2)}" y="${curY}" width="${colW.toFixed(2)}" height="${boxH.toFixed(2)}" fill="none" stroke="#0f172a" stroke-width="0.32"/>`);
      }

      const opts = ['A', 'B', 'C', 'D'];
      for (let q = 0; q < cfg.mcqCount; q++) {
        const colIdx = Math.floor(q / perCol);
        const rowIdx = q % perCol;
        const cx0 = ox + pad + colIdx * (colW + 3);
        const qy = curY + 4 + rowIdx * rowStep;

        parts.push(
          `<text x="${(cx0 + 2).toFixed(2)}" y="${(qy + 1.0).toFixed(2)}" font-size="2.8" font-weight="700" fill="#0f172a">${q + 1}</text>`
        );

        const bubbleAreaStart = cx0 + 9.5;
        const stepX = Math.min(cfg.bubbleGapMm, (colW - 11.5) / 4);
        opts.forEach((opt, oi) => {
          const bx = bubbleAreaStart + oi * stepX;
          parts.push(`<circle cx="${bx.toFixed(2)}" cy="${qy.toFixed(2)}" r="${r.toFixed(2)}" fill="#ffffff" stroke="#0f172a" stroke-width="0.3"/>`);
          parts.push(`<text x="${bx.toFixed(2)}" y="${(qy + 1.0).toFixed(2)}" text-anchor="middle" font-size="2.4" fill="#334155">${opt}</text>`);
          if (sIdx === 0) {
            bubbles.push({ part: 'TN', questionIndex: q + 1, option: opt, cxMm: bx, cyMm: qy, rMm: r });
          }
        });
      }
      curY += boxH + 4;
    }

    // SECTION II: TRUE / FALSE (a, b, c, d -> Đ / S)
    if (cfg.tfCount > 0) {
      parts.push(
        `<text x="${ox + pad}" y="${curY + 3}" font-size="3.1" font-weight="700" fill="#0f172a">PHẦN II. Câu trắc nghiệm đúng sai (${cfg.tfCount} câu — Mỗi câu 4 ý a, b, c, d)</text>`
      );
      curY += 5;

      const tfCols = sheets === 2 ? 2 : Math.min(4, Math.max(2, cfg.tfCount >= 6 ? 4 : cfg.tfCount));
      const blockW = (innerW - (tfCols - 1) * 3) / tfCols;
      const tfRows = Math.ceil(cfg.tfCount / tfCols);
      const tfRowH = 26;

      for (let q = 0; q < cfg.tfCount; q++) {
        const c = q % tfCols;
        const row = Math.floor(q / tfCols);
        const bx0 = ox + pad + c * (blockW + 3);
        const by0 = curY + row * (tfRowH + 2.5);

        parts.push(`<rect x="${bx0.toFixed(2)}" y="${by0.toFixed(2)}" width="${blockW.toFixed(2)}" height="${tfRowH}" fill="none" stroke="#0f172a" stroke-width="0.32"/>`);
        parts.push(`<text x="${(bx0 + 2).toFixed(2)}" y="${(by0 + 4.2).toFixed(2)}" font-size="2.8" font-weight="700" fill="#0f172a">Câu ${q + 1}</text>`);
        parts.push(`<text x="${(bx0 + blockW * 0.52).toFixed(2)}" y="${(by0 + 4.2).toFixed(2)}" text-anchor="middle" font-size="2.5" font-weight="600" fill="#0f172a">Đúng</text>`);
        parts.push(`<text x="${(bx0 + blockW * 0.78).toFixed(2)}" y="${(by0 + 4.2).toFixed(2)}" text-anchor="middle" font-size="2.5" font-weight="600" fill="#0f172a">Sai</text>`);

        ['a', 'b', 'c', 'd'].forEach((sub, si) => {
          const sy = by0 + 8.5 + si * 4.4;
          parts.push(`<text x="${(bx0 + 4).toFixed(2)}" y="${(sy + 0.9).toFixed(2)}" font-size="2.7" font-weight="600" fill="#0f172a">${sub})</text>`);
          const dx = bx0 + blockW * 0.52;
          const sx = bx0 + blockW * 0.78;
          const rTf = Math.min(1.75, r * 0.8);
          parts.push(`<circle cx="${dx.toFixed(2)}" cy="${sy.toFixed(2)}" r="${rTf.toFixed(2)}" fill="#ffffff" stroke="#0f172a" stroke-width="0.3"/>`);
          parts.push(`<text x="${dx.toFixed(2)}" y="${(sy + 0.9).toFixed(2)}" text-anchor="middle" font-size="2.1" fill="#334155">Đ</text>`);
          parts.push(`<circle cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="${rTf.toFixed(2)}" fill="#ffffff" stroke="#0f172a" stroke-width="0.3"/>`);
          parts.push(`<text x="${sx.toFixed(2)}" y="${(sy + 0.9).toFixed(2)}" text-anchor="middle" font-size="2.1" fill="#334155">S</text>`);

          if (sIdx === 0) {
            bubbles.push({ part: 'DS', questionIndex: q + 1, subIndex: sub, option: 'Đ', cxMm: dx, cyMm: sy, rMm: rTf });
            bubbles.push({ part: 'DS', questionIndex: q + 1, subIndex: sub, option: 'S', cxMm: sx, cyMm: sy, rMm: rTf });
          }
        });
      }

      curY += tfRows * (tfRowH + 2.5) + 3;
    }

    // SECTION III: SHORT ANSWER (4-6 columns: '-', '.', '0'..'9')
    if (cfg.shortCount > 0) {
      parts.push(
        `<text x="${ox + pad}" y="${curY + 3}" font-size="3.1" font-weight="700" fill="#0f172a">PHẦN III. Câu trắc nghiệm trả lời ngắn (${cfg.shortCount} câu — Tô từ trái sang phải)</text>`
      );
      curY += 5;

      const tlnCols = sheets === 2 ? 2 : Math.min(6, Math.max(2, cfg.shortCount));
      const tlnRows = Math.ceil(cfg.shortCount / tlnCols);
      const tlnBlockW = (innerW - (tlnCols - 1) * 2.5) / tlnCols;
      const digitCount = 4; // 4 answer boxes standard 2025 (-, ., 0..9)
      const tlnSymbols = ['-', '.', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      const tlnStepY = 3.55;
      const tlnBlockH = 14 + tlnSymbols.length * tlnStepY;

      for (let q = 0; q < cfg.shortCount; q++) {
        const c = q % tlnCols;
        const row = Math.floor(q / tlnCols);
        const bx0 = ox + pad + c * (tlnBlockW + 2.5);
        const by0 = curY + row * (tlnBlockH + 2.5);

        parts.push(`<rect x="${bx0.toFixed(2)}" y="${by0.toFixed(2)}" width="${tlnBlockW.toFixed(2)}" height="${tlnBlockH.toFixed(2)}" fill="none" stroke="#0f172a" stroke-width="0.32"/>`);
        parts.push(`<text x="${(bx0 + tlnBlockW / 2).toFixed(2)}" y="${(by0 + 3.8).toFixed(2)}" text-anchor="middle" font-size="2.7" font-weight="700" fill="#0f172a">Câu ${q + 1}</text>`);

        const cellW = (tlnBlockW - 6) / digitCount;
        for (let d = 0; d < digitCount; d++) {
          const colX = bx0 + 3 + d * cellW;
          parts.push(`<rect x="${colX.toFixed(2)}" y="${(by0 + 5.2).toFixed(2)}" width="${(cellW - 0.5).toFixed(2)}" height="4.8" fill="#f8fafc" stroke="#0f172a" stroke-width="0.28"/>`);

          tlnSymbols.forEach((sym, si) => {
            // Column 0 supports '-', columns 1..2 support '.'
            const cx = colX + (cellW - 0.5) / 2;
            const cy = by0 + 13 + si * tlnStepY;
            const rTln = Math.min(1.42, r * 0.65);
            parts.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${rTln.toFixed(2)}" fill="#ffffff" stroke="#0f172a" stroke-width="0.26"/>`);
            parts.push(`<text x="${cx.toFixed(2)}" y="${(cy + 0.85).toFixed(2)}" text-anchor="middle" font-size="2.0" fill="#334155">${sym}</text>`);
            if (sIdx === 0) {
              bubbles.push({
                part: 'TLN',
                questionIndex: q + 1,
                subIndex: `c${d + 1}`,
                option: sym,
                cxMm: cx,
                cyMm: cy,
                rMm: rTln,
              });
            }
          });
        }
      }
      curY += tlnRows * (tlnBlockH + 2.5) + 3;
    }

    // OPTIONAL ESSAY LINES SECTION
    if (cfg.hasEssaySection && cfg.essayLines > 0 && curY + 20 < H - pad) {
      parts.push(
        `<text x="${ox + pad}" y="${curY + 3}" font-size="3.1" font-weight="700" fill="#0f172a">PHẦN TỰ LUẬN (Thí sinh trình bày lời giải trực tiếp bên dưới)</text>`
      );
      curY += 6;
      const availableLines = Math.min(cfg.essayLines, Math.floor((H - pad - curY - 6) / 6.5));
      for (let l = 0; l < availableLines; l++) {
        const ly = curY + l * 6.5;
        parts.push(`<line x1="${ox + pad}" y1="${ly.toFixed(2)}" x2="${ox + sheetW - pad}" y2="${ly.toFixed(2)}" stroke="#cbd5e1" stroke-width="0.3" stroke-dasharray="1.5,1.2"/>`);
      }
    }

    allParts.push(parts.join('\n'));
  }

  const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>
  ${allParts.join('\n')}
</svg>`;

  const schema: OmrExportSchema = {
    schemaVersion: '1.0',
    templateId: cfg.id,
    templateCode: cfg.templateCode,
    name: cfg.name,
    paperPreset: cfg.paperPreset,
    pageWidthMm: W,
    pageHeightMm: H,
    fiducialsMm: fiducials,
    sbdRegionMm: sbdBox,
    examCodeRegionMm: codeBox,
    parts: {
      mcqCount: cfg.mcqCount,
      tfCount: cfg.tfCount,
      shortCount: cfg.shortCount,
    },
    bubbles,
    recognitionRules:
      'Tọa độ tính bằng mm từ góc trên-trái khổ giấy. 4 ô vuông định vị góc giúp hiệu chỉnh phối cảnh khi quét ảnh.',
  };

  return { svgString, schema, widthMm: W, heightMm: H };
}
