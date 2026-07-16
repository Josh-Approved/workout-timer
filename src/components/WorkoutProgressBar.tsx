/**
 * Segmented whole-workout progress bar: one segment per interval, width
 * proportional to duration, work intervals a shade stronger so the workout's
 * shape reads at a glance. Extracted from ActiveWorkoutScreen.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { PhaseStep } from '../types';
import { type PlaybackState } from '../utils/playback';
import { t } from '../i18n';
import { useTheme, space, Colors } from '../theme';

type Props = {
  steps: PhaseStep[];
  displayState: PlaybackState;
  /** 0..1 across the whole workout — the a11y percentage. */
  progressFraction: number;
  isLandscape: boolean;
};

export function WorkoutProgressBar({ steps, displayState, progressFraction, isLandscape }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c, isLandscape);

  return (
    <View
      style={s.progressOuter}
      accessible
      accessibilityLabel={t('workout.progressA11y', { percent: Math.round(progressFraction * 100) })}
      accessibilityRole="progressbar"
    >
      <View style={s.segmentRow} importantForAccessibility="no">
        {steps.map((step, i) => {
          let segFill = 0;
          if (displayState.mode === 'complete' || i < displayState.stepIndex) segFill = 1;
          else if (i === displayState.stepIndex && step.duration > 0) {
            segFill = (step.duration - displayState.timeRemaining) / step.duration;
          }
          const isWork = step.phase === 'exercise';
          return (
            <View
              key={i}
              style={[
                s.segment,
                { flex: Math.max(1, step.duration), backgroundColor: isWork ? c.hairlineStrong : c.hairline },
              ]}
              importantForAccessibility="no"
            >
              <View style={[s.segmentFill, { width: `${segFill * 100}%` as any }]} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(c: Colors, isLandscape: boolean) {
  const PROGRESS_HEIGHT = 14;
  return StyleSheet.create({
    progressOuter: {
      alignSelf: 'stretch',
      marginHorizontal: space.s6,
      marginBottom: isLandscape ? space.s4 : space.s6,
      height: PROGRESS_HEIGHT,
      justifyContent: 'center',
    },
    segmentRow: {
      flexDirection: 'row',
      height: PROGRESS_HEIGHT,
      gap: 2,
    },
    segment: {
      height: PROGRESS_HEIGHT,
      borderRadius: 3,
      overflow: 'hidden',
    },
    segmentFill: {
      height: '100%',
      backgroundColor: c.fg,
    },
  });
}
