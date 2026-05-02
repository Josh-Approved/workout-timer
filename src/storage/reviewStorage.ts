import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@fwt/review';

// Tune these to control how often the review prompt appears
export const REVIEW_CONFIG = {
  firstPromptAfterWorkouts: 2,  // show after this many completed workouts
  remindAfterWorkouts: 5,       // if dismissed, show again after N more workouts
  maxPrompts: 3,                // never show more than this many times total
};

interface ReviewState {
  completedWorkouts: number;
  promptsShown: number;
  reviewOpened: boolean;  // user tapped "Leave a Review" — never prompt again
  nextPromptAt: number;   // show when completedWorkouts reaches this value
}

const DEFAULT_STATE: ReviewState = {
  completedWorkouts: 0,
  promptsShown: 0,
  reviewOpened: false,
  nextPromptAt: REVIEW_CONFIG.firstPromptAfterWorkouts,
};

async function load(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function save(state: ReviewState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

/** Call on every workout completion. Returns true if the review prompt should be shown. */
export async function recordWorkoutComplete(): Promise<boolean> {
  const state = await load();
  state.completedWorkouts += 1;
  const shouldPrompt =
    !state.reviewOpened &&
    state.promptsShown < REVIEW_CONFIG.maxPrompts &&
    state.completedWorkouts >= state.nextPromptAt;
  await save(state);
  return shouldPrompt;
}

/** Call when the user dismisses the prompt without reviewing. */
export async function dismissReviewPrompt(): Promise<void> {
  const state = await load();
  state.promptsShown += 1;
  state.nextPromptAt = state.completedWorkouts + REVIEW_CONFIG.remindAfterWorkouts;
  await save(state);
}

/** Call when the user taps "Leave a Review". Stops future prompts. */
export async function markReviewOpened(): Promise<void> {
  const state = await load();
  state.reviewOpened = true;
  await save(state);
}
