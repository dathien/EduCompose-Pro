import React, { useRef, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import { EQUATION_TOOLBAR_GROUPS } from '../../components/editor/mathToolbarCatalog';
import { insertScientificMath } from '../../components/editor/accentCommands';
import { KatexRenderer } from '../../components/KatexRenderer';
import { formulaSvg } from './formulaSvg';
import type { DrawingElement } from '../../types';

export function DrawingFormulaEditor({ element, onApply }: { element: DrawingElement; onApply: (latex: string, size: number) => void }) {
  const field = useRef<MathfieldElement | null>(null);
  const [group, setGroup] = useState('basic');
  const [size, setSize] = useState(element.params.fontSize ?? 16);
  const [error, setError] = useState('');
  const attach = React.useCallback((node: MathfieldElement | null) => {
    field.current = node;
    if (node) node.value = element.params.latex || '';
  }, [element.id, element.params.latex]);
  const groups = EQUATION_TOOLBAR_GROUPS;
  return <section className="space-y-2 rounded-lg border border-sky-200 p-2" data-formula-editor="true">
    <div className="font-semibold text-sky-800">Chỉnh sửa công thức</div>
    <p className="ui-guide text-slate-600">Chọn mẫu ký hiệu, nhập trực tiếp vào công thức rồi nhấn Áp dụng.</p>
    <select aria-label="Nhóm ký hiệu" value={group} onChange={e=>setGroup(e.target.value)} className="w-full border rounded-lg p-2">
      {groups.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}
    </select>
    <div className="grid grid-cols-4 gap-1 max-h-48 overflow-y-auto">
      {groups.find(g=>g.id===group)?.items.map(item=><button key={item.id} type="button" title={item.tooltip} aria-label={item.tooltip} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(field.current && !insertScientificMath(field.current,item.insertLatex)) setError('Hãy bôi chọn ký hiệu có dấu cần bỏ.'); else setError('');}} className="min-h-[38px] border rounded-md bg-white hover:bg-sky-50"><KatexRenderer latex={item.previewLatex}/></button>)}
    </div>
    <math-field ref={attach} style={{ width:'100%', minHeight: '80px', fontSize:'24px', border:'1px solid #94a3b8', borderRadius:8 } as React.CSSProperties}/>
    <label className="flex items-center gap-2">Cỡ chữ (px)<input type="number" min={8} max={96} value={size} onChange={e=>setSize(Number(e.target.value))} className="w-20 border rounded p-1"/></label>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="flex gap-2"><button type="button" disabled={element.locked} className="flex-1 rounded-lg bg-sky-600 text-white p-2 disabled:opacity-50" onClick={()=>{try{const latex=field.current?.value || ''; if(!latex.trim()) throw new Error('Hãy nhập công thức.'); formulaSvg(latex); onApply(latex,Math.max(8,Math.min(96,size||16)));setError('');}catch{setError('Công thức chưa hợp lệ. Hãy kiểm tra các ô nhập.');}}}>Áp dụng</button><button type="button" className="border rounded-lg p-2" onClick={()=>{if(field.current) field.current.value=element.params.latex||'';setSize(element.params.fontSize??16);setError('');}}>Hủy</button></div>
  </section>;
}
