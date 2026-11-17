import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Color,
  FontFamily,
  FontSize,
  TextStyle,
} from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { MathNodeExtension } from './MathNodeExtension';
import { ScientificMediaExtension } from './ScientificMediaExtension';
import { ScientificToolbar } from './ScientificToolbar';
import {
  ScientificEditorGroupProvider,
  isEditorAlive,
  safeGetEditorHtml,
  useScientificEditorGroup,
} from './editorRegistry';
import {
  createFormulaNodeId,
  parseMixedTextToRichHtml,
  richContentToInternalDelimitedText,
} from '../../core/math/richTextCodec';

export interface ScientificRichTextEditorProps {
  value: string;
  onChange: (htmlValue: string) => void;
  placeholder?: string;
  variant?: 'full' | 'compact';
  minHeightPx?: number;
  /** If true, hides the per-instance toolbar because parent ScientificEditorGroupProvider hosts a single shared toolbar */
  useSharedToolbar?: boolean;
  /** Optional label shown inside advanced drawer only */
  ariaLabel?: string;
  className?: string;
  defaultEquationOpen?: boolean;
}

const ScientificRichTextEditorInner: React.FC<ScientificRichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Nhập nội dung văn bản tiếng Việt / tiếng Anh hoặc chọn biểu tượng công thức ở thanh công cụ...',
  variant = 'full',
  minHeightPx,
  useSharedToolbar = false,
  ariaLabel,
  className = '',
  defaultEquationOpen = true,
}) => {
  const editorId = useId();
  const groupCtx = useScientificEditorGroup();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedDraft, setAdvancedDraft] = useState('');
  const lastEmittedHtmlRef = useRef<string>('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const initialHtmlRef = useRef<string | null>(null);
  if (initialHtmlRef.current === null) {
    initialHtmlRef.current = parseMixedTextToRichHtml(value);
  }

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Subscript,
      Superscript,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder }),
      MathNodeExtension,
      ScientificMediaExtension,
    ],
    [placeholder]
  );

  const editor = useEditor({
    extensions,
    content: initialHtmlRef.current,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel || placeholder,
        class: `scientific-prosemirror focus:outline-none ${
          variant === 'compact' ? 'scientific-prosemirror-compact' : ''
        }`,
      },
    },
    onFocus: () => {
      groupCtx?.setFocusedEditor(editorId);
    },
    onUpdate: ({ editor: ed }) => {
      const html = safeGetEditorHtml(ed);
      if (html === null) return;
      lastEmittedHtmlRef.current = html;
      onChangeRef.current(html);
    },
  });

  const liveEditor = isEditorAlive(editor) ? editor : null;

  const registerEditor = groupCtx?.registerEditor;
  const unregisterEditor = groupCtx?.unregisterEditor;

  // Attach stable scientificEditorId to storage & register in group context
  useEffect(() => {
    if (!isEditorAlive(editor)) return;
    (editor.storage as { scientificEditorId?: string }).scientificEditorId = editorId;
    registerEditor?.(editorId, editor);
    return () => {
      unregisterEditor?.(editorId);
    };
  }, [editor, editorId, registerEditor, unregisterEditor]);

  // Sync external value changes (e.g. switching selected question)
  useEffect(() => {
    if (!isEditorAlive(editor)) return;
    const normalized = parseMixedTextToRichHtml(value);
    if (normalized === lastEmittedHtmlRef.current) return;
    const current = safeGetEditorHtml(editor);
    if (current === null) return;
    if (normalized !== current) {
      lastEmittedHtmlRef.current = normalized;
      try {
        editor.commands.setContent(normalized || '<p></p>', { emitUpdate: false });
      } catch {
        // Ignore if editor was concurrently torn down during StrictMode unmount
      }
    }
  }, [editor, value]);

  const handleDirectInsertLatex = (latex: string, display: 'inline' | 'block' = 'inline') => {
    if (groupCtx) {
      if (!groupCtx.activeMathTarget || groupCtx.activeMathTarget.editorId !== editorId) {
        groupCtx.setFocusedEditor(editorId);
      }
      groupCtx.insertFormulaLatex(latex, display);
      return;
    }
    if (!isEditorAlive(editor)) return;
    const nodeId = createFormulaNodeId();
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'mathNode',
        attrs: { id: nodeId, latex, display },
      })
      .run();
  };

  const resolvedMinH = minHeightPx ?? (variant === 'compact' ? 42 : 118);

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white focus-within:border-sky-500 transition-colors ${className}`}
    >
      {!useSharedToolbar && (
        <ScientificToolbar
          editor={liveEditor}
          onInsertLatex={handleDirectInsertLatex}
          compact={variant === 'compact'}
          showFormattingBar={true}
          defaultEquationOpen={variant === 'compact' ? false : defaultEquationOpen}
          advancedSourceOpen={advancedOpen}
          onToggleAdvancedSource={() => {
            setAdvancedOpen((prev) => {
              const next = !prev;
              if (next) {
                setAdvancedDraft(
                  richContentToInternalDelimitedText(safeGetEditorHtml(editor) || value)
                );
              }
              return next;
            });
          }}
        />
      )}

      {advancedOpen && !useSharedToolbar && (
        <div className="p-3 bg-amber-50/70 border-b border-amber-200 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-amber-900">
            <span>Công cụ nâng cao — Chỉnh sửa nguồn văn bản & công thức</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const html = parseMixedTextToRichHtml(advancedDraft);
                  if (isEditorAlive(editor)) {
                    editor.commands.setContent(html || '<p></p>', { emitUpdate: true });
                  }
                  setAdvancedOpen(false);
                }}
                className="px-2.5 py-1 bg-amber-600 text-white rounded text-[12px] font-semibold hover:bg-amber-700"
              >
                Áp dụng vào trình soạn thảo
              </button>
              <button
                type="button"
                onClick={() => setAdvancedOpen(false)}
                className="px-2 py-1 bg-white border border-slate-300 rounded text-[12px] text-slate-700"
              >
                Đóng
              </button>
            </div>
          </div>
          <textarea
            rows={3}
            value={advancedDraft}
            onChange={(e) => setAdvancedDraft(e.target.value)}
            className="w-full p-2 border border-amber-300 rounded-lg bg-white text-[13px] font-mono-code"
          />
        </div>
      )}

      <div
        className={variant === 'compact' ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5'}
        style={{ minHeight: `${resolvedMinH}px` }}
        onClick={() => {
          if (isEditorAlive(editor)) editor.commands.focus();
        }}
      >
        <EditorContent editor={liveEditor} />
      </div>
    </div>
  );
};

export const ScientificRichTextEditor: React.FC<ScientificRichTextEditorProps> = (props) => {
  const existingGroup = useScientificEditorGroup();
  if (existingGroup) {
    return <ScientificRichTextEditorInner {...props} />;
  }
  return (
    <ScientificEditorGroupProvider>
      <ScientificRichTextEditorInner {...props} />
    </ScientificEditorGroupProvider>
  );
};
