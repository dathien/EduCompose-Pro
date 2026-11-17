import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSearch,
  FileText,
  ListOrdered,
  Puzzle,
  RotateCw,
  Scissors,
  Sparkles,
  Table2,
  Wrench,
} from 'lucide-react';
import { ExamPaper, WordDocumentRecord, WordToolsMode } from '../../types';
import { BeautifyDocxPage } from './BeautifyDocxPage';
import { auditExamPaper } from '../../core/exam/examEngine';
import { SAMPLE_WORD_TEMPLATES } from '../../data/samples/sampleWordDocs';
import { exportDocumentBlocksToDocxBlob, tryLatexToOmml } from '../../core/docx/docxEngine';
import { getActiveDocumentAdapter } from '../../adapters/wordAdapter';
import { ScientificRichTextEditor } from '../../components/editor/ScientificRichTextEditor';
import { hasRichContent, richContentToSearchText } from '../../core/math/richTextCodec';
import { downloadBlob } from '../../utils/vietnamese';

interface WordToolsPageProps {
  activeDocument: WordDocumentRecord;
  activeExam: ExamPaper;
  initialMode?: WordToolsMode;
  onUpdateActiveDocument: (doc: WordDocumentRecord) => void;
  onOpenInFormula: (latex: string) => void;
  onOpenExamBuilder: () => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'warning') => void;
}

const TOOL_TABS: { id: WordToolsMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'format', label: 'Định dạng & Làm đẹp', icon: Sparkles },
  { id: 'numbering', label: 'Đánh số & Auto-Number', icon: ListOrdered },
  { id: 'answers', label: 'Đáp án & Lời giải', icon: Scissors },
  { id: 'tables', label: 'Bảng biểu & Phiếu', icon: Table2 },
  { id: 'audit', label: 'Kiểm tra chất lượng đề', icon: FileSearch },
  { id: 'ocr', label: 'OCR từ ảnh đề thi', icon: Camera },
  { id: 'word_addin', label: 'Tích hợp Word / Add-in', icon: Puzzle },
];

