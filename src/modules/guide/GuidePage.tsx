import React, { useState } from 'react';
import {
  BookOpen,
  ClipboardCheck,
  Compass,
  FileCheck2,
  FolderOpen,
  Shuffle,
  Sigma,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { AppTab } from '../../types';

interface GuidePageProps {
  onNavigate: (tab: AppTab) => void;
}

const GUIDE_SECTIONS: { id: string; label: string; tab?: AppTab }[] = [
  { id: 'sec-formula', label: '1. Soạn công thức OMML & Typst', tab: 'formula' },
  { id: 'sec-drawing', label: '2. Bảng vẽ, Đồ thị & Thống kê', tab: 'drawing' },
  { id: 'sec-omr', label: '3. Thiết kế Phiếu tô trắc nghiệm OMR', tab: 'omr' },
  { id: 'sec-exam', label: '4. Soạn đề, Ma trận & Trình chiếu', tab: 'exam' },
  { id: 'sec-shuffle', label: '5. Trộn đề & Xuất Bảng đáp án', tab: 'shuffle' },
  { id: 'sec-beautify', label: '6. Làm đẹp đề & Chuẩn hóa OOXML', tab: 'beautify' },
  { id: 'sec-wordtools', label: '7. OCR tiếng Việt & Công cụ Word', tab: 'wordtools' },
  { id: 'sec-backup', label: '8. Lưu trữ, Sao lưu & Giới hạn kĩ thuật', tab: 'projects' },
];

export const GuidePage: React.FC<GuidePageProps> = ({ onNavigate }) => {
  const [activeAnchor, setActiveAnchor] = useState<string>('sec-formula');

  const scrollToSection = (id: string) => {
    setActiveAnchor(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="max-w-[1320px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT STICKY TABLE OF CONTENTS */}
      <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-20 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 ui-section-title text-slate-900">
          <BookOpen className="w-5 h-5 text-sky-600 shrink-0" />
          <span>Mục lục hướng dẫn</span>
        </div>
        <nav className="space-y-1">
          {GUIDE_SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => scrollToSection(sec.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg ui-btn transition-colors ${
                activeAnchor === sec.id
                  ? 'bg-sky-50 text-sky-800 font-semibold border border-sky-200'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* RIGHT CONTENT */}
      <div className="lg:col-span-8 xl:col-span-9 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
          <h1 className="ui-page-title text-slate-900">
            Hướng dẫn sử dụng SMART DOCX PRO dành cho Giáo viên
          </h1>
          <p className="ui-body text-slate-600">
            Tài liệu hướng dẫn chi tiết từng phân hệ đang hoạt động trong ứng dụng: từ soạn công thức Word OMML, vẽ hình học/đồ thị, thiết kế phiếu OMR, lập ma trận đề thi theo cấu trúc 3 phần, trộn đề bảo toàn ID đến chuẩn hóa tệp .docx trực tiếp bằng trình xử lý XML.
          </p>
        </div>

        {/* 1. CÔNG THỨC */}
        <section id="sec-formula" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ui-section-title text-slate-900 flex items-center gap-2">
              <Sigma className="w-5 h-5 text-sky-600 shrink-0" />
              <span>1. Trình soạn thảo Công thức (MathLive – LaTeX – MathML – Typst – Word OMML)</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('formula')}
              className="ui-btn font-semibold text-sky-700 hover:underline"
            >
              Mở Công thức
            </button>
          </div>
          <div className="ui-body text-slate-700 space-y-3">
            <p>
              Phân hệ Công thức chia làm hai vùng: thư viện bên trái (lọc theo Toán, Vật lí, Hóa học, khối lớp 10–12, chủ đề, tìm không dấu) và trình soạn trực quan bên phải. Thầy cô có thể kéo thanh ngăn giữa hai vùng để thay đổi tỷ lệ.
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>4 chế độ nhập:</strong> Trực quan (MathLive), LaTeX, MathML và Typst. Khi chọn chế độ Typst và nhấn <em>Áp dụng Typst</em>, ứng dụng chuyển đổi cú pháp gọn sang biểu thức công thức và kiểm tra OMML.
              </li>
              <li>
                <strong>Xuất sang Microsoft Word:</strong> Nhấn <strong>Xuất Word (.docx OMML)</strong> để tải tệp Word chứa thẻ <code>&lt;m:oMath&gt;</code> chỉnh sửa được bằng thanh Equation của Word; hoặc chọn <strong>Sao chép MathML</strong> rồi dán vào Word. Với ký hiệu chưa được hỗ trợ trong OMML chuẩn, hệ thống hiển thị cảnh báo kèm nút xuất ảnh PNG 300 DPI.
              </li>
            </ul>
          </div>
        </section>

        {/* 2. VẼ HÌNH */}
        <section id="sec-drawing" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ui-section-title text-slate-900 flex items-center gap-2">
              <Compass className="w-5 h-5 text-teal-600 shrink-0" />
              <span>2. Bảng vẽ Khoa học, Đồ thị hàm số, Bảng biến thiên & Biểu đồ</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('drawing')}
              className="ui-btn font-semibold text-teal-700 hover:underline"
            >
              Mở Vẽ hình
            </button>
          </div>
          <div className="ui-body text-slate-700 space-y-3">
            <p>Phân hệ Vẽ hình gồm 5 chế độ làm việc trên cùng một thanh công cụ:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Bảng vẽ kéo thả:</strong> Kéo hình học phẳng/không gian, mạch điện, dụng cụ thủy tinh Hóa học (mặt thoáng chất lỏng giữ thăng bằng trọng lực khi xoay nghiêng) hoặc lưu đồ. Hỗ trợ <code>Ctrl+C</code> / <code>Ctrl+V</code>, <code>Ctrl+D</code>, <code>Ctrl+Z</code>, Nhóm/Rã nhóm và căn thẳng hàng.
              </li>
              <li>
                <strong>Kho hình mẫu (12):</strong> Gồm 12 hình vẽ chuẩn (hình chóp, lăng trụ, đồ thị, bảng biến thiên, mạch điện, thí nghiệm hóa học) để mở bản sao chỉnh sửa ngay.
              </li>
              <li>
                <strong>Đồ thị hàm số & Bảng biến thiên:</strong> Nhập tối đa 2 hàm số <code>y = f(x)</code> (hỗ trợ hàm phân thức, tiệm cận đứng/ngang, hàm từng khúc <code>x &lt; 0 ? -x : x^2</code>) hoặc dựng bảng biến thiên tự động dấu đạo hàm và mũi tên. Nhấn <strong>Chèn vào Bảng vẽ</strong> để kết hợp nhiều hình trước khi xuất SVG, PNG 300 DPI hoặc DOCX.
              </li>
              <li>
                <strong>Biểu đồ thống kê:</strong> Dựng biểu đồ cột, đường, quạt tròn, histogram, boxplot, phân tán (kèm đường hồi quy tuyến tính) và phân phối chuẩn Gauss.
              </li>
            </ul>
          </div>
        </section>

        {/* 3. PHIẾU OMR */}
        <section id="sec-omr" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ui-section-title text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-sky-600 shrink-0" />
              <span>3. Thiết kế Phiếu tô trắc nghiệm OMR theo kích thước mm chuẩn</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('omr')}
              className="ui-btn font-semibold text-sky-700 hover:underline"
            >
              Mở Phiếu OMR
            </button>
          </div>
          <div className="ui-body text-slate-700 space-y-2">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Chọn nhanh trong <strong>20 mẫu cấu hình sẵn</strong> (20, 40, 50, 60, 120 câu TN, cấu trúc mới TN + Đúng/Sai + Trả lời ngắn, khổ A4, A5, A3 hoặc <strong>2 phiếu A5 ghép trên 1 trang A4</strong>).
              </li>
              <li>
                Điều chỉnh số câu Phần I (A–D), Phần II (Đ/S a–d), Phần III (6 ô trả lời ngắn), Số báo danh, Mã đề, đường cắt phách và 4 dấu định vị góc (fiducials).
              </li>
              <li>
                <strong>Xuất bản in:</strong> Xuất PDF kích thước milimét thực tế (jsPDF), SVG vector, PNG 300 DPI, Word (.docx), In trực tiếp tỷ lệ 100%, và xuất tệp <strong>JSON tọa độ tâm ô tô (mm)</strong> phục vụ phần mềm chấm tự động.
              </li>
            </ul>
          </div>
        </section>

        {/* 4. SOẠN ĐỀ & MA TRẬN */}
        <section id="sec-exam" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ui-section-title text-slate-900 flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-teal-600 shrink-0" />
              <span>4. Soạn đề thi, Ma trận – Bản đặc tả & Trình chiếu lên bảng</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('exam')}
              className="ui-btn font-semibold text-teal-700 hover:underline"
            >
              Mở Soạn đề
            </button>
          </div>
          <div className="ui-body text-slate-700 space-y-2">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Hỗ trợ đầy đủ dạng câu hỏi: Trắc nghiệm 4 lựa chọn, Đúng/Sai 4 ý a–d, Trả lời ngắn, Điền khuyết, Ghép nối và Tự luận; chọn biểu tượng trên thanh công cụ để chèn công thức trực quan, nhấp trực tiếp vào công thức để chỉnh sửa và xuất sang OMML trong Word.
              </li>
              <li>
                <strong>Ma trận & Bản đặc tả (định hướng CV 7991):</strong> Nhập số lượng câu theo 3 mức độ Nhận biết – Thông hiểu – Vận dụng, theo dõi tổng điểm theo thời gian thực và nhấn <strong>Tạo đề tự động từ Ma trận</strong> để rút câu hỏi phù hợp từ Ngân hàng đề.
              </li>
              <li>
                <strong>Nhập ngược từ Word (.docx):</strong> Tải tệp đề thi Word có sẵn để trích xuất thành từng câu hỏi có thể chỉnh sửa và đưa vào Trộn đề.
              </li>
              <li>
                <strong>Chế độ trình chiếu dạy học:</strong> Mở màn hình chiếu cỡ chữ lớn kèm đồng hồ đếm ngược, chuyển từng câu hoặc cuộn danh sách, bật/tắt đáp án và lời giải ngay trên lớp.
              </li>
            </ul>
          </div>
        </section>

        {/* 5. TRỘN ĐỀ */}
        <section id="sec-shuffle" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ui-section-title text-slate-900 flex items-center gap-2">
              <Shuffle className="w-5 h-5 text-sky-600 shrink-0" />
              <span>5. Trộn đề & Xuất Bảng đáp án ánh xạ ID ổn định</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('shuffle')}
              className="ui-btn font-semibold text-sky-700 hover:underline"
            >
              Mở Trộn đề
            </button>
          </div>
          <div className="ui-body text-slate-700 space-y-2">
            <p>
              Mỗi câu hỏi và mỗi phương án mang một mã định danh ổn định (Stable ID), do đó đáp án đúng luôn được ánh xạ chính xác tuyệt đối sang mã đề mới (VD: 101, 102, 103, 104) thay vì dựa vào thứ tự chữ cái A/B/C/D. Hệ thống cũng bảo toàn nhóm câu hỏi chung ngữ liệu đọc hiểu và các phương án khóa vị trí cuối như <em>"Cả A và B đều đúng"</em>. Có thể tải trọn bộ đề Word + Ma trận đáp án Excel/HTML/Word trong một tệp ZIP duy nhất.
            </p>
          </div>
        </section>

        {/* 6. LÀM ĐẸP ĐỀ */}
        <section id="sec-beautify" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ui-section-title text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-teal-600 shrink-0" />
              <span>6. Làm đẹp đề thi Word (.docx) giữ nguyên công thức OMML</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('beautify')}
              className="ui-btn font-semibold text-teal-700 hover:underline"
            >
              Mở Làm đẹp đề
            </button>
          </div>
          <div className="ui-body text-slate-700 space-y-2">
            <p>
              Phân hệ đọc trực tiếp cây XML bên trong tệp <code>.docx</code> (<code>word/document.xml</code> và <code>word/numbering.xml</code>) để thực hiện mà không làm hỏng bảng biểu, hình ảnh hay thẻ công thức <code>&lt;m:oMath&gt;</code>:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Chuẩn hóa toàn bộ font sang <strong>Times New Roman 13pt</strong>, khổ giấy A4, giãn dòng chuẩn in ấn.</li>
              <li>Chuyển đổi đánh số tự động (Auto-Numbering) sang văn bản tĩnh để tránh nhảy số khi sao chép sang tài liệu khác hoặc đưa lên hệ thống trực tuyến.</li>
              <li>In đậm nhãn <code>Câu X:</code>, gom khoảng trắng thừa, tách đề bản học sinh (ẩn lời giải/hướng dẫn chấm) và Tìm & Thay thế có hoàn tác (Undo).</li>
            </ul>
          </div>
        </section>

        {/* 7. CÔNG CỤ WORD & OCR */}
        <section id="sec-wordtools" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ui-section-title text-slate-900 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-sky-600 shrink-0" />
              <span>7. Công cụ Word chuyên sâu & Nhận dạng đề từ ảnh (OCR)</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('wordtools')}
              className="ui-btn font-semibold text-sky-700 hover:underline"
            >
              Mở Công cụ Word
            </button>
          </div>
          <div className="ui-body text-slate-700 space-y-2">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>OCR ngoại tuyến trong trình duyệt:</strong> Tải ảnh chụp trang sách hoặc đề kiểm tra, xoay ảnh, tăng tương phản/nhị phân hóa và chạy nhận dạng tiếng Việt + tiếng Anh (<code>Tesseract.js vie+eng</code>), sau đó đưa thẳng kết quả vào tài liệu Word đang soạn hoặc chỉnh sửa công thức.
              </li>
              <li>
                <strong>Kiểm tra chất lượng đề:</strong> Rà soát tự động các lỗi thiếu đáp án đúng, thiếu đáp án 4 phương án, trùng nội dung lựa chọn hoặc câu thiếu lời giải.
              </li>
            </ul>
          </div>
        </section>

        {/* 8. LƯU TRỮ & GIỚI HẠN */}
        <section id="sec-backup" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ui-section-title text-slate-900 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-teal-600 shrink-0" />
              <span>8. Lưu trữ dữ liệu & Lưu ý kĩ thuật trung thực</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="ui-btn font-semibold text-teal-700 hover:underline"
            >
              Mở Dự án
            </button>
          </div>
          <div className="ui-body text-slate-700 space-y-2.5">
            <p>
              Toàn bộ dữ liệu cá nhân được lưu trong trình duyệt hiện tại (IndexedDB). Khi đổi máy hoặc xóa bộ nhớ trình duyệt, hãy vào <strong>Dự án → Xuất bản sao lưu (.json)</strong> để lưu giữ dự phòng.
            </p>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg ui-guide space-y-1.5">
              <div><strong>Lưu ý về tích hợp Microsoft Word trực tiếp:</strong> Chức năng chèn trực tiếp vào văn bản đang mở chỉ hoạt động khi ứng dụng được nhúng làm Office.js Task Pane Add-in bên trong Microsoft Word; khi dùng trên trình duyệt web độc lập, ứng dụng xuất tệp <code>.docx</code> chuẩn để thầy cô tải về và mở bằng Word.</div>
              <div><strong>Lưu ý về in phiếu OMR và chấm bài:</strong> Khi in PDF phiếu OMR, chọn tùy chọn <em>Actual Size / Tỉ lệ 100%</em> (không chọn Fit to page) để giữ đúng tọa độ milimét. Hệ thống xuất tệp JSON tọa độ ô tô sẵn sàng để kết nối với ứng dụng quét ảnh/máy scan.</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
