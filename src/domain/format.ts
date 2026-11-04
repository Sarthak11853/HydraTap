/** `250 ml`, `1.25 L` */
export function formatVolume(ml: number): string {
  const v = Math.max(0, Math.round(ml));
  if (v < 1000) return `${v} ml`;
  const litres = v / 1000;
  return `${Number.isInteger(litres) ? litres : litres.toFixed(2).replace(/0$/, '')} L`;
}

export function progressFraction(totalMl: number, goalMl: number): number {
  if (goalMl <= 0) return 0;
  return Math.max(0, totalMl / goalMl);
}

export function progressPercent(totalMl: number, goalMl: number): number {
  return Math.round(progressFraction(totalMl, goalMl) * 100);
}

export function remainingMl(totalMl: number, goalMl: number): number {
  return Math.max(0, goalMl - totalMl);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to the nearest step, then clamps. */
export function snap(value: number, step: number, min: number, max: number): number {
  return clamp(Math.round(value / step) * step, min, max);
}
