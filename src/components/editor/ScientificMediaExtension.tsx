import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Trash2 } from 'lucide-react';

const ScientificSvgView: React.FC<NodeViewProps> = ({ node, deleteNode, selected }) => {
  const svgHtml = (node.attrs.svg as string) || '';
  const label = (node.attrs.label as string) || 'Hình vẽ / Đồ thị khoa học';

  return (
    <NodeViewWrapper
      as="div"
      className={`my-2 p-3 rounded-xl border bg-white inline-flex flex-col items-center gap-1.5 max-w-full ${
        selected ? 'border-sky-500 ring-2 ring-sky-200' : 'border-slate-200'
      }`}
      contentEditable={false}
    >
      <div className="w-full flex items-center justify-between gap-3 text-[12px] text-slate-500">
        <span className="font-medium truncate">{label}</span>
        <button
          type="button"
          onClick={() => deleteNode()}
          title="Xóa hình này"
          className="p-0.5 text-slate-400 hover:text-red-600"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div
        className="max-w-full overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
    </NodeViewWrapper>
  );
};

export const ScientificMediaExtension = Node.create({
  name: 'scientificSvg',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      svg: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-svg') || el.innerHTML || '',
        renderHTML: (attrs) => ({ 'data-svg': attrs.svg || '' }),
      },
      label: {
        default: 'Hình vẽ khoa học',
        parseHTML: (el) => el.getAttribute('data-label') || 'Hình vẽ khoa học',
        renderHTML: (attrs) => ({ 'data-label': attrs.label || 'Hình vẽ khoa học' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="scientific-svg"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'scientific-svg' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ScientificSvgView);
  },
});
