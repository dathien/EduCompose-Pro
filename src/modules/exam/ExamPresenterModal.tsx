import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { ExamPaper } from '../../types';
import { RichMathText } from '../../components/RichMathText';
import { QUESTION_TYPE_LABELS } from '../../core/exam/examEngine';

interface ExamPresenterModalProps {
  exam: ExamPaper;
  onClose: () => void;
}

const OPT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const SUB_LETTERS = ['a', 'b', 'c', 'd'];

export const ExamPresenterModal: React.FC<ExamPresenterModalProps> = ({ exam, onClose }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAllMode, setShowAllMode] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [textScalePx, setTextScalePx] = useState<number>(22);
  const [remainingSec, setRemainingSec] = useState<number>((exam.durationMinutes || 45) * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!showAllMode && e.key === 'ArrowRight') {
        setCurrentIdx((i) => Math.min(exam.questions.length - 1, i + 1));
      }
      if (!showAllMode && e.key === 'ArrowLeft') {
        setCurrentIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exam.questions.length, onClose, showAllMode]);

  useEffect(() => {
    if (!timerRunning || remainingSec <= 0) return;
    const t = setInterval(() => {
      setRemainingSec((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [timerRunning, remainingSec]);

  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const qList = showAllMode ? exam.questions : exam.questions.slice(currentIdx, currentIdx + 1);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col">
      {/* Top Projector Control Bar */}
      <header className="px-4 sm:px-6 py-3 bg-slate-800 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Maximize2 className="w-5 h-5 text-sky-400 shrink-0" />
          <div className="min-w-0">
            <div className="font-bold text-[17px] text-white truncate">{exam.title}</div>
            <div className="text-[13px] text-slate-300">
              {exam.questions.length} câu · Phím ← / → chuyển câu · Esc thoát trình chiếu
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Countdown Timer */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5">
            <Clock className="w-4 h-4 text-sky-400" />
            <span className="font-mono-code font-bold text-[18px] tabular-nums">{formattedTime}</span>
            <button
              type="button"
              onClick={() => setTimerRunning((v) => !v)}
              className="p-1 hover:bg-slate-700 rounded text-sky-300"
              title={timerRunning ? 'Tạm dừng đồng hồ' : 'Bắt đầu đếm ngược'}
            >
              {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setTimerRunning(false);
                setRemainingSec((exam.durationMinutes || 45) * 60);
              }}
              className="p-1 hover:bg-slate-700 rounded text-slate-300"
              title="Đặt lại thời gian"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <select
            value={textScalePx}
            onChange={(e) => setTextScalePx(Number(e.target.value))}
            aria-label="Cỡ chữ trình chiếu"
            className="min-h-[38px] px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-[14px] text-white"
          >
            <option value={18}>Cỡ chữ 18px</option>
            <option value={22}>Cỡ chữ 22px</option>
            <option value={26}>Cỡ chữ 26px</option>
            <option value={30}>Cỡ chữ 30px</option>
          </select>

          <button
            type="button"
            onClick={() => setShowAllMode((v) => !v)}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-[14px] font-medium"
          >
            {showAllMode ? 'Xem từng câu' : 'Xem toàn bộ đề'}
          </button>

          <button
            type="button"
            onClick={() => setShowSolution((v) => !v)}
            className={`inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-lg text-[14px] font-semibold ${
              showSolution ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white hover:bg-sky-500'
            }`}
          >
            {showSolution ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{showSolution ? 'Ẩn đáp án & lời giải' : 'Hiện đáp án & lời giải'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[14px] font-semibold"
          >
            <X className="w-4 h-4" />
            <span>Thoát</span>
          </button>
        </div>
      </header>

      {/* Presentation Canvas */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-slate-950">
        <div className="max-w-5xl mx-auto space-y-6">
          {qList.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-[18px]">
              Đề kiểm tra chưa có câu hỏi để trình chiếu.
            </div>
          ) : (
            qList.map((q, localIdx) => {
              const qNumber = showAllMode ? localIdx + 1 : currentIdx + 1;
              return (
                <article
                  key={q.id}
                  className="bg-white text-slate-900 rounded-2xl p-6 sm:p-8 shadow-xl space-y-5"
                  style={{ fontSize: `${textScalePx}px`, lineHeight: 1.6 }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 text-[15px]">
                    <span className="font-bold text-sky-700">
                      Câu {qNumber} / {exam.questions.length} · {QUESTION_TYPE_LABELS[q.type]}
                    </span>
                    <span className="text-slate-500 font-medium">{q.points} điểm</span>
                  </div>

                  {q.passage && (
                    <div className="p-4 bg-slate-50 border-l-4 border-sky-500 rounded-r-lg italic text-slate-700">
                      <RichMathText text={q.passage} fontSize={textScalePx - 1} />
                    </div>
                  )}

                  <div className="font-medium text-slate-900">
                    <RichMathText text={q.stem} fontSize={textScalePx} />
                  </div>

                  {q.svgIllustration && (
                    <div
                      className="max-w-md mx-auto p-3 border border-slate-200 rounded-xl bg-white [&>svg]:max-w-full [&>svg]:h-auto"
                      dangerouslySetInnerHTML={{ __html: q.svgIllustration }}
                    />
                  )}

                  {q.type === 'trac_nghiem' && q.options && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      {q.options.map((opt, oi) => {
                        const isCorrect = opt.id === q.correctOptionId;
                        return (
                          <div
                            key={opt.id}
                            className={`p-3.5 rounded-xl border-2 transition-colors ${
                              showSolution && isCorrect
                                ? 'bg-emerald-50 border-emerald-500 font-semibold text-emerald-950'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <span className="font-bold text-sky-700 mr-2">{OPT_LETTERS[oi]}.</span>
                            <RichMathText text={opt.text} fontSize={textScalePx - 1} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.type === 'dung_sai' && q.tfItems && (
                    <div className="space-y-2.5">
                      {q.tfItems.map((sub, si) => (
                        <div
                          key={sub.id}
                          className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                            showSolution
                              ? sub.isTrue
                                ? 'bg-emerald-50 border-emerald-400'
                                : 'bg-rose-50 border-rose-300'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div>
                            <span className="font-bold mr-2">{SUB_LETTERS[si]})</span>
                            <RichMathText text={sub.text} fontSize={textScalePx - 1} />
                          </div>
                          {showSolution && (
                            <span className="font-bold shrink-0 px-2.5 py-0.5 rounded bg-white border border-slate-200 text-[15px]">
                              {sub.isTrue ? 'ĐÚNG' : 'SAI'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(q.type === 'tra_loi_ngan' || q.type === 'dien_khuyet') && showSolution && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 font-semibold">
                      Đáp án:{' '}
                      <RichMathText text={q.shortAnswer || ''} fontSize={textScalePx - 1} inline />
                    </div>
                  )}

                  {showSolution && (q.solution || q.gradingGuide) && (
                    <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-[17px] text-slate-800 space-y-1.5">
                      <div className="font-bold text-sky-800">Hướng dẫn giải chi tiết:</div>
                      {q.solution && (
                        <div>
                          <RichMathText text={q.solution} fontSize={17} />
                        </div>
                      )}
                      {q.gradingGuide && (
                        <div className="text-slate-600 italic">
                          Thang điểm: <RichMathText text={q.gradingGuide} fontSize={16} inline />
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Slide Switcher when single-question mode */}
      {!showAllMode && exam.questions.length > 0 && (
        <footer className="px-6 py-3 bg-slate-800 border-t border-slate-700 flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={currentIdx <= 0}
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-[15px] font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Câu trước</span>
          </button>

          <div className="flex flex-wrap justify-center gap-1.5">
            {exam.questions.map((q, idx) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentIdx(idx)}
                className={`min-w-[36px] min-h-[36px] px-2 rounded-lg text-[14px] font-semibold transition-colors ${
                  idx === currentIdx ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={currentIdx >= exam.questions.length - 1}
            onClick={() => setCurrentIdx((i) => Math.min(exam.questions.length - 1, i + 1))}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-[15px] font-medium"
          >
            <span>Câu tiếp theo</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </footer>
      )}
    </div>
  );
};
