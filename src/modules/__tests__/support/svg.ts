/** react-native-svg pulls RN internals the component mocks do not provide.
 *  Charts are never asserted on, so each shape renders as an inert host element.
 *  Named exports only: the real module is CJS and rejects a mixed default/named mock. */
export const svgMock = {
  namedExports: { Svg: 'Svg', Circle: 'Circle', Line: 'Line', Path: 'Path', G: 'G', Rect: 'Rect', Defs: 'Defs', LinearGradient: 'LinearGradient', Stop: 'Stop' },
};
