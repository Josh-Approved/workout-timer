// Canonical source: josh-approved-factory/templates/components/SortableList.tsx
// Generic drag-to-reorder list with screen-reader rotor support.
// Touch users: long-press a row to drag.
// Screen-reader users: focus a row, open the actions rotor, choose "Move up" / "Move down".

import React, { useCallback } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { useAnimatedScrollHandler } from 'react-native-reanimated';
import {
  GestureDetector,
  type ComposedGesture,
} from 'react-native-gesture-handler';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
} from 'react-native-reorderable-list';

type ScrollHandler = ReturnType<typeof useAnimatedScrollHandler>;

export type SortableRenderItemInfo<T> = {
  item: T;
  index: number;
  drag: () => void;
  accessibilityProps: {
    accessibilityActions: { name: 'increment' | 'decrement'; label: string }[];
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => void;
  };
};

export type SortableListProps<T> = {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (info: SortableRenderItemInfo<T>) => React.ReactElement;
  onOrderChange: (next: T[]) => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  ListHeaderComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  moveUpLabel?: string;
  moveDownLabel?: string;
  /** Reanimated scroll handler (the lib takes a UI-thread handler, not a plain
   *  onScroll) — drives the foot-of-screen wordmark pull-to-reveal. */
  onScroll?: ScrollHandler;
  /** iOS: bounce at the bottom even when content fits, so the pull-to-reveal
   *  gesture is reachable on a short list. No-op on Android. */
  alwaysBounceVertical?: boolean;
  /** Pull-to-reveal gesture (Android over-pull) — wraps the list when set. It
   *  recognises simultaneously with the list's scroll AND its reorder drag, so
   *  long-press-to-reorder is unaffected. */
  gesture?: ComposedGesture;
  /** onLayout for the list viewport; feeds at-bottom detection. */
  onScrollViewLayout?: (e: LayoutChangeEvent) => void;
  /** onContentSizeChange for the list; feeds at-bottom detection on short lists. */
  onContentSizeChange?: (w: number, h: number) => void;
};

export function SortableList<T>({
  items,
  keyExtractor,
  renderItem,
  onOrderChange,
  contentContainerStyle,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  moveUpLabel = 'Move up',
  moveDownLabel = 'Move down',
  onScroll,
  alwaysBounceVertical,
  gesture,
  onScrollViewLayout,
  onContentSizeChange,
}: SortableListProps<T>) {
  const handleReorder = useCallback(
    ({ from, to }: { from: number; to: number }) => {
      if (from === to) return;
      onOrderChange(reorderItems(items, from, to));
    },
    [items, onOrderChange]
  );

  const moveBy = useCallback(
    (index: number, delta: number) => {
      const to = Math.max(0, Math.min(items.length - 1, index + delta));
      if (to === index) return;
      onOrderChange(reorderItems(items, index, to));
    },
    [items, onOrderChange]
  );

  const renderCell = useCallback(
    ({ item, index }: { item: T; index: number }) => (
      <SortableCell
        item={item}
        index={index}
        moveUpLabel={moveUpLabel}
        moveDownLabel={moveDownLabel}
        onMove={moveBy}
        renderItem={renderItem}
      />
    ),
    [moveBy, renderItem, moveUpLabel, moveDownLabel]
  );

  const list = (
    <ReorderableList
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderCell}
      onReorder={handleReorder}
      contentContainerStyle={contentContainerStyle}
      ListHeaderComponent={ListHeaderComponent ?? undefined}
      ListFooterComponent={ListFooterComponent ?? undefined}
      ListEmptyComponent={ListEmptyComponent ?? undefined}
      onScroll={onScroll}
      alwaysBounceVertical={alwaysBounceVertical}
      overScrollMode={alwaysBounceVertical ? 'never' : 'auto'}
      onLayout={onScrollViewLayout}
      onContentSizeChange={onContentSizeChange}
    />
  );
  // Wrap in the pull-to-reveal gesture when wired (Android over-pull). It's
  // simultaneous with the list's scroll + reorder drag, so neither is blocked.
  return gesture ? <GestureDetector gesture={gesture}>{list}</GestureDetector> : list;
}

type SortableCellProps<T> = {
  item: T;
  index: number;
  moveUpLabel: string;
  moveDownLabel: string;
  onMove: (index: number, delta: number) => void;
  renderItem: (info: SortableRenderItemInfo<T>) => React.ReactElement;
};

function SortableCell<T>({
  item,
  index,
  moveUpLabel,
  moveDownLabel,
  onMove,
  renderItem,
}: SortableCellProps<T>) {
  const drag = useReorderableDrag();

  const accessibilityProps = {
    accessibilityActions: [
      { name: 'decrement' as const, label: moveUpLabel },
      { name: 'increment' as const, label: moveDownLabel },
    ],
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === 'decrement') onMove(index, -1);
      else if (event.nativeEvent.actionName === 'increment') onMove(index, 1);
    },
  };

  return renderItem({ item, index, drag, accessibilityProps });
}
