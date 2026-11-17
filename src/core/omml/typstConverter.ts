/**
 * Tested Typst <-> LaTeX conversion for standard high-school STEM math syntax.
 * Explicitly reports unsupported Typst constructs instead of silently dropping them.
 */

export interface TypstTranslationResult {
  output: string;
  warnings: string[];
}

const GREEK_TYPST_TO_LATEX: Record<string, string> = {
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  epsilon: '\\varepsilon',
  zeta: '\\zeta',
  eta: '\\eta',
  theta: '\\theta',
  iota: '\\iota',
  kappa: '\\kappa',
  lambda: '\\lambda',
  mu: '\\mu',
  nu: '\\nu',
  xi: '\\xi',
  pi: '\\pi',
  rho: '\\rho',
  sigma: '\\sigma',
  tau: '\\tau',
  phi: '\\varphi',
  chi: '\\chi',
  psi: '\\psi',
  omega: '\\omega',
  Delta: '\\Delta',
  Sigma: '\\Sigma',
  Omega: '\\Omega',
  Gamma: '\\Gamma',
  Lambda: '\\Lambda',
  Phi: '\\Phi',
  Pi: '\\Pi',
  Theta: '\\Theta',
};

const SYMBOL_TYPST_TO_LATEX: Record<string, string> = {
  oo: '\\infty',
  infinity: '\\infty',
  '->': '\\to',
  '<-': '\\leftarrow',
  '=>': '\\Rightarrow',
  '<=>': '\\Leftrightarrow',
  '!=': '\\neq',
  '<=': '\\le',
  '>=': '\\ge',
  '+-': '\\pm',
  '-+': '\\mp',
  times: '\\times',
  div: '\\div',
  dot: '\\cdot',
  approx: '\\approx',
  equiv: '\\equiv',
  prop: '\\propto',
  in: '\\in',
  notin: '\\notin',
  subset: '\\subset',
  subseteq: '\\subseteq',
  union: '\\cup',
  inter: '\\cap',
  forall: '\\forall',
  exists: '\\exists',
  emptyset: '\\emptyset',
  integral: '\\int',
  sum: '\\sum',
  product: '\\prod',
  lim: '\\lim',
  partial: '\\partial',
  nabla: '\\nabla',
  angle: '\\angle',
  perp: '\\perp',
  parallel: '\\parallel',
  degree: '^\\circ',
};

function splitTopLevelArgs(argsStr: string, separator = ','): string[] {
  const parts: string[] = [];
  let depthParen = 0;
  let depthBrace = 0;
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (ch === '"' && argsStr[i - 1] !== '\\') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes) {
      if (ch === '(') depthParen++;
      else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
      else if (ch === '{') depthBrace++;
      else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);
      else if (ch === separator && depthParen === 0 && depthBrace === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

function replaceTypstFuncCall(
  input: string,
  funcName: string,
  handler: (args: string[]) => string
): string {
  const token = `${funcName}(`;
  let result = '';
  let idx = 0;

  while (idx < input.length) {
    const found = input.indexOf(token, idx);
    if (found === -1) {
      result += input.slice(idx);
      break;
    }
    // Check word boundary before funcName
    if (found > 0 && /[a-zA-Z0-9_]/.test(input[found - 1])) {
      result += input.slice(idx, found + token.length);
      idx = found + token.length;
      continue;
    }

    result += input.slice(idx, found);
    let i = found + token.length;
    let depth = 1;
    let inQuotes = false;
    while (i < input.length && depth > 0) {
      const ch = input[i];
      if (ch === '"' && input[i - 1] !== '\\') inQuotes = !inQuotes;
      else if (!inQuotes) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
      }
      i++;
    }

    if (depth !== 0) {
      // Unclosed paren, leave untouched
      result += input.slice(found);
      break;
    }

    const inner = input.slice(found + token.length, i - 1);
    const args = splitTopLevelArgs(inner, ',');
    result += handler(args);
    idx = i;
  }

  return result;
}

