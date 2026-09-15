import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { reanimatedMock } from './support/reanimated';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });
mock.module('nativewind', { namedExports: { cssInterop: () => {}, vars: (v: unknown) => v } });
mock.module('react-native-reanimated', reanimatedMock);
mock.module('react-native', { namedExports: {
  View: 'View', Text: 'Text', TextInput: 'TextInput',
  StyleSheet: { create: (v: Record<string, unknown>) => v, flatten: (v: unknown) => Array.isArray(v) ? Object.assign({}, ...v.filter(Boolean)) : (v ?? {}), absoluteFill: {} },
  Platform: { OS: 'ios', select: () => undefined },
} });

const { TextInput, sizeWithoutLineHeight } = require('../../theme/primitives') as typeof import('../../theme/primitives');

const styleOf = (element: React.ReactElement) => {
  let rendered!: ReturnType<typeof create>;
  act(() => { rendered = create(element); });
  const props = rendered.root.findByType('TextInput' as React.ElementType).props as Record<string, unknown>;
  const style = (Array.isArray(props.style) ? props.style : [props.style]) as unknown[];
  const flat = Object.assign({}, ...style.flat(9).filter(Boolean)) as Record<string, unknown>;
  act(() => rendered.unmount());
  return { flat, props };
};

test('a size class becomes a plain fontSize, and its lineHeight never reaches the field', () => {
  // Every Tailwind text-* class carries a lineHeight. On a single-line iOS field that puts the
  // glyphs on the bottom of the line box rather than centring them in the frame, which is what
  // made typed values sit on the border of their box.
  assert.deepEqual(sizeWithoutLineHeight('rounded-xl p-4 text-3xl font-bold text-ink'),
    { fontSize: 30, className: 'rounded-xl p-4 font-bold text-ink' });
  assert.equal(sizeWithoutLineHeight('px-4 text-base text-ink').fontSize, 16);
  assert.equal(sizeWithoutLineHeight('text-2xl').fontSize, 24);
  // A colour or alignment class is not a size and must survive untouched.
  assert.deepEqual(sizeWithoutLineHeight('text-ink font-bold'), { fontSize: 16, className: 'text-ink font-bold' });
  assert.deepEqual(sizeWithoutLineHeight(undefined), { fontSize: 16, className: undefined });
});

test('a single-line field centres its text; a multiline one starts at the top', () => {
  const single = styleOf(<TextInput className="rounded-xl p-4 text-3xl font-bold text-ink" value="146" />);
  assert.equal(single.flat.fontSize, 30, 'the size survives as a plain fontSize');
  assert.equal(single.flat.lineHeight, undefined, 'and nothing sets a lineHeight on it');
  assert.equal(single.flat.textAlignVertical, 'center');
  assert.equal(single.flat.minHeight, 48, 'the tap target is kept');
  // Padding belongs to whoever styled the box; the class still carries it down.
  assert.ok(String(single.props.className).includes('p-4'));
  assert.ok(!String(single.props.className).includes('text-3xl'), 'the size class itself is gone');

  const many = styleOf(<TextInput multiline className="text-base" value="a bowl of oatmeal" />);
  assert.equal(many.flat.textAlignVertical, 'top');
  assert.equal(many.flat.lineHeight, undefined);
});
