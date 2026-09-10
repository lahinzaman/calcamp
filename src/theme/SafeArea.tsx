import { SafeAreaView as NativeSafeArea, type SafeAreaViewProps } from 'react-native-safe-area-context';
import { ThemeRoot } from './ThemeRoot';
/** Each native modal gets its own variable scope as well as physical safe-area padding. */
export function SafeAreaView(props: SafeAreaViewProps) { return <ThemeRoot><NativeSafeArea {...props} style={[{ flex: 1 }, props.style]} /></ThemeRoot>; }
