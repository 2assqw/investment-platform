export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function roundToDecimal(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function safeDivide(numerator: number, denominator: number): number {
  return denominator !== 0 ? numerator / denominator : 0;
}

export function cagr(start: number, end: number, years: number): number {
  if (start <= 0 || end <= 0 || years <= 0) return 0;
  return Math.pow(end / start, 1 / years) - 1;
}

/**
 * Scores a value against descending thresholds.
 * thresholds[0] = maxScore, thresholds[1..n] = value breakpoints (descending).
 * Returns maxScore if value >= thresholds[1], steps down linearly.
 */
export function thresholdScore(value: number, thresholds: number[]): number {
  const maxScore = thresholds[0]!;
  for (let i = 1; i < thresholds.length; i++) {
    if (value >= thresholds[i]!) {
      const stepSize = maxScore / (thresholds.length - 1);
      return Math.round(maxScore - (i - 1) * stepSize);
    }
  }
  return 0;
}

/**
 * Scores a value against ascending thresholds (lower is better).
 * thresholds[0] = maxScore, thresholds[1..n] = value breakpoints (ascending).
 */
export function inverseThresholdScore(value: number, thresholds: number[]): number {
  const maxScore = thresholds[0]!;
  for (let i = 1; i < thresholds.length; i++) {
    if (value <= thresholds[i]!) {
      const stepSize = maxScore / (thresholds.length - 1);
      return Math.round(maxScore - (i - 1) * stepSize);
    }
  }
  return 0;
}
