/**
 * Adds one small, fixed step beyond each populated side of a signed integer
 * chart. Positive and negative bounds are calculated independently so a large
 * inbound value cannot create an unnecessarily deep outbound axis.
 */
export function outwardIntegerAxisDomain(values: number[], step = 5): [number, number] {
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError('Axis step must be a positive finite number.');
  }

  const finiteValues = values.filter(Number.isFinite);
  const maximum = Math.max(0, ...finiteValues);
  const minimum = Math.min(0, ...finiteValues);
  const maximumDomain = maximum > 0
    ? (Math.floor(maximum / step) + 1) * step
    : minimum < 0 ? 0 : step;
  const minimumDomain = minimum < 0
    ? -(Math.floor(Math.abs(minimum) / step) + 1) * step
    : 0;

  return [minimumDomain, maximumDomain];
}

export type SplitSignedAxis = {
  domain: [number, number];
  ticks: number[];
  scale: (value: number) => number;
  unscale: (value: number) => number;
  formatTick: (value: number) => string;
};

const MINIMUM_POPULATED_SIGN_SHARE = 0.2;
const tickStepsForShare = (share: number) => Math.max(2, Math.round(share * 6));

const positiveAxisTicks = (extent: number, targetSteps = 4) => {
  if (extent <= 0) return [0];

  const roughStep = extent / targetSteps;
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / power;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const tickStep = Math.max(1, multiplier * power);
  const ticks = [0];

  for (let tick = tickStep; tick < extent; tick += tickStep) {
    ticks.push(tick);
  }
  ticks.push(extent);

  return ticks;
};

/**
 * Gives populated positive and negative ranges independent linear
 * portions of a chart. Each populated sign keeps a minimum visible share, then
 * the remaining height follows the relative ranges. The returned values are
 * plotting coordinates; formatTick converts them back to exact quantities.
 */
function buildSplitSignedAxis(
  finiteValues: number[],
  [minimumDomain, maximumDomain]: [number, number],
): SplitSignedAxis {
  const hasPositive = finiteValues.some((value) => value > 0);
  const hasNegative = finiteValues.some((value) => value < 0);
  const negativeExtent = hasNegative ? Math.abs(minimumDomain) : 0;
  const positiveExtent = hasPositive || !hasNegative ? maximumDomain : 0;
  let negativeShare = hasNegative ? 1 : 0;
  let positiveShare = hasPositive || !hasNegative ? 1 : 0;

  if (hasPositive && hasNegative) {
    const distributableShare = 1 - (MINIMUM_POPULATED_SIGN_SHARE * 2);
    const combinedExtent = positiveExtent + negativeExtent;
    positiveShare = MINIMUM_POPULATED_SIGN_SHARE
      + (distributableShare * positiveExtent / combinedExtent);
    negativeShare = 1 - positiveShare;
  }

  const scale = (value: number) => {
    if (!Number.isFinite(value) || value === 0) return 0;
    if (value > 0) return positiveExtent > 0 ? (value / positiveExtent) * positiveShare : 0;
    return negativeExtent > 0 ? (value / negativeExtent) * negativeShare : 0;
  };
  const unscale = (value: number) => value < 0
    ? (negativeShare > 0 ? (value / negativeShare) * negativeExtent : 0)
    : (positiveShare > 0 ? (value / positiveShare) * positiveExtent : 0);
  const formatTick = (value: number) => Math.round(unscale(value)).toLocaleString('en-BD');
  const negativeTicks = positiveAxisTicks(negativeExtent, tickStepsForShare(negativeShare))
    .slice(1)
    .reverse()
    .map((value) => scale(-value));
  const positiveTicks = positiveAxisTicks(positiveExtent, tickStepsForShare(positiveShare))
    .slice(1)
    .map(scale);

  return {
    domain: [negativeShare > 0 ? -negativeShare : 0, positiveShare],
    ticks: [...negativeTicks, 0, ...positiveTicks],
    scale,
    unscale,
    formatTick,
  };
}

export function splitSignedIntegerAxis(values: number[], step = 5): SplitSignedAxis {
  const finiteValues = values.filter(Number.isFinite);
  return buildSplitSignedAxis(finiteValues, outwardIntegerAxisDomain(finiteValues, step));
}

/**
 * Chooses a proportional 1/2/5 step for money charts, then leaves one step of
 * breathing room beyond the populated range. This avoids a fixed large offset
 * flattening charts with small values.
 */
export function outwardNiceAxisDomain(values: number[], targetSteps = 5): [number, number] {
  if (!Number.isFinite(targetSteps) || targetSteps <= 0) {
    throw new RangeError('Target step count must be a positive finite number.');
  }

  const finiteValues = values.filter(Number.isFinite);
  const magnitude = Math.max(0, ...finiteValues.map((value) => Math.abs(value)));
  if (magnitude === 0) return [0, 1];

  const roughStep = magnitude / targetSteps;
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / power;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = multiplier * power;

  return outwardIntegerAxisDomain(finiteValues, step);
}

export function splitSignedNiceAxis(values: number[], targetSteps = 5): SplitSignedAxis {
  const finiteValues = values.filter(Number.isFinite);
  return buildSplitSignedAxis(finiteValues, outwardNiceAxisDomain(finiteValues, targetSteps));
}
