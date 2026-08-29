const CSS_PIXELS_PER_INCH = 96;
const MILLIMETRES_PER_INCH = 25.4;
const MIN_PAGE_HEIGHT_MM = 40;
const MAX_PAGE_HEIGHT_MM = 3276;
const BOTTOM_SAFETY_MM = 2;

/**
 * Converts the rendered receipt height to a custom continuous-paper page height.
 * The small safety allowance prevents rounding from pushing the footer onto a
 * second page without changing the receipt layout itself.
 */
export function thermalPageHeightMm(renderedHeightPx: number): number {
  if (!Number.isFinite(renderedHeightPx) || renderedHeightPx <= 0) {
    return MIN_PAGE_HEIGHT_MM;
  }

  const measuredHeightMm = Math.ceil(
    (renderedHeightPx * MILLIMETRES_PER_INCH) / CSS_PIXELS_PER_INCH,
  ) + BOTTOM_SAFETY_MM;

  return Math.min(MAX_PAGE_HEIGHT_MM, Math.max(MIN_PAGE_HEIGHT_MM, measuredHeightMm));
}
