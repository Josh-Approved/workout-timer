/**
 * The two-resolution mapping behind SliderField, kept free of React Native
 * imports so it can be unit-tested headless. See SliderField for the control.
 */

/**
 * Where the editor's time sliders switch from one-second to five-second moves.
 * Anything a hold or a hangboard rep needs (2 s, 3 s, 7 s) sits under it; the
 * long end stays quick to set. Shared by the interval and sequence editors.
 */
export const FINE_SECONDS_BELOW = 30;

/**
 * The slider works in "ticks": one tick per unit up to `fineBelow`, then one
 * tick per `step`. Keeping the native slider's step at 1 tick is what gives a
 * single control two resolutions; these two helpers convert in each direction.
 * A value off the coarse grid (one that was typed) snaps to the nearest tick
 * only when the slider is next dragged, never on its own.
 */
export function valueToTick(value: number, min: number, step: number, fineBelow?: number): number {
  const fineTop = Math.max(min, Math.min(fineBelow ?? min, value));
  const fineTicks = fineTop - min;
  if (value <= fineTop) return fineTicks;
  return fineTicks + Math.round((value - fineTop) / step);
}

export function tickToValue(tick: number, min: number, step: number, fineBelow?: number): number {
  const fineTicks = Math.max(0, (fineBelow ?? min) - min);
  const t = Math.round(tick);
  if (t <= fineTicks) return min + t;
  return min + fineTicks + (t - fineTicks) * step;
}
