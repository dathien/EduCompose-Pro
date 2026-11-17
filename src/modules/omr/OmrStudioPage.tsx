import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Printer,
  RotateCcw,
  Save,
  Search,
  Sliders,
} from 'lucide-react';
import { OmrPaperPreset, OmrTemplateConfig } from '../../types';
import { BUILTIN_OMR_TEMPLATES, OMR_PAPER_DIMENSIONS_MM } from '../../data/samples/omrTemplates';
import { buildOmrSheetSvg } from '../../core/omr/omrGenerator';
import { exportDrawingToDocxBlob } from '../../core/docx/docxEngine';
import { renderSvgStringToPng } from '../drawing/svgExport';
import { deleteOmrConfig, listOmrConfigs, saveOmrConfig } from '../../storage/indexedDb';
import { downloadBlob, downloadText, generateId, matchesVietnameseQuery } from '../../utils/vietnamese';

interface OmrStudioPageProps {
  onNotify: (msg: string, tone?: 'info' | 'success' | 'warning') => void;
}

export const OmrStudioPage: React.FC<OmrStudioPageProps> = ({ onNotify }) => {
  const [savedConfigs, setSavedConfigs] = useState<OmrTemplateConfig[]>([]);
  const [activeCfg, setActiveCfg] = useState<OmrTemplateConfig>(() => ({ ...BUILTIN_OMR_TEMPLATES[0] }));
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'mixed' | 'mcq_only' | 'saved'>('all');
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [isExporting, setIsExporting] = useState(false);

  const loadSaved = async () => {
    try {
      const list = await listOmrConfigs();
      setSavedConfigs(list);
    } catch {
      // Ignore IndexedDB unavailability
    }
  };

  useEffect(() => {
    loadSaved();
  }, []);

  const filteredTemplates = useMemo(() => {
    const source = filterMode === 'saved' ? savedConfigs : BUILTIN_OMR_TEMPLATES;
    return source.filter((tpl) => {
      if (filterMode === 'mixed' && (tpl.tfCount === 0 && tpl.shortCount === 0)) return false;
      if (filterMode === 'mcq_only' && (tpl.tfCount > 0 || tpl.shortCount > 0)) return false;
      return matchesVietnameseQuery(search, [tpl.name, tpl.structureLabel, tpl.templateCode]);
    });
  }, [filterMode, savedConfigs, search]);

  const generated = useMemo(() => buildOmrSheetSvg(activeCfg), [activeCfg]);

  const handleSaveCustomTemplate = async () => {
    const custom: OmrTemplateConfig = {
      ...activeCfg,
      id: activeCfg.id.startsWith('omr_usr_') ? activeCfg.id : generateId('omr_usr'),
      updatedAt: Date.now(),
    };
    await saveOmrConfig(custom);
    setActiveCfg(custom);
    await loadSaved();
    onNotify(`Đã lưu mẫu phiếu OMR "${custom.name}" vào kho cá nhân.`, 'success');
  };

  const handleExportSvg = () => {
    downloadText(generated.svgString, `phieu_omr_${activeCfg.structureLabel.replace(/\s+/g, '_')}.svg`, 'image/svg+xml;charset=utf-8');
    onNotify('Đã tải xuống tệp vector SVG kích thước mm chuẩn.', 'success');
  };

  const handleExportJsonSchema = () => {
    downloadText(
      JSON.stringify(generated.schema, null, 2),
      `omr_coordinates_${activeCfg.templateCode}.json`,
      'application/json'
    );
    onNotify(
      `Đã xuất sơ đồ tọa độ chuẩn (${generated.schema.bubbles.length} ô tô trắc nghiệm) dạng JSON.`,
      'success'
    );
  };

  const handleExportPng300 = async () => {
    setIsExporting(true);
    try {
      // Convert mm to 96 DPI base px, then renderSvgStringToPng scales by 300/96
      const wPx = Math.round((generated.widthMm / 25.4) * 96);
      const hPx = Math.round((generated.heightMm / 25.4) * 96);
      const { blob } = await renderSvgStringToPng(generated.svgString, wPx, hPx, 300);
      downloadBlob(blob, `phieu_omr_${activeCfg.structureLabel.replace(/\s+/g, '_')}_300dpi.png`);
      onNotify('Đã xuất ảnh phiếu OMR 300 DPI sắc nét.', 'success');
    } catch {
      onNotify('Không thể dựng ảnh PNG từ phiếu OMR hiện tại.', 'warning');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const wPx = Math.round((generated.widthMm / 25.4) * 96);
      const hPx = Math.round((generated.heightMm / 25.4) * 96);
      const { dataUrl } = await renderSvgStringToPng(generated.svgString, wPx, hPx, 300);
      const orientation = generated.widthMm > generated.heightMm ? 'landscape' : 'portrait';
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: [generated.widthMm, generated.heightMm],
      });
      pdf.addImage(dataUrl, 'PNG', 0, 0, generated.widthMm, generated.heightMm);
      pdf.save(`phieu_omr_${activeCfg.structureLabel.replace(/\s+/g, '_')}.pdf`);
      onNotify(
        `Đã xuất PDF tỉ lệ 100% đúng kích thước vật lí (${generated.widthMm} × ${generated.heightMm} mm).`,
        'success'
      );
    } catch {
      onNotify('Không thể tạo tệp PDF cho phiếu OMR.', 'warning');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDocx = async () => {
    setIsExporting(true);
    try {
      const wPx = Math.round((generated.widthMm / 25.4) * 96);
      const hPx = Math.round((generated.heightMm / 25.4) * 96);
      const { dataUrl } = await renderSvgStringToPng(generated.svgString, wPx, hPx, 300);
      const blob = await exportDrawingToDocxBlob({
        title: activeCfg.name,
        pngDataUrl: dataUrl,
        widthPx: 620,
        heightPx: Math.round(620 * (generated.heightMm / generated.widthMm)),
        caption: `Khổ giấy: ${OMR_PAPER_DIMENSIONS_MM[activeCfg.paperPreset].label} · Cấu trúc: ${activeCfg.structureLabel}`,
      });
      downloadBlob(blob, `phieu_omr_${activeCfg.structureLabel.replace(/\s+/g, '_')}.docx`);
      onNotify('Đã xuất phiếu OMR vào tệp Word (.docx).', 'success');
    } catch {
      onNotify('Không thể xuất phiếu OMR sang Word.', 'warning');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint100 = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <CheckSquare className="w-6 h-6 text-sky-600 shrink-0" />
            <h1 className="ui-page-title text-slate-900">Thiết kế Phiếu Trả Lời Trắc Nghiệm (OMR)</h1>
          </div>
          <p className="ui-body text-slate-600">
            20 mẫu phiếu chuẩn 2025 (TN – Đúng/Sai – Trả lời ngắn – Tự luận), hỗ trợ A4, A5, A3 và in 2 phiếu A5/trang A4 đúng tỉ lệ vật lí mm.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveCustomTemplate}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-teal-600 text-white ui-btn font-semibold rounded-lg hover:bg-teal-700"
          >
            <Save className="w-4 h-4" />
            <span>Lưu mẫu này</span>
          </button>
          <button
            type="button"
            onClick={handlePrint100}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-white border border-slate-300 text-slate-800 ui-btn font-medium rounded-lg hover:bg-slate-50"
          >
            <Printer className="w-4 h-4 text-sky-600" />
            <span>In tỉ lệ 100%</span>
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 bg-sky-600 text-white ui-btn font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            <span>Xuất PDF (mm)</span>
          </button>
        </div>
      </div>

      {/* Main 3-Panel Studio */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: 20 BUILTIN + SAVED TEMPLATES */}
        <aside className="xl:col-span-3 bg-white border border-slate-200 rounded-xl p-4 space-y-3 print:hidden">
          <div className="flex items-center justify-between">
            <h2 className="ui-section-title text-slate-900">Kho mẫu phiếu ({filteredTemplates.length})</h2>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm: 12-4-6, 50 TN, A5..."
              className="w-full min-h-[40px] pl-9 pr-3 py-1.5 ui-input bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['all', 'Tất cả (20)'],
                ['mixed', 'Chuẩn 2025'],
                ['mcq_only', 'TN thuần'],
                ['saved', `Đã lưu (${savedConfigs.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterMode(key)}
                className={`px-2 py-1.5 min-h-[34px] ui-caption font-medium rounded-md transition-colors ${
                  filterMode === key ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[600px] overflow-y-auto panel-scroll space-y-2 pr-1">
            {filteredTemplates.length === 0 ? (
              <div className="p-6 text-center ui-body text-slate-500">Không có mẫu OMR nào khớp bộ lọc.</div>
            ) : (
              filteredTemplates.map((tpl) => {
                const selected = activeCfg.id === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setActiveCfg({ ...tpl })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setActiveCfg({ ...tpl })}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected ? 'bg-sky-50 border-sky-500' : 'bg-white border-slate-200 hover:border-sky-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="ui-btn font-semibold text-slate-900 leading-snug">{tpl.name}</div>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[13px] font-medium shrink-0">
                        {tpl.structureLabel}
                      </span>
                    </div>
                    <div className="ui-caption text-slate-500 mt-1 flex items-center justify-between gap-2">
                      <span>{OMR_PAPER_DIMENSIONS_MM[tpl.paperPreset].label.split('(')[0].trim()}</span>
                      {filterMode === 'saved' && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await deleteOmrConfig(tpl.id);
                            await loadSaved();
                            onNotify('Đã xóa mẫu OMR cá nhân.', 'info');
                          }}
                          className="text-red-600 hover:underline"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* CENTER COLUMN: PHYSICAL MM SHEET PREVIEW */}
        <section className="xl:col-span-6 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 print:hidden">
            <div className="ui-guide font-medium text-slate-700">
              Kích thước vật lí: <strong className="text-slate-900">{generated.widthMm} × {generated.heightMm} mm</strong>
              <span className="mx-2 text-slate-300">|</span>
              Số ô tô: <strong className="text-sky-700">{generated.schema.bubbles.length}</strong>
            </div>

            <div className="flex items-center gap-2">
              <label className="ui-caption text-slate-600 flex items-center gap-1.5">
                <span>Thu phóng:</span>
                <select
                  value={previewZoom}
                  onChange={(e) => setPreviewZoom(Number(e.target.value))}
                  className="px-2 py-1 border border-slate-200 rounded-lg bg-slate-50 ui-input"
                >
                  <option value={60}>60%</option>
                  <option value={80}>80%</option>
                  <option value={100}>100%</option>
                  <option value={125}>125%</option>
                </select>
              </label>
            </div>
          </div>

          <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 overflow-auto max-h-[720px] flex justify-center print:bg-white print:border-0 print:p-0 print:max-h-none print:overflow-visible">
            <div
              className="bg-white shadow-sm border border-slate-300 print:shadow-none print:border-0"
              style={{
                width: `${(generated.widthMm * 3.1 * previewZoom) / 100}px`,
                minWidth: '280px',
              }}
              dangerouslySetInnerHTML={{
                __html: generated.svgString.replace(
                  /<svg([^>]*)width="[^"]*"\s+height="[^"]*"/,
                  '<svg$1style="width:100%;height:auto;display:block;"'
                ),
              }}
            />
          </div>

          {/* Export toolbar below preview */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 print:hidden">
            <div className="ui-caption text-slate-500">
              4 ô vuông định vị góc giúp máy quét / phần mềm chấm nhận diện chính xác tọa độ.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportSvg}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 hover:bg-slate-50 ui-btn font-medium"
              >
                <Download className="w-4 h-4" />
                <span>SVG</span>
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={handleExportPng300}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 hover:bg-slate-50 ui-btn font-medium"
              >
                <ImageIcon className="w-4 h-4" />
                <span>PNG 300 DPI</span>
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={handleExportDocx}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 hover:bg-slate-50 ui-btn font-medium"
              >
                <FileText className="w-4 h-4 text-sky-600" />
                <span>DOCX</span>
              </button>
              <button
                type="button"
                onClick={handleExportJsonSchema}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 border border-teal-200 rounded-lg bg-teal-50 text-teal-800 hover:bg-teal-100 ui-btn font-medium"
              >
                <FileCode2 className="w-4 h-4" />
                <span>Tọa độ JSON</span>
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: CUSTOMIZATION PARAMETERS */}
        <aside className="xl:col-span-3 bg-white border border-slate-200 rounded-xl p-4 space-y-4 print:hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h2 className="ui-section-title text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-600" />
              <span>Tùy biến thông số</span>
            </h2>
            <button
              type="button"
              onClick={() => setActiveCfg({ ...BUILTIN_OMR_TEMPLATES[0] })}
              title="Khôi phục mặc định"
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="ui-caption font-medium text-slate-700">Khổ giấy & Kiểu dàn trang</span>
              <select
                value={activeCfg.paperPreset}
                onChange={(e) => setActiveCfg((p) => ({ ...p, paperPreset: e.target.value as OmrPaperPreset }))}
                className="w-full mt-1 min-h-[40px] px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg ui-input"
              >
                {Object.entries(OMR_PAPER_DIMENSIONS_MM).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="ui-caption font-medium text-slate-700">Tên mẫu phiếu</span>
              <input
                type="text"
                value={activeCfg.name}
                onChange={(e) => setActiveCfg((p) => ({ ...p, name: e.target.value }))}
                className="w-full mt-1 min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg ui-input"
              />
            </label>

            <label className="block">
              <span className="ui-caption font-medium text-slate-700">Đơn vị / Trường</span>
              <input
                type="text"
                value={activeCfg.schoolName}
                onChange={(e) => setActiveCfg((p) => ({ ...p, schoolName: e.target.value }))}
                className="w-full mt-1 min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg ui-input"
              />
            </label>

            <label className="block">
              <span className="ui-caption font-medium text-slate-700">Tiêu đề phiếu</span>
              <input
                type="text"
                value={activeCfg.examTitle}
                onChange={(e) => setActiveCfg((p) => ({ ...p, examTitle: e.target.value }))}
                className="w-full mt-1 min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg ui-input"
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="ui-caption font-medium text-slate-700">Số câu TN</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={activeCfg.mcqCount}
                  onChange={(e) => setActiveCfg((p) => ({ ...p, mcqCount: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                  className="w-full mt-1 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg ui-input tabular-nums"
                />
              </label>
              <label className="block">
                <span className="ui-caption font-medium text-slate-700">Số câu Đ/S</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={activeCfg.tfCount}
                  onChange={(e) => setActiveCfg((p) => ({ ...p, tfCount: Math.max(0, Math.min(20, Number(e.target.value))) }))}
                  className="w-full mt-1 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg ui-input tabular-nums"
                />
              </label>
              <label className="block">
                <span className="ui-caption font-medium text-slate-700">Số câu TLN</span>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={activeCfg.shortCount}
                  onChange={(e) => setActiveCfg((p) => ({ ...p, shortCount: Math.max(0, Math.min(12, Number(e.target.value))) }))}
                  className="w-full mt-1 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg ui-input tabular-nums"
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="ui-caption font-medium text-slate-700">Chữ số SBD</span>
                <input
                  type="number"
                  min={4}
                  max={8}
                  value={activeCfg.sbdDigits}
                  onChange={(e) => setActiveCfg((p) => ({ ...p, sbdDigits: Math.max(4, Math.min(8, Number(e.target.value))) }))}
                  className="w-full mt-1 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg ui-input tabular-nums"
                />
              </label>
              <label className="block">
                <span className="ui-caption font-medium text-slate-700">Mã đề</span>
                <input
                  type="number"
                  min={2}
                  max={4}
                  value={activeCfg.examCodeDigits}
                  onChange={(e) => setActiveCfg((p) => ({ ...p, examCodeDigits: Math.max(2, Math.min(4, Number(e.target.value))) }))}
                  className="w-full mt-1 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg ui-input tabular-nums"
                />
              </label>
              <label className="block">
                <span className="ui-caption font-medium text-slate-700">Số cột TN</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={activeCfg.columns}
                  onChange={(e) => setActiveCfg((p) => ({ ...p, columns: Math.max(1, Math.min(5, Number(e.target.value))) }))}
                  className="w-full mt-1 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg ui-input tabular-nums"
                />
              </label>
            </div>

            <div>
              <div className="flex justify-between ui-caption text-slate-700">
                <span>Bán kính ô tô (mm)</span>
                <span className="tabular-nums font-medium">{activeCfg.bubbleRadiusMm.toFixed(1)} mm</span>
              </div>
              <input
                type="range"
                min={1.6}
                max={2.6}
                step={0.1}
                value={activeCfg.bubbleRadiusMm}
                onChange={(e) => setActiveCfg((p) => ({ ...p, bubbleRadiusMm: Number(e.target.value) }))}
                className="w-full accent-sky-600"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer ui-guide text-slate-800">
                <input
                  type="checkbox"
                  checked={activeCfg.showFiducials}
                  onChange={(e) => setActiveCfg((p) => ({ ...p, showFiducials: e.target.checked }))}
                />
                <span>Hiện 4 mốc định vị máy quét góc</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer ui-guide text-slate-800">
                <input
                  type="checkbox"
                  checked={activeCfg.hasCutOffHeader}
                  onChange={(e) => setActiveCfg((p) => ({ ...p, hasCutOffHeader: e.target.checked }))}
                />
                <span>Thêm đường rọc cắt phách</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer ui-guide text-slate-800">
                <input
                  type="checkbox"
                  checked={activeCfg.hasEssaySection}
                  onChange={(e) =>
                    setActiveCfg((p) => ({
                      ...p,
                      hasEssaySection: e.target.checked,
                      essayLines: e.target.checked ? Math.max(8, p.essayLines || 12) : 0,
                    }))
                  }
                />
                <span>Kèm dòng kẻ làm bài Tự luận</span>
              </label>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
