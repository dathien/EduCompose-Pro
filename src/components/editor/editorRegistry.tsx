import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { MathfieldElement } from 'mathlive';
import { insertScientificMath, isAccentRemoval } from './accentCommands';
import { createFormulaNodeId } from '../../core/math/richTextCodec';

export interface ActiveMathTarget {
  editorId: string;
  nodeId: string;
  mathfield: MathfieldElement;
}

interface EditorGroupContextValue {
  activeEditorId: string | null;
  activeEditor: Editor | null;
  activeMathTarget: ActiveMathTarget | null;
  registerEditor: (id: string, editor: Editor) => void;
  unregisterEditor: (id: string) => void;
  setFocusedEditor: (id: string) => void;
  setActiveMathTarget: (target: ActiveMathTarget | null) => void;
  insertFormulaLatex: (latex: string, display?: 'inline' | 'block') => void;
  requestEditNodeId: string | null;
  clearRequestEditNodeId: () => void;
}

const EditorGroupContext = createContext<EditorGroupContextValue | null>(null);

export function isEditorAlive(ed: Editor | null | undefined): ed is Editor {
  return Boolean(
    ed &&
      !ed.isDestroyed &&
      !(ed as unknown as { destroyed?: boolean }).destroyed &&
      ed.schema
  );
}

export function safeGetEditorHtml(ed: Editor | null | undefined): string | null {
  if (!isEditorAlive(ed)) return null;
  try {
    return ed.getHTML();
  } catch {
    return null;
  }
}

export const ScientificEditorGroupProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const editorsMapRef = useRef<Map<string, Editor>>(new Map());
  const [activeEditorId, setActiveEditorId] = useState<string | null>(null);
  const [activeMathTarget, setActiveMathTargetState] = useState<ActiveMathTarget | null>(null);
  const [requestEditNodeId, setRequestEditNodeId] = useState<string | null>(null);

  const registerEditor = useCallback((id: string, editor: Editor) => {
    if (!isEditorAlive(editor)) return;
    editorsMapRef.current.set(id, editor);
    setActiveEditorId((curr) => curr || id);
  }, []);

  const unregisterEditor = useCallback((id: string) => {
    editorsMapRef.current.delete(id);
    setActiveEditorId((curr) => {
      if (curr !== id) return curr;
      const firstKey = editorsMapRef.current.keys().next().value;
      return firstKey || null;
    });
  }, []);

  const setFocusedEditor = useCallback((id: string) => {
    setActiveEditorId(id);
  }, []);

  const setActiveMathTarget = useCallback((target: ActiveMathTarget | null) => {
    setActiveMathTargetState(target);
  }, []);

  const clearRequestEditNodeId = useCallback(() => {
    setRequestEditNodeId(null);
  }, []);

  const insertFormulaLatex = useCallback(
    (latex: string, display: 'inline' | 'block' = 'inline') => {
      // Case 1: Cursor is currently editing inside an inline <math-field>
      if (activeMathTarget?.mathfield && activeMathTarget.mathfield.isConnected) {
        try {
          insertScientificMath(activeMathTarget.mathfield, latex);
          return;
        } catch {
          // Fallback to inserting a new node in active Tiptap editor
        }
      }

      if (isAccentRemoval(latex)) return;

      // Case 2: Insert a new mathNode at current Tiptap cursor and open inline edit immediately
      const targetId = activeEditorId || editorsMapRef.current.keys().next().value || null;
      const editor = targetId ? editorsMapRef.current.get(targetId) : undefined;
      if (!isEditorAlive(editor)) return;

      const nodeId = createFormulaNodeId();
      setRequestEditNodeId(nodeId);
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'mathNode',
          attrs: {
            id: nodeId,
            latex,
            display,
          },
        })
        .run();
    },
    [activeEditorId, activeMathTarget]
  );

  const rawActiveEditor = activeEditorId ? editorsMapRef.current.get(activeEditorId) || null : null;
  const activeEditor = isEditorAlive(rawActiveEditor) ? rawActiveEditor : null;

  const contextValue = useMemo<EditorGroupContextValue>(
    () => ({
      activeEditorId,
      activeEditor,
      activeMathTarget,
      registerEditor,
      unregisterEditor,
      setFocusedEditor,
      setActiveMathTarget,
      insertFormulaLatex,
      requestEditNodeId,
      clearRequestEditNodeId,
    }),
    [
      activeEditorId,
      activeEditor,
      activeMathTarget,
      registerEditor,
      unregisterEditor,
      setFocusedEditor,
      setActiveMathTarget,
      insertFormulaLatex,
      requestEditNodeId,
      clearRequestEditNodeId,
    ]
  );

  return (
    <EditorGroupContext.Provider value={contextValue}>
      {children}
    </EditorGroupContext.Provider>
  );
};

export function useScientificEditorGroup() {
  return useContext(EditorGroupContext);
}
