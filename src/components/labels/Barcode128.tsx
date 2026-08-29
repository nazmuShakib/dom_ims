import { encodeCode128 } from '@/lib/code128';

const LABEL_WIDTH_DOTS = 304; // 38 mm at 203 DPI, rounded to a whole printer dot.
const DOT_WIDTH_MM = 25.4 / 203;

export function Barcode128({ value }: { value: string }) {
  let modules: string;
  try {
    modules = encodeCode128(value).modules;
  } catch {
    return (
      <div className="flex h-full items-center justify-center border border-dashed border-out text-[6px] text-out">
        Identifier cannot be encoded
      </div>
    );
  }

  // Thermal output is rasterized at 203 DPI. Stretching the symbol to the
  // container gives modules fractional widths, which rasterize into uneven
  // bars. Use the widest whole-dot module size that fits the physical label so
  // every bar edge lands on the printer grid.
  const moduleDots = Math.max(1, Math.floor(LABEL_WIDTH_DOTS / modules.length));
  const physicalWidthMm = modules.length * moduleDots * DOT_WIDTH_MM;

  const bars: Array<{ x: number; width: number }> = [];
  let start = -1;
  for (let index = 0; index <= modules.length; index += 1) {
    if (modules[index] === '1' && start === -1) start = index;
    if (modules[index] !== '1' && start !== -1) {
      bars.push({ x: start, width: index - start });
      start = -1;
    }
  }

  return (
    <svg
      aria-label={`Code 128 barcode for ${value}`}
      className="mx-auto block h-full max-w-full"
      data-module-dots={moduleDots}
      preserveAspectRatio="none"
      role="img"
      shapeRendering="crispEdges"
      style={{ width: `${physicalWidthMm.toFixed(3)}mm` }}
      viewBox={`0 0 ${modules.length} 40`}
    >
      <rect width={modules.length} height="40" fill="#fff" />
      {bars.map((bar) => (
        <rect key={`${bar.x}-${bar.width}`} x={bar.x} width={bar.width} height="40" fill="#000" />
      ))}
    </svg>
  );
}
