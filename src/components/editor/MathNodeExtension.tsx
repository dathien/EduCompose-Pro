import React, { useEffect, useRef, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import 'mathlive';
import { MathfieldElement } from 'mathlive';
import katex from 'katex';
import { isEditorAlive, useScientificEditorGroup } from './editorRegistry';
import { createFormulaNodeId } from '../../core/math/richTextCodec';

if (typeof window !== 'undefined' && MathfieldElement) {
  MathfieldElement.soundsDirectory = null;
  MathfieldElement.fontsDirectory = null;
}

const MathNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  editor,
  getPos,
  selected,
}) => {
  const groupCtx = useScientificEditorGroup();
  const nodeId = (node.attrs.id as string) || 'fm_node';
  const latex = (node.attrs.latex as string) || '';
  const displayMode = node.attrs.display === 'block';
  const parseWarning = Boolean(node.attrs.parseWarning);

  const [isEditing, setIsEditing] = useState(false);
  const mathfieldRef = useRef<MathfieldElement | null>(null);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  const editorIdRef = useRef<string>(
    (editor.storage as { scientificEditorId?: string })?.scientificEditorId || 'single'
  );

  // Open automatically if freshly inserted from toolbar
  useEffect(() => {
    if (groupCtx?.requestEditNodeId && groupCtx.requestEditNodeId === nodeId) {
      setIsEditing(true);
      groupCtx.clearRequestEditNodeId();
    }
  }, [groupCtx, nodeId]);

  const commitAndExit = (moveDirection?: 'forward' | 'backward') => {
    const mf = mathfieldRef.current;
    if (mf) {
      const nextVal = (mf.getValue ? mf.getValue() : mf.value || '').trim();
      if (!nextVal) {
        groupCtx?.setActiveMathTarget(null);
        setIsEditing(false);
        deleteNode();
        editor.commands.focus();
        return;
      }
      if (nextVal !== latex) {
        updateAttributes({ latex: nextVal, parseWarning: false });
      }
    }
    groupCtx?.setActiveMathTarget(null);
    setIsEditing(false);

    // Place ProseMirror cursor cleanly before/after the math node
    if (!isEditorAlive(editor)) return;
    try {
      const pos = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof pos === 'number') {
        const targetPos = moveDirection === 'backward' ? pos : pos + node.nodeSize;
        editor.chain().focus().setTextSelection(targetPos).run();
      } else {
        editor.commands.focus();
      }
    } catch {
      try {
        if (isEditorAlive(editor)) editor.commands.focus();
      } catch {
        // Ignore if unmounted
      }
    }
  };

  // Mount and configure MathLive field whenever entering edit mode
  useEffect(() => {
    if (!isEditing) return;
    const mf = mathfieldRef.current;
    if (!mf) return;

    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.smartFence = true;
    mf.smartSuperscript = true;
    mf.value = latex;

    groupCtx?.setActiveMathTarget({
      editorId: editorIdRef.current,
      nodeId,
      mathfield: mf,
    });

    const timer = window.setTimeout(() => {
      mf.focus();
      // Jump directly to first placeholder #? if present
      if (latex.includes('#?')) {
        try {
          mf.executeCommand('moveToNextPlaceholder');
        } catch {
          // Ignore if no placeholder
        }
      }
    }, 15);

    const handleInput = () => {
      const val = mf.getValue ? mf.getValue() : mf.value || '';
      updateAttributes({ latex: val, parseWarning: false });
    };

    const handleMoveOut = (evt: CustomEvent<{ direction: 'forward' | 'backward' | 'upward' | 'downward' }>) => {
      evt.preventDefault();
      commitAndExit(evt.detail?.direction === 'backward' ? 'backward' : 'forward');
    };

    const handleKeyDown = (evt: KeyboardEvent) => {
      evt.stopPropagation();
      if (evt.key === 'Escape') {
        evt.preventDefault();
        commitAndExit('forward');
      } else if (evt.key === 'Enter' && !evt.shiftKey) {
        // Keep Enter inside multiline environments like cases/pmatrix/bmatrix
        const current = mf.getValue ? mf.getValue() : mf.value || '';
        const isMultiline = /\\begin\{(cases|pmatrix|bmatrix|vmatrix|aligned)\}/.test(current);
        if (!isMultiline) {
          evt.preventDefault();
          commitAndExit('forward');
        }
      } else if (evt.key === 'Backspace') {
        const current = (mf.getValue ? mf.getValue() : mf.value || '').trim();
        if (!current) {
          evt.preventDefault();
          groupCtx?.setActiveMathTarget(null);
          setIsEditing(false);
          deleteNode();
          if (isEditorAlive(editor)) editor.commands.focus();
        }
      }
    };

    mf.addEventListener('input', handleInput);
    mf.addEventListener('move-out', handleMoveOut as EventListener);
    mf.addEventListener('keydown', handleKeyDown);

    const handleDocPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Do not close if user clicked an equation toolbar button
      if (target.closest('[data-scientific-toolbar="true"]')) return;
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        commitAndExit('forward');
      }
    };

    document.addEventListener('mousedown', handleDocPointerDown);

    return () => {
      window.clearTimeout(timer);
      mf.removeEventListener('input', handleInput);
      mf.removeEventListener('move-out', handleMoveOut as EventListener);
      mf.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleDocPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, nodeId]);

  const renderedHtml = React.useMemo(() => {
    const safeLatex = (latex || '').replace(/#\?/g, '\\square').trim();
    if (!safeLatex) {
      return '<span class="text-sky-600 italic text-[14px]">[Công thức]</span>';
    }
    try {
      return katex.renderToString(safeLatex, {
        displayMode,
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      return `<span>${safeLatex}</span>`;
    }
  }, [latex, displayMode]);

  return (
    <NodeViewWrapper
      as={displayMode ? 'div' : 'span'}
      ref={wrapperRef}
      className={
        displayMode
          ? 'my-2 flex justify-center w-full'
          : 'inline-flex items-center align-middle mx-0.5'
      }
      contentEditable={false}
    >
      {isEditing ? (
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg bg-sky-50/90 border border-sky-400 px-1.5 py-0.5 shadow-xs ${
            displayMode ? 'min-w-[260px] justify-center' : 'min-w-[90px]'
          }`}
        >
          <math-field
            ref={(el: MathfieldElement | null) => {
              mathfieldRef.current = el;
            }}
            className="inline-math-node-field"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commitAndExit('forward')}
            title="Hoàn tất sửa công thức (Esc)"
            className="px-2 py-1 text-[12px] font-semibold bg-sky-600 text-white rounded hover:bg-sky-700 shrink-0"
          >
            Xong
          </button>
        </span>
      ) : (
        <span
          role="button"
          tabIndex={0}
          title="Nhấp trực tiếp vào công thức để chỉnh sửa"
          onClick={(e) => {
            e.stopPropagation();
            groupCtx?.setFocusedEditor(editorIdRef.current);
            setIsEditing(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsEditing(true);
            }
          }}
          className={`inline-flex items-center cursor-pointer rounded-md px-1 py-0.5 transition-colors ${
            selected
              ? 'bg-sky-100 ring-2 ring-sky-500'
              : parseWarning
              ? 'bg-amber-50 border border-amber-300 hover:bg-amber-100'
              : 'hover:bg-sky-50 border border-transparent hover:border-sky-200'
          } ${displayMode ? 'px-3 py-1.5' : ''}`}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      )}
    </NodeViewWrapper>
  );
};

export const MathNodeExtension = Node.create({
  name: 'mathNode',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id') || createFormulaNodeId(),
        renderHTML: (attrs) => ({ 'data-id': attrs.id || createFormulaNodeId() }),
      },
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') || '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex || '' }),
      },
      display: {
        default: 'inline',
        parseHTML: (el) => (el.getAttribute('data-display') === 'block' ? 'block' : 'inline'),
        renderHTML: (attrs) => ({ 'data-display': attrs.display === 'block' ? 'block' : 'inline' }),
      },
      parseWarning: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-parse-warning') === 'true',
        renderHTML: (attrs) => (attrs.parseWarning ? { 'data-parse-warning': 'true' } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="math-node"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-node' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },
});
