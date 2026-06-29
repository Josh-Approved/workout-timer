// Canonical source: josh-approved-factory/templates/components/SortableList.tsx
// Generic drag-to-reorder list with screen-reader rotor support.
// Touch users: long-press a row to drag.
// Screen-reader users: focus a row, open the actions rotor, choose "Move up" / "Move down".

import React, { useCallback } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useAnimatedScrollHandler } from 'react-native-reanimated';
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

  return (
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
    />
  );
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
