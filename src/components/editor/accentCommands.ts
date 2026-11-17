import type { MathfieldElement } from 'mathlive';
import { ACCENT_ITEMS } from './mathToolbarCatalog';

const above = new Set(['overline','bar','hat','widehat','vec','overrightarrow','overleftarrow','overleftrightarrow','dot','ddot','dddot','tilde','widetilde','overgroup','overbrace','acute','grave','breve','check']);
const below = new Set(['underline','underbrace','undergroup']);
export const isAccentRemoval = (s: string) => s === '@remove-above' || s === '@remove-below';

// Remove exactly one outer wrapper, never discard nested content.
export function unwrapAccent(value: string, side: 'above' | 'below'): string | null {
  const text = value.trim();
  const match = /^\\([a-zA-Z]+)\s*\{/.exec(text);
  if (!match || !(side === 'above' ? above : below).has(match[1])) return null;
  let depth = 1;
  for (let i = match[0].length; i < text.length; i++) {
    if (text[i] === '\\' && /[{}\\]/.test(text[i+1] || '')) { i++; continue; }
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) {
      return text.slice(i+1).trim() ? null : text.slice(match[0].length, i);
    }
  }
  return null;
}

export function insertScientificMath(mf: MathfieldElement, snippet: string): boolean {
  const selection = mf.selection;
  const selected = mf.selectionIsCollapsed ? '' : mf.getValue(selection, 'latex');
  if (isAccentRemoval(snippet)) {
    const clean = unwrapAccent(selected, snippet === '@remove-above' ? 'above' : 'below');
    if (clean === null) return false;
    mf.insert(clean, { focus: true, selectionMode: 'after' });
    return true;
  }
  const isAccent = ACCENT_ITEMS.some(item => item.insertLatex === snippet);
  // MathLive #0 is the current selection; #? is an editable placeholder.
  let template = snippet;
  if (isAccent && selected) {
    const unwrapped = unwrapAccent(selected, below.has(/^\\([a-zA-Z]+)/.exec(snippet)?.[1] || '') ? 'below' : 'above');
    template = unwrapped === null ? snippet.replace('#?', '#0') : snippet.replace('#?', () => unwrapped);
  }
  mf.insert(template, { focus: true, selectionMode: selected && isAccent ? 'after' : 'placeholder' });
  return true;
}
