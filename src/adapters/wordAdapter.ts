import { downloadBlob, downloadText } from '../utils/vietnamese';

export interface DocumentAdapter {
  readonly mode: 'web' | 'office-addin';
  readonly isWordEnvironment: boolean;
  exportDocxFile(blob: Blob, filename: string): Promise<{ ok: boolean; message: string }>;
  copyTextToClipboard(text: string, label: string): Promise<{ ok: boolean; message: string }>;
  copyImageToClipboard(pngBlob: Blob): Promise<{ ok: boolean; message: string }>;
  insertOmmlIntoActiveWord(omml: string): Promise<{ ok: boolean; message: string }>;
}

declare global {
  interface Window {
    Office?: {
      context?: {
        document?: unknown;
      };
    };
  }
}

export class WebDocumentAdapter implements DocumentAdapter {
  readonly mode = 'web' as const;
  readonly isWordEnvironment = false;

  async exportDocxFile(blob: Blob, filename: string) {
    const safeName = filename.endsWith('.docx') ? filename : `${filename}.docx`;
    downloadBlob(blob, safeName);
    return { ok: true, message: `Đã tải xuống tệp Word "${safeName}".` };
  }

  async copyTextToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, message: `Đã sao chép ${label} vào bộ nhớ tạm.` };
    } catch {
      downloadText(text, `${label.replace(/\s+/g, '_').toLowerCase()}.txt`);
      return { ok: true, message: `Trình duyệt hạn chế clipboard; đã tải ${label} dạng tệp văn bản.` };
    }
  }

  async copyImageToClipboard(pngBlob: Blob) {
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        return { ok: true, message: 'Đã sao chép hình ảnh PNG vào bộ nhớ tạm.' };
      }
      downloadBlob(pngBlob, 'smart_docx_image.png');
      return { ok: true, message: 'Trình duyệt không hỗ trợ chép ảnh trực tiếp; đã tải xuống tệp PNG.' };
    } catch {
      downloadBlob(pngBlob, 'smart_docx_image.png');
      return { ok: true, message: 'Không thể ghi ảnh vào clipboard; đã tải xuống tệp PNG thay thế.' };
    }
  }

  async insertOmmlIntoActiveWord(_omml: string) {
    return {
      ok: false,
      message:
        'Ứng dụng đang chạy trên trình duyệt Web, không nằm trong Microsoft Word Add-in. Vui lòng dùng nút "Xuất Word (.docx)" hoặc "Sao chép MathML" để dán vào Word.',
    };
  }
}

export class WordOfficeAdapter implements DocumentAdapter {
  readonly mode = 'office-addin' as const;

  get isWordEnvironment(): boolean {
    return Boolean(typeof window !== 'undefined' && window.Office?.context?.document);
  }

  async exportDocxFile(blob: Blob, filename: string) {
    return new WebDocumentAdapter().exportDocxFile(blob, filename);
  }

  async copyTextToClipboard(text: string, label: string) {
    return new WebDocumentAdapter().copyTextToClipboard(text, label);
  }

  async copyImageToClipboard(pngBlob: Blob) {
    return new WebDocumentAdapter().copyImageToClipboard(pngBlob);
  }

  async insertOmmlIntoActiveWord(_omml: string) {
    if (!this.isWordEnvironment) {
      return {
        ok: false,
        message: 'Chưa phát hiện phiên làm việc Microsoft Word (Office.js).',
      };
    }
    return {
      ok: false,
      message: 'Cần cấu hình manifest Office Add-in để chèn OOXML trực tiếp tại con trỏ Word.',
    };
  }
}

export function getActiveDocumentAdapter(): DocumentAdapter {
  const officeAdapter = new WordOfficeAdapter();
  if (officeAdapter.isWordEnvironment) return officeAdapter;
  return new WebDocumentAdapter();
}
