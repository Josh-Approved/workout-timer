/**
 * Regression for defect workout-timer-20261018-2: Exercise could not go below
 * 5 s and the slider only moved in 5 s steps, so PT holds (2 to 3 s) and a
 * hangboard 7 on / 3 off were out of reach. The slider now works in ticks that
 * are one second wide below FINE_SECONDS_BELOW and `step` wide above it; these
 * helpers are the whole of that mapping.
 */
import { FINE_SECONDS_BELOW, tickToValue, valueToTick } from '../sliderTicks';

const STEP = 5;
const MAX = 600;

describe('two-resolution slider ticks', () => {
  it('reaches every second below the fine threshold from a 1 s floor', () => {
    for (let v = 1; v <= FINE_SECONDS_BELOW; v++) {
      expect(tickToValue(valueToTick(v, 1, STEP, FINE_SECONDS_BELOW), 1, STEP, FINE_SECONDS_BELOW)).toBe(v);
    }
  });

  it('reaches the hangboard and PT values from a 0 s rest floor too', () => {
    for (const v of [0, 1, 2, 3, 7, 10]) {
      expect(tickToValue(valueToTick(v, 0, STEP, FINE_SECONDS_BELOW), 0, STEP, FINE_SECONDS_BELOW)).toBe(v);
    }
  });

  it('moves in coarse steps above the threshold and lands exactly on max', () => {
    const topTick = valueToTick(MAX, 1, STEP, FINE_SECONDS_BELOW);
    expect(tickToValue(topTick, 1, STEP, FINE_SECONDS_BELOW)).toBe(MAX);
    const fineTicks = FINE_SECONDS_BELOW - 1;
    expect(tickToValue(fineTicks + 1, 1, STEP, FINE_SECONDS_BELOW)).toBe(FINE_SECONDS_BELOW + STEP);
    expect(topTick).toBe(fineTicks + (MAX - FINE_SECONDS_BELOW) / STEP);
  });

  it('one tick is one second at the floor, so the a11y increment reaches 2 s from 1 s', () => {
    expect(tickToValue(valueToTick(1, 1, STEP, FINE_SECONDS_BELOW) + 1, 1, STEP, FINE_SECONDS_BELOW)).toBe(2);
  });

  it('snaps a typed off-grid value to the nearest coarse tick only when converted', () => {
    // 43 s typed: the slider shows the nearest coarse position (45) but the
    // stored value stays 43 until the user drags.
    const tick = valueToTick(43, 1, STEP, FINE_SECONDS_BELOW);
    expect(tickToValue(tick, 1, STEP, FINE_SECONDS_BELOW)).toBe(45);
  });

  it('is the plain uniform slider when no fine threshold is given', () => {
    expect(valueToTick(0, 0, STEP)).toBe(0);
    expect(valueToTick(600, 0, STEP)).toBe(120);
    expect(tickToValue(3, 0, STEP)).toBe(15);
    expect(valueToTick(30, 30, 30)).toBe(0);
    expect(tickToValue(1, 30, 30)).toBe(60);
  });
});
