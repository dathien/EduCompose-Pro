import React, { useMemo } from 'react';
import { KatexRenderer } from './KatexRenderer';
import {
  ParsedRichBlock,
  ParsedRichRun,
  parseRichContentToBlocks,
} from '../core/math/richTextCodec';

interface RichMathTextProps {
  text: string;
  fontSize?: number;
  className?: string;
  /** When true, renders single-paragraph content inline (ideal next to A., B., C., D. labels) */
  inline?: boolean;
}

const renderRun = (run: ParsedRichRun, idx: number, fontSize: number) => {
  if (run.kind === 'br') {
    return <br key={idx} />;
  }
  if (run.kind === 'formula') {
    const cleanLatex = (run.latex || '').replace(/#\?/g, '\\square').trim();
    if (!cleanLatex) return null;
    if (run.display === 'block') {
      return (
        <span key={idx} className="block my-1.5 text-center overflow-x-auto">
          <KatexRenderer latex={cleanLatex} displayMode={true} fontSize={fontSize + 1} />
        </span>
      );
    }
    return (
      <span key={idx} className="inline-block align-middle mx-0.5">
        <KatexRenderer latex={cleanLatex} displayMode={false} fontSize={fontSize} />
      </span>
    );
  }

  let content: React.ReactNode = run.text || '';
  if (run.superscript) content = <sup>{content}</sup>;
  if (run.subscript) content = <sub>{content}</sub>;
  if (run.bold) content = <strong>{content}</strong>;
  if (run.italic) content = <em>{content}</em>;
  if (run.underline) content = <u>{content}</u>;
  if (run.strike) content = <s>{content}</s>;

  const spanStyle: React.CSSProperties = {};
  if (run.color) spanStyle.color = run.color;
  if (run.highlight) spanStyle.backgroundColor = run.highlight;
  if (run.fontFamily) spanStyle.fontFamily = run.fontFamily;
  if (run.fontSizePt) spanStyle.fontSize = `${run.fontSizePt}pt`;

  return (
    <span key={idx} style={Object.keys(spanStyle).length > 0 ? spanStyle : undefined}>
      {content}
    </span>
  );
};

const renderBlock = (block: ParsedRichBlock, bIdx: number, fontSize: number, inlineMode: boolean) => {
  if (block.kind === 'mathBlock') {
    const cleanLatex = (block.latex || '').replace(/#\?/g, '\\square').trim();
    return (
      <div key={bIdx} className="my-2 text-center overflow-x-auto">
        <KatexRenderer latex={cleanLatex} displayMode={true} fontSize={fontSize + 2} />
      </div>
    );
  }

  if (block.kind === 'svg' && block.svgHtml) {
    return (
      <div
        key={bIdx}
        className="my-2 max-w-full overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: block.svgHtml }}
      />
    );
  }

  if (block.kind === 'image' && block.imageSrc) {
    return (
      <div key={bIdx} className="my-2">
        <img
          src={block.imageSrc}
          alt={block.imageAlt || 'Hình minh họa'}
          className="max-w-full h-auto rounded-lg border border-slate-200"
        />
      </div>
    );
  }

  if (block.kind === 'table' && block.rows) {
    return (
      <div key={bIdx} className="my-2 overflow-x-auto">
        <table className="w-full border-collapse border border-slate-300 text-[14px]">
          <tbody>
            {block.rows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.cells.map((cell, cIdx) => {
                  const CellTag = cell.isHeader ? 'th' : 'td';
                  return (
                    <CellTag
                      key={cIdx}
                      className={`border border-slate-300 px-2.5 py-1.5 text-left ${
                        cell.isHeader ? 'bg-slate-100 font-semibold' : ''
                      }`}
                    >
                      {cell.runs.map((r, ri) => renderRun(r, ri, fontSize - 1))}
                    </CellTag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const alignClass =
    block.align === 'center'
      ? 'text-center'
      : block.align === 'right'
      ? 'text-right'
      : block.align === 'justify'
      ? 'text-justify'
      : '';

  const runs = (block.runs || []).map((r, ri) => renderRun(r, ri, fontSize));

  if (block.kind === 'listItem') {
    return (
      <div key={bIdx} className={`pl-4 flex items-start gap-1.5 ${alignClass}`}>
        <span className="shrink-0 select-none">{block.ordered ? '•' : '•'}</span>
        <span>{runs}</span>
      </div>
    );
  }

  if (block.kind === 'heading') {
    return (
      <div key={bIdx} className={`font-bold my-1 ${alignClass}`}>
        {runs}
      </div>
    );
  }

  if (inlineMode) {
    return (
      <span key={bIdx} className={bIdx > 0 ? 'ml-1.5' : ''}>
        {runs}
      </span>
    );
  }

  return (
    <div key={bIdx} className={`${alignClass} leading-relaxed`}>
      {runs.length > 0 ? runs : <span className="inline-block h-2" />}
    </div>
  );
};

export const RichMathText: React.FC<RichMathTextProps> = ({
  text,
  fontSize = 16,
  className = '',
  inline = false,
}) => {
  const blocks = useMemo(() => parseRichContentToBlocks(text), [text]);
  if (!text || blocks.length === 0) return null;

  const singleParagraphInline =
    inline ||
    (blocks.length === 1 &&
      blocks[0].kind === 'paragraph' &&
      !blocks[0].align);

  if (singleParagraphInline && blocks.every((b) => b.kind === 'paragraph')) {
    return (
      <span className={`break-words ${className}`}>
        {blocks.map((b, i) => renderBlock(b, i, fontSize, true))}
      </span>
    );
  }

  return (
    <div className={`break-words space-y-1 ${className}`}>
      {blocks.map((b, i) => renderBlock(b, i, fontSize, false))}
    </div>
  );
};