export const WordToolsPage: React.FC<WordToolsPageProps> = ({
  activeDocument,
  activeExam,
  initialMode = 'format',
  onUpdateActiveDocument,
  onOpenInFormula,
  onOpenExamBuilder,
  onNotify,
}) => {
  const [mode, setMode] = useState<WordToolsMode>(initialMode);

  // OCR State
  const ocrInputRef = useRef<HTMLInputElement | null>(null);
  const ocrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ocrImageSrc, setOcrImageSrc] = useState<string | null>(null);
  const [ocrRotation, setOcrRotation] = useState<number>(0);
  const [ocrContrast, setOcrContrast] = useState<number>(115);
  const [ocrRunning, setOcrRunning] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [ocrResultText, setOcrResultText] = useState<string>('');

  const adapter = getActiveDocumentAdapter();
  const examAuditIssues = auditExamPaper(activeExam);

  const handleLoadOcrImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOcrImageSrc(reader.result);
        setOcrRotation(0);
        setOcrResultText('');
        drawPreprocessedCanvas(reader.result, 0, ocrContrast);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const drawPreprocessedCanvas = (src: string, rotDeg: number, contrastPct: number) => {
    const img = new Image();
    img.onload = () => {
      const canvas = ocrCanvasRef.current;
      if (!canvas) return;
      const rad = (rotDeg * Math.PI) / 180;
      const swap = rotDeg % 180 !== 0;
      const targetW = Math.min(1400, swap ? img.height : img.width);
      const scale = targetW / (swap ? img.height : img.width);
      const targetH = Math.round((swap ? img.width : img.height) * scale);

      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.save();
      ctx.filter = `grayscale(100%) contrast(${contrastPct}%)`;
      ctx.translate(targetW / 2, targetH / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, (-img.width * scale) / 2, (-img.height * scale) / 2, img.width * scale, img.height * scale);
      ctx.restore();
    };
    img.src = src;
  };

  const handleRunLocalOcr = async () => {
    const canvas = ocrCanvasRef.current;
    if (!canvas || !ocrImageSrc) {
      onNotify('Vui lòng chọn ảnh chụp đề thi hoặc trang sách trước khi nhận diện.', 'warning');
      return;
    }
    setOcrRunning(true);
    setOcrProgress(5);
    try {
      const Tesseract = await import('tesseract.js');
      const dataUrl = canvas.toDataURL('image/png');
      const result = await Tesseract.recognize(dataUrl, 'vie+eng', {
        logger: (m) => {
          if (typeof m.progress === 'number') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });
      const cleaned = (result.data.text || '').replace(/\n{3,}/g, '\n\n').trim();
      setOcrResultText(cleaned || 'Không đọc được chữ rõ ràng từ ảnh này. Hãy thử tăng độ tương phản hoặc xoay thẳng ảnh.');
      onNotify('Đã hoàn tất nhận diện chữ tiếng Việt/Anh cục bộ trên trình duyệt.', 'success');
    } catch {
      onNotify(
        navigator.onLine
          ? 'Không thể tải dữ liệu ngôn ngữ OCR lúc này. Vui lòng thử lại hoặc kiểm tra kết nối mạng.'
          : 'Tính năng nhận dạng OCR cần kết nối Internet ở lần tải gói ngôn ngữ đầu tiên. Các tính năng soạn thảo, vẽ hình và xuất Word vẫn hoạt động bình thường khi ngoại tuyến.',
        'warning'
      );
    } finally {
      setOcrRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Tool Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-6 h-6 text-sky-600 shrink-0" />
            <div>
              <h1 className="ui-page-title text-slate-900">Bộ Công cụ Word & Xử lí Học liệu Chuyên sâu</h1>
              <p className="ui-body text-slate-600">
                Xử lí file Word (.docx) thật chuẩn OOXML, rà soát lỗi đề thi, nhận diện chữ OCR và xem trạng thái tích hợp Microsoft Word.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl">
          {TOOL_TABS.map((t) => {
            const Icon = t.icon;
            const active = mode === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-lg ui-btn font-medium transition-colors whitespace-nowrap ${
                  active ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MODE: FORMAT / NUMBERING / ANSWERS share real OOXML Beautifier */}
      {(mode === 'format' || mode === 'numbering' || mode === 'answers') && (
        <BeautifyDocxPage activeDocument={activeDocument} onNotify={onNotify} />
      )}

      {/* MODE: QUICK FORMS & TABLES */}
      {mode === 'tables' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="ui-section-title text-slate-900">Mẫu Bảng biểu, Rubric & Phiếu theo dõi chuẩn A4</h2>
          <p className="ui-body text-slate-600">
            Xuất nhanh các biểu mẫu Word có sẵn bảng chuẩn OOXML (&lt;w:tbl&gt; viền rõ, tô nền tiêu đề, font Times New Roman 13pt).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SAMPLE_WORD_TEMPLATES.filter(
              (d) => d.category === 'bieu_mau' || d.blocks.some((b) => b.type === 'table')
            ).map((tpl) => (
              <div key={tpl.id} className="p-4 border border-slate-200 rounded-xl flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="ui-formula-name text-slate-900">{tpl.name}</div>
                  <p className="ui-caption text-slate-600">{tpl.summaryText}</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateActiveDocument(tpl);
                      onNotify(`Đã nạp "${tpl.name}" làm tài liệu đang soạn.`, 'info');
                    }}
                    className="min-h-[36px] px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg ui-caption font-medium"
                  >
                    Nạp chỉnh sửa
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const blob = await exportDocumentBlocksToDocxBlob(tpl.name, tpl.blocks, tryLatexToOmml);
                      downloadBlob(blob, `${tpl.name.replace(/\s+/g, '_').slice(0, 36)}.docx`);
                      onNotify(`Đã tải xuống "${tpl.name}.docx".`, 'success');
                    }}
                    className="inline-flex items-center gap-1 min-h-[36px] px-3 bg-sky-600 text-white rounded-lg ui-caption font-semibold hover:bg-sky-700"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Xuất .docx</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODE: EXAM QUALITY AUDIT */}
      {mode === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="ui-section-title text-slate-900">Kiểm tra chất lượng đề kiểm tra hiện tại</h2>
              <p className="ui-caption text-slate-600">
                Đề đang kiểm tra: <strong>{activeExam.title}</strong> ({activeExam.questions.length} câu)
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenExamBuilder}
              className="min-h-[38px] px-4 py-1.5 bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700"
            >
              Mở chỉnh sửa đề này
            </button>
          </div>

          {examAuditIssues.length === 0 ? (
            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-900 ui-body">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <span>Đề kiểm tra đầy đủ câu dẫn, 4 phương án, đáp án chuẩn và khớp thang điểm 10,00.</span>
            </div>
          ) : (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-950 ui-body">
              <div className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span>Phát hiện {examAuditIssues.length} điểm cần hoàn thiện trước khi in/trộn đề:</span>
              </div>
              <ul className="list-disc pl-6 space-y-1">
                {examAuditIssues.map((iss, idx) => (
                  <li key={idx}>{iss}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* MODE: LOCAL OCR FROM EXAM IMAGE */}
      {mode === 'ocr' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="ui-section-title text-slate-900">Ảnh đề thi / Tài liệu nguồn</h2>
              <input ref={ocrInputRef} type="file" accept="image/*" onChange={handleLoadOcrImage} className="hidden" />
              <button
                type="button"
                onClick={() => ocrInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700"
              >
                <Camera className="w-4 h-4" />
                <span>Chọn ảnh chụp</span>
              </button>
            </div>

            {ocrImageSrc && (
              <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg ui-caption">
                <button
                  type="button"
                  onClick={() => {
                    const next = (ocrRotation + 90) % 360;
                    setOcrRotation(next);
                    drawPreprocessedCanvas(ocrImageSrc, next, ocrContrast);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Xoay 90° ({ocrRotation}°)</span>
                </button>
                <label className="flex items-center gap-2 flex-1 min-w-[160px]">
                  <span>Tương phản ({ocrContrast}%):</span>
                  <input
                    type="range"
                    min={80}
                    max={180}
                    value={ocrContrast}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setOcrContrast(val);
                      drawPreprocessedCanvas(ocrImageSrc, ocrRotation, val);
                    }}
                    className="flex-1 accent-sky-600"
                  />
                </label>
              </div>
            )}

            <div className="min-h-[280px] bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center p-3 overflow-auto">
              {ocrImageSrc ? (
                <canvas ref={ocrCanvasRef} className="max-w-full h-auto rounded border border-slate-300 bg-white" />
              ) : (
                <div className="text-center ui-body text-slate-500 p-6">
                  Chọn ảnh chụp trang sách, phiếu bài tập hoặc đề thi để nhận diện chữ tiếng Việt/Anh cục bộ trên trình duyệt.
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!ocrImageSrc || ocrRunning}
              onClick={handleRunLocalOcr}
              className="w-full min-h-[42px] px-4 py-2 bg-teal-600 text-white rounded-lg ui-btn font-semibold hover:bg-teal-700 disabled:opacity-50"
            >
              {ocrRunning ? `Đang nhận diện cục bộ (${ocrProgress}%)...` : 'Bắt đầu nhận diện chữ OCR (Việt + Anh)'}
            </button>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="ui-section-title text-slate-900">Văn bản nhận diện & Chuyển tiếp xử lí</h2>
            <p className="ui-caption text-slate-600">
              OCR cục bộ đọc chính xác văn bản tiếng Việt và tiếng Anh. Với công thức toán phức tạp trên ảnh, thầy cô nên rà lại bằng nút <strong>Mở trong Soạn công thức</strong>.
            </p>
            <ScientificRichTextEditor
              value={ocrResultText}
              onChange={setOcrResultText}
              variant="full"
              minHeightPx={200}
              defaultEquationOpen={true}
              placeholder="Kết quả văn bản sau khi nhận diện OCR sẽ hiện tại đây để thầy cô chỉnh sửa trực quan..."
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!hasRichContent(ocrResultText)}
                onClick={() => {
                  onUpdateActiveDocument({
                    ...activeDocument,
                    blocks: [
                      ...activeDocument.blocks,
                      {
                        id: `ocr_${Date.now()}`,
                        type: 'paragraph',
                        text: ocrResultText.trim(),
                        html: ocrResultText.trim(),
                      },
                    ],
                    updatedAt: Date.now(),
                  });
                  onNotify('Đã chèn đoạn văn bản OCR vào tài liệu đang soạn.', 'success');
                }}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 bg-sky-600 text-white rounded-lg ui-btn font-semibold hover:bg-sky-700 disabled:opacity-50"
              >
                <ClipboardList className="w-4 h-4" />
                <span>Chèn vào tài liệu Word</span>
              </button>
              <button
                type="button"
                disabled={!hasRichContent(ocrResultText)}
                onClick={() => onOpenInFormula(richContentToSearchText(ocrResultText).slice(0, 120))}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 bg-white border border-slate-200 text-slate-800 rounded-lg ui-btn font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                <FileText className="w-4 h-4 text-teal-600" />
                <span>Chuyển sang Soạn công thức</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODE: WORD ADD-IN & ARCHITECTURE */}
      {mode === 'word_addin' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Puzzle className="w-6 h-6 text-sky-600 shrink-0" />
            <h2 className="ui-section-title text-slate-900">Trạng thái môi trường & Tích hợp Microsoft Word (Office.js)</h2>
          </div>

          <div
            className={`p-4 rounded-xl border ui-body ${
              adapter.isWordEnvironment
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-sky-50 border-sky-200 text-slate-800'
            }`}
          >
            <div>
              <strong>Môi trường đang chạy:</strong>{' '}
              {adapter.isWordEnvironment
                ? 'Microsoft Word Add-in Taskpane (Office.js khả dụng)'
                : 'Ứng dụng Web độc lập trên trình duyệt (Web Standalone Mode)'}
            </div>
            <p className="ui-guide text-slate-600 mt-1">
              Trong chế độ trình duyệt Web, phần mềm tạo trực tiếp tệp <code>.docx</code> chuẩn OOXML (chứa công thức <code>&lt;m:oMath&gt;</code>, hình ảnh 300 DPI, bảng <code>&lt;w:tbl&gt;</code>) và sao chép MathML để thầy cô dán (Ctrl+V) vào Microsoft Word mà không cần cài thêm phần mềm bổ trợ.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ui-body text-slate-700">
            <div className="p-4 border border-slate-200 rounded-xl space-y-2">
              <div className="ui-group-title text-slate-900">Cách dán nhanh vào Word đang mở</div>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Công thức:</strong> Nhấn <em>Sao chép MathML (dán Word)</em> trong tab Công thức, sau đó bấm <strong>Ctrl + V</strong> vào Microsoft Word.</li>
                <li><strong>Hình vẽ:</strong> Nhấn <em>Chép ảnh</em> ở thanh đáy Bảng vẽ rồi dán trực tiếp vào Word hoặc PowerPoint.</li>
                <li><strong>Toàn bộ đề thi / phiếu:</strong> Nhấn <em>Xuất DOCX</em> để tải về file Word hoàn chỉnh định dạng Times New Roman 13pt khổ A4.</li>
              </ul>
            </div>
            <div className="p-4 border border-slate-200 rounded-xl space-y-2">
              <div className="ui-group-title text-slate-900">Kiến trúc mở rộng Office.js Taskpane Add-in</div>
              <p>
                Mã nguồn đã tách lớp <code>DocumentAdapter</code> (<code>WebDocumentAdapter</code> / <code>WordOfficeAdapter</code>). Khi triển khai dưới dạng Microsoft Word Add-in trên máy chủ HTTPS kèm manifest XML, hệ thống sẽ tự nhận diện <code>window.Office.context.document</code> để gọi API chèn OOXML tại vị trí con trỏ.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
