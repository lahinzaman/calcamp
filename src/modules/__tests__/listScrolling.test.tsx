import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { reanimatedMock } from './support/reanimated';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });

let offsets: number[] = [];
let listProps: Record<string, unknown> = {};
mock.module('nativewind', { namedExports: { cssInterop: () => {}, vars: (v: unknown) => v } });
mock.module('react-native-reanimated', reanimatedMock);
mock.module('react-native', { namedExports: {
  View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', TextInput: 'TextInput',
  StyleSheet: { create: (v: Record<string, unknown>) => v, absoluteFill: {} }, Platform: { OS: 'ios', select: () => undefined },
} });
mock.module('react-native-safe-area-context', { namedExports: { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) } });
mock.module('@shopify/flash-list', { namedExports: {
  FlashList: React.forwardRef(function FlashList(props: {
    data: { id: string }[]; renderItem: (args: { item: { id: string }; index: number }) => React.ReactNode;
  }, ref: React.Ref<unknown>) {
    listProps = props as unknown as Record<string, unknown>;
    React.useImperativeHandle(ref, () => ({ scrollToOffset: ({ offset }: { offset: number }) => offsets.push(offset) }), []);
    return <>{props.data.map((item, index) => <React.Fragment key={item.id}>{props.renderItem({ item, index })}</React.Fragment>)}</>;
  }),
} });

const { ExercisePicker } = require('../workout/ExercisePicker') as typeof import('../workout/ExercisePicker');

let view: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => view?.unmount()); view = undefined; offsets = []; listProps = {}; });

const type = async (text: string) => {
  await act(async () => view!.root.findByProps({ accessibilityLabel: 'Search exercises' }).props.onChangeText(text));
  // The picker debounces typing by 180ms before it re-filters.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 260)); });
};

test('a narrowed exercise list returns to the top instead of staying parked past its own end', async () => {
  await act(async () => { view = create(<ExercisePicker selectedIds={[]} onToggle={() => {}} footer={null} />); });
  // Mounting scrolls to an offset it is already at, which costs nothing; what matters is that
  // every later replacement of the rows does the same.
  const settled = offsets.length;

  await type('squat');
  assert.equal(offsets.length, settled + 1, 'a new query starts at the top');

  await type('press');
  assert.equal(offsets.length, settled + 2, 'so does the next one');

  // Filter chips replace the rows just as a query does.
  await act(async () => view!.root.findByProps({ accessibilityLabel: 'Muscle' }).props.onPress());
  const chip = view!.root.findAll(node => typeof node.props?.accessibilityLabel === 'string'
    && /^Chest \(/.test(node.props.accessibilityLabel))[0];
  await act(async () => chip.props.onPress());
  assert.equal(offsets.length, settled + 3, 'a filter change resets the offset too');
  assert.ok(offsets.every(offset => offset === 0), 'always back to the very top');
});

test('narrowed results are not dragged back to where the old rows were', async () => {
  await act(async () => { view = create(<ExercisePicker selectedIds={[]} onToggle={() => {}} footer={null} />); });
  // FlashList v2 anchors the scroll to the visible row by default and re-applies that offset on
  // the layout pass after the data changes, which beat the reset above: narrowing the list, and
  // then clearing the search again, both left you parked in the middle of rows you never
  // scrolled through. Only `disabled` opts out; there is no imperative escape from it.
  assert.deepEqual(listProps.maintainVisibleContentPosition, { disabled: true });
});

test('dragging the results dismisses the keyboard while a tap still selects', async () => {
  await act(async () => { view = create(<ExercisePicker selectedIds={[]} onToggle={() => {}} footer={null} />); });
  // Both are needed together: persisting taps alone left the keyboard covering the list for the
  // whole of a scroll, and dismissing alone would swallow the first tap on a row.
  assert.equal(listProps.keyboardDismissMode, 'on-drag');
  assert.equal(listProps.keyboardShouldPersistTaps, 'always');
});