export function typstToLatex(typstInput: string): TypstTranslationResult {
  const warnings: string[] = [];
  let text = typstInput.trim();
  if (text.startsWith('$') && text.endsWith('$') && text.length >= 2) {
    text = text.slice(1, -1).trim();
  }

  // Detect unsupported Typst directives early
  const unsupportedMatches = text.match(/#[a-zA-Z_][a-zA-Z0-9_-]*/g);
  if (unsupportedMatches && unsupportedMatches.length > 0) {
    warnings.push(
      `Cú pháp Typst nâng cao (${unsupportedMatches.join(', ')}) chưa được hỗ trợ tự động; vui lòng kiểm tra lại kết quả.`
    );
  }

  // Convert nested Typst function calls recursively
  const convertSegment = (seg: string): string => {
    let s = seg.trim();

    s = replaceTypstFuncCall(s, 'frac', (args) => {
      const num = convertSegment(args[0] || '');
      const den = convertSegment(args[1] || '');
      return `\\frac{${num}}{${den}}`;
    });

    s = replaceTypstFuncCall(s, 'sqrt', (args) => {
      return `\\sqrt{${convertSegment(args[0] || '')}}`;
    });

    s = replaceTypstFuncCall(s, 'root', (args) => {
      if (args.length >= 2) {
        return `\\sqrt[${convertSegment(args[0])}]{${convertSegment(args[1])}}`;
      }
      return `\\sqrt{${convertSegment(args[0] || '')}}`;
    });

    s = replaceTypstFuncCall(s, 'vec', (args) => {
      // Typst vec(a, b) is column vector; arrow(x) is vector arrow. Handle both gracefully.
      if (args.length === 1) {
        return `\\vec{${convertSegment(args[0])}}`;
      }
      return `\\begin{pmatrix}${args.map(convertSegment).join(' \\\\ ')}\\end{pmatrix}`;
    });

    s = replaceTypstFuncCall(s, 'arrow', (args) => {
      return `\\vec{${convertSegment(args[0] || '')}}`;
    });

    s = replaceTypstFuncCall(s, 'overline', (args) => {
      return `\\overline{${convertSegment(args[0] || '')}}`;
    });

    s = replaceTypstFuncCall(s, 'hat', (args) => {
      return `\\hat{${convertSegment(args[0] || '')}}`;
    });

    s = replaceTypstFuncCall(s, 'abs', (args) => {
      return `\\left|${convertSegment(args[0] || '')}\\right|`;
    });

    s = replaceTypstFuncCall(s, 'mat', (args) => {
      const rows = splitTopLevelArgs(args.join(','), ';');
      const latexRows = rows.map((row) =>
        splitTopLevelArgs(row, ',').map(convertSegment).join(' & ')
      );
      return `\\begin{pmatrix}${latexRows.join(' \\\\ ')}\\end{pmatrix}`;
    });

    s = replaceTypstFuncCall(s, 'cases', (args) => {
      return `\\begin{cases}${args.map(convertSegment).join(' \\\\ ')}\\end{cases}`;
    });

    s = replaceTypstFuncCall(s, 'binom', (args) => {
      return `\\binom{${convertSegment(args[0] || '')}}{${convertSegment(args[1] || '')}}`;
    });

    // Replace quoted text "..." -> \text{...}
    s = s.replace(/"([^"]*)"/g, (_, inner) => `\\text{${inner}}`);

    // Simple infix fractions like a/b or (a+b)/(c+d)
    s = s.replace(/(\([^()]+\)|[a-zA-Z0-9_]+)\s*\/\s*(\([^()]+\)|[a-zA-Z0-9_]+)/g, (_, a, b) => {
      const cleanA = a.startsWith('(') && a.endsWith(')') ? a.slice(1, -1) : a;
      const cleanB = b.startsWith('(') && b.endsWith(')') ? b.slice(1, -1) : b;
      return `\\frac{${cleanA}}{${cleanB}}`;
    });

    // Subscripts/superscripts with parens: x^(n+1) -> x^{n+1}, x_(i+1) -> x_{i+1}
    s = s.replace(/\^\(([^()]+)\)/g, '^{$1}');
    s = s.replace(/_\(([^()]+)\)/g, '_{$1}');

    // Multi-char operators
    s = s
      .replace(/<=>/g, ' \\Leftrightarrow ')
      .replace(/=>/g, ' \\Rightarrow ')
      .replace(/->/g, ' \\to ')
      .replace(/<-/g, ' \\leftarrow ')
      .replace(/!=/g, ' \\neq ')
      .replace(/<=/g, ' \\le ')
      .replace(/>=/g, ' \\ge ')
      .replace(/\+-/g, ' \\pm ');

    // Greek & Symbol identifiers
    s = s.replace(/\b([a-zA-Z]+)\b/g, (word) => {
      if (GREEK_TYPST_TO_LATEX[word]) return GREEK_TYPST_TO_LATEX[word];
      if (SYMBOL_TYPST_TO_LATEX[word]) return SYMBOL_TYPST_TO_LATEX[word];
      if (['sin', 'cos', 'tan', 'cot', 'ln', 'log', 'exp', 'max', 'min', 'det'].includes(word)) {
        return `\\${word}`;
      }
      return word;
    });

    return s.replace(/\s+/g, ' ').trim();
  };

  return {
    output: convertSegment(text),
    warnings,
  };
}

