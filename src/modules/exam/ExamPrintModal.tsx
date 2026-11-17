import React, { useState } from 'react';
import { Printer, X } from 'lucide-react';
import { ExamPaper, QuestionType } from '../../types';
import { RichMathText } from '../../components/RichMathText';
import { hasRichContent } from '../../core/math/richTextCodec';

interface ExamPrintModalProps {
  exam: ExamPaper;
  code?: string;
  onClose: () => void;
}

const OPT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const SUB_LETTERS = ['a', 'b', 'c', 'd'];

const PARTS: { type: QuestionType; title: string }[] = [
  { type: 'trac_nghiem', title: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn' },
  { type: 'dung_sai', title: 'PHẦN II. Câu trắc nghiệm đúng sai' },
  { type: 'tra_loi_ngan', title: 'PHẦN III. Câu trắc nghiệm trả lời ngắn' },
  { type: 'dien_khuyet', title: 'PHẦN IV. Câu hỏi điền khuyết' },
  { type: 'ghep_noi', title: 'PHẦN V. Câu hỏi ghép nối' },
  { type: 'tu_luan', title: 'PHẦN TỰ LUẬN' },
];

export const ExamPrintModal: React.FC<ExamPrintModalProps> = ({ exam, code, onClose }) => {
  const [includeSolutions, setIncludeSolutions] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 flex flex-col print-container-reset">
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <div className="font-bold text-slate-900 text-[16px]">Xem trước bản in / Lưu PDF chuẩn A4</div>
          <div className="text-[13px] text-slate-600">
            Công thức hiển thị sắc nét chuẩn Times New Roman 13pt. Trong hộp thoại in, chọn đích <strong>Lưu dưới dạng PDF</strong>.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-1.5 text-[14px] text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSolutions}
              onChange={(e) => setIncludeSolutions(e.target.checked)}
            />
            <span>Kèm đáp án & lời giải chi tiết</span>
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-1.5 bg-sky-600 text-white rounded-lg text-[14px] font-semibold hover:bg-sky-700"
          >
            <Printer className="w-4 h-4" />
            <span>In / Lưu PDF</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[14px] font-medium"
          >
            <X className="w-4 h-4" />
            <span>Đóng</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 print:p-0 print:overflow-visible">
        <div
          id="exam-print-sheet"
          className="max-w-[210mm] mx-auto bg-white shadow-xl print:shadow-none p-8 sm:p-10 print:p-[15mm] font-word text-[13pt] leading-[1.5] text-slate-950 space-y-4"
        >
          <div className="text-center space-y-1 border-b border-slate-300 pb-3">
            <div className="font-bold uppercase text-[14pt]">
              {exam.title}
              {code ? ` — MÃ ĐỀ ${code}` : ''}
            </div>
            <div className="italic text-[12pt]">
              Thời gian làm bài: {exam.durationMinutes || 45} phút | Họ tên thí sinh: ........................................... SBD: .............
            </div>
          </div>

          {PARTS.map((sec) => {
            const qs = exam.questions.filter((q) => q.type === sec.type);
            if (qs.length === 0) return null;
            return (
              <div key={sec.type} className="space-y-3 pt-1">
                <div className="font-bold uppercase text-[13pt]">{sec.title}</div>
                {qs.map((q, idx) => (
                  <div key={q.id} className="space-y-1.5 break-inside-avoid">
                    {hasRichContent(q.passage) && (
                      <div className="italic text-slate-800 pl-3 border-l-2 border-slate-400">
                        <RichMathText text={q.passage || ''} fontSize={16} />
                      </div>
                    )}
                    <div>
                      <span className="font-bold">Câu {idx + 1}: </span>
                      <RichMathText text={q.stem} fontSize={17} inline />
                    </div>
                    {q.svgIllustration && (
                      <div
                        className="my-2 max-w-[320px] mx-auto [&>svg]:max-w-full [&>svg]:h-auto"
                        dangerouslySetInnerHTML={{ __html: q.svgIllustration }}
                      />
                    )}
                    {q.type === 'trac_nghiem' && q.options && (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 pl-2">
                        {q.options.map((o, oi) => (
                          <div
                            key={o.id}
                            className={includeSolutions && o.id === q.correctOptionId ? 'font-bold underline' : ''}
                          >
                            <span className="font-bold">{OPT_LETTERS[oi]}. </span>
                            <RichMathText text={o.text} fontSize={16} inline />
                          </div>
                        ))}
                      </div>
                    )}
                    {q.type === 'dung_sai' && q.tfItems && (
                      <div className="space-y-0.5 pl-2">
                        {q.tfItems.map((sub, si) => (
                          <div key={sub.id}>
                            <span className="font-bold">{SUB_LETTERS[si]}) </span>
                            <RichMathText text={sub.text} fontSize={16} inline />
                            {includeSolutions && (
                              <span className="ml-2 font-bold">[{sub.isTrue ? 'Đúng' : 'Sai'}]</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {includeSolutions && (q.type === 'tra_loi_ngan' || q.type === 'dien_khuyet') && (
                      <div className="pl-2 font-bold">
                        Đáp án: <RichMathText text={q.shortAnswer || ''} fontSize={16} inline />
                      </div>
                    )}
                    {includeSolutions && hasRichContent(q.solution) && (
                      <div className="pl-2 text-slate-800">
                        <span className="font-bold italic">Lời giải: </span>
                        <RichMathText text={q.solution || ''} fontSize={16} inline />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
