/**
 * Voice Control names on the timer list — in every language this app ships.
 *
 * Voice Control activates a control by its accessible NAME: someone says the
 * words they can SEE on the control, and the OS matches them against
 * `accessibilityLabel`. So the label has to START with what is printed on the
 * control. The timer row prints the timer's own name first ("Standard Tabata",
 * then the summary, then the total), and it was labelled "Edit Standard Tabata"
 * — verb first — so a user saying the only words on the row matched nothing.
 *
 * The trap is that this is a per-locale property, and English is not the safe
 * half. German and Japanese are verb-FINAL, so "{name} bearbeiten" /
 * "{name}を編集" put the visible name first by accident and worked, while
 * English, Spanish, French, Italian and Portuguese put the verb first and
 * broke. Defect workout-timer-20260809-1 — the inverse of the divergence the
 * 2026-08-09 accessibility sweep found in the shared components, where de/ja
 * were the broken half.
 *
 * So this asserts on `props.accessibilityLabel` directly, per locale. A
 * `getByRole('button', { name })` query resolves off the rendered TEXT when the
 * label does not match, which means it stays GREEN on exactly the broken label
 * this test exists to catch.
 *
 * The play control is deliberately NOT held to the same shape: it is icon-only,
 * so there are no visible words on it to lead with, and keeping "Start {name}"
 * distinct from the row's "{name}, edit" is what lets Voice Control tell the
 * two controls in one row apart. The last case pins that distinctness.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// Native side-effect stubs — before the component import, per the canonical
// component-test preamble (ScreenHeader.component.test.tsx).
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
// The pull-to-reveal footer and the drag-to-reorder list are reanimated- and
// gesture-handler-backed and have no bearing on what a control is CALLED.
// SortableList is stood in by a plain renderer that hands `renderItem` the same
// info object the real one does, so the row under test renders unchanged.
jest.mock('../../components/FundingFooter', () => ({ FundingFooter: () => null }));
jest.mock('../../components/usePullRevealFooter', () => ({
  usePullRevealFooter: () => ({
    pullToReveal: false,
    reveal: undefined,
    gesture: undefined,
    onScroll: undefined,
    onScrollViewLayout: undefined,
    onContentSizeChange: undefined,
    footerHeight: 0,
    onFooterLayout: undefined,
  }),
}));
jest.mock('../../components/SortableList', () => {
  const React_ = require('react');
  const { View } = require('react-native');
  return {
    SortableList: ({ items, keyExtractor, renderItem }: any) =>
      React_.createElement(
        View,
        null,
        items.map((item: any, index: number) =>
          React_.createElement(
            View,
            { key: keyExtractor(item) },
            renderItem({
              item,
              index,
              drag: () => {},
              accessibilityProps: { accessibilityActions: [], onAccessibilityAction: () => {} },
            })
          )
        )
      ),
  };
});

// The screen reloads its timers in a focus effect; outside a NavigationContainer
// the real hook has no navigation object to attach to, so run the effect plainly.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
// One seeded timer, matching the QA fixture's first row (src/qa/fixtures.ts).
jest.mock('../../storage/storage', () => ({
  loadTimers: () =>
    Promise.resolve([
      {
        id: 'qa-tabata',
        name: 'Standard Tabata',
        initialCountdown: 10,
        warmUp: 0,
        exercise: 20,
        rest: 10,
        sets: 8,
        recovery: 0,
        cycles: 1,
        coolDown: 60,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      },
    ]),
  saveTimers: () => Promise.resolve(),
}));

const TIMER_NAME = 'Standard Tabata';

import TimerListScreen from '../TimerListScreen';
import { t, setLocaleStrings, resetToBaseStrings, CANONICAL_LOCALES } from '../../i18n';
import { LOCALES } from '../../i18n/locales';

/** English (no overlay) plus every locale the app ships. */
const CASES: string[] = ['en', ...CANONICAL_LOCALES];

async function renderList() {
  const navigation = { navigate: jest.fn() };
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <TimerListScreen
        navigation={navigation as any}
        route={{ key: 'TimerList', name: 'TimerList' } as any}
      />
    </SafeAreaProvider>
  );
}

/** The row's edit control, addressed by the label the dictionary declares. */
function editControl() {
  return screen.getByLabelText(t('timerList.editTimer', { name: TIMER_NAME }));
}

afterEach(() => resetToBaseStrings());

describe.each(CASES)('Timer row Voice Control names (%s)', (locale) => {
  beforeEach(() => {
    if (locale === 'en') resetToBaseStrings();
    else setLocaleStrings(LOCALES[locale as keyof typeof LOCALES]);
  });

  it('names the row with the timer name FIRST, the way it is printed', async () => {
    await renderList();

    // The words a Voice Control user can read on this row, in reading order,
    // begin with the timer's own name.
    expect(screen.getByText(TIMER_NAME)).toBeTruthy();

    const label = editControl().props.accessibilityLabel as string;

    // The assertion that matters, and the one a getByRole({ name }) query would
    // NOT make: the label itself leads with the visible name.
    expect(label.startsWith(TIMER_NAME)).toBe(true);
    // ...and it still says what the control does, for VoiceOver.
    expect(label.length).toBeGreaterThan(TIMER_NAME.length);
  });

  it('keeps the longer explanation in the hint, where Voice Control never looks', async () => {
    await renderList();

    expect(editControl().props.accessibilityHint).toBe(t('timerList.editTimerHint'));
  });

  it('keeps the play control distinguishable from the row', async () => {
    await renderList();

    const start = screen.getByLabelText(t('timerList.startTimer', { name: TIMER_NAME }));
    const startLabel = start.props.accessibilityLabel as string;

    // Icon-only, so it has no visible words to lead with — but it must still
    // carry the timer name (which row is it starting?) and must NOT collapse
    // into the same spoken name as the row's edit control.
    expect(startLabel).toContain(TIMER_NAME);
    expect(startLabel).not.toBe(editControl().props.accessibilityLabel);
  });
});