/**
 * Generates a readable Typst representation from common LaTeX expressions.
 */
export function latexToTypst(latex: string): string {
  let s = latex.trim();
  s = s.replace(/\\dfrac|\\tfrac|\\frac/g, '\\frac');

  // Iteratively convert simple \frac{a}{b}
  for (let pass = 0; pass < 5; pass++) {
    s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, 'frac($1, $2)');
    s = s.replace(/\\sqrt\[([^\[\]]+)\]\{([^{}]+)\}/g, 'root($1, $2)');
    s = s.replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');
    s = s.replace(/\\vec\{([^{}]+)\}/g, 'arrow($1)');
    s = s.replace(/\\overline\{([^{}]+)\}/g, 'overline($1)');
    s = s.replace(/\\hat\{([^{}]+)\}/g, 'hat($1)');
    s = s.replace(/\\text\{([^{}]+)\}/g, '"$1"');
  }

  s = s
    .replace(/\\infty/g, 'oo')
    .replace(/\\Leftrightarrow/g, '<=>')
    .replace(/\\Rightarrow/g, '=>')
    .replace(/\\to|\\rightarrow/g, '->')
    .replace(/\\leftarrow/g, '<-')
    .replace(/\\neq/g, '!=')
    .replace(/\\le|\\leq/g, '<=')
    .replace(/\\ge|\\geq/g, '>=')
    .replace(/\\pm/g, '+-')
    .replace(/\\cdot/g, 'dot')
    .replace(/\\times/g, 'times')
    .replace(/\\int/g, 'integral')
    .replace(/\\sum/g, 'sum')
    .replace(/\\prod/g, 'product')
    .replace(/\\left\|/g, 'abs(')
    .replace(/\\right\|/g, ')')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\left\[/g, '[')
    .replace(/\\right\]/g, ']');

  // Greek letters \alpha -> alpha
  for (const [typstName, latexCmd] of Object.entries(GREEK_TYPST_TO_LATEX)) {
    const escaped = latexCmd.replace('\\', '\\\\');
    s = s.replace(new RegExp(`${escaped}(?![a-zA-Z])`, 'g'), typstName);
  }

  s = s.replace(/\\(sin|cos|tan|cot|ln|log|lim|exp|max|min|det)\b/g, '$1');
  s = s.replace(/\^\{([^{}]+)\}/g, '^($1)');
  s = s.replace(/_\{([^{}]+)\}/g, '_($1)');

  return s.replace(/\s+/g, ' ').trim();
}
