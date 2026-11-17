import React, { useMemo } from 'react';
import katex from 'katex';

interface KatexRendererProps {
  latex: string;
  displayMode?: boolean;
  className?: string;
  color?: string;
  fontSize?: number;
}

export const KatexRenderer: React.FC<KatexRendererProps> = ({
  latex,
  displayMode = false,
  className = '',
  color,
  fontSize,
}) => {
  const rendered = useMemo(() => {
    const clean = (latex || '').trim();
    if (!clean) {
      return { html: '<span class="text-slate-400 ui-guide italic">Chưa có công thức</span>', ok: true };
    }
    try {
      const html = katex.renderToString(clean, {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
      });
      return { html, ok: true };
    } catch {
      return { html: clean, ok: false };
    }
  }, [latex, displayMode]);

  return (
    <span
      className={className}
      style={{
        color: color || undefined,
        fontSize: fontSize ? `${fontSize}px` : undefined,
      }}
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
};
