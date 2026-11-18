import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const engine = mathjax.document('', {
  InputJax: new TeX({ packages: AllPackages.filter(p => !['require','autoload','html'].includes(p)) }),
  OutputJax: new SVG({ fontCache: 'none' }),
});
export function formulaSvg(latex: string) {
  const node = engine.convert(latex, { display: true });
  const svg = adaptor.firstChild(node);
  if (!svg || adaptor.kind(svg) !== 'svg') throw new Error('Không thể hiển thị công thức');
  const viewBox = adaptor.getAttribute(svg, 'viewBox');
  const dimensions = viewBox.split(/\s+/).map(Number);
  const inner = adaptor.innerHTML(svg);
  if (inner.includes('data-mml-node="merror"')) throw new Error('Công thức chưa hợp lệ');
  return { viewBox, width: dimensions[2], height: dimensions[3], inner };
}
