import { reportException } from '../modules/telemetry/events';
import React, { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { Text } from '../theme/primitives';
export class ScreenBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { reportException(_error); /* No health records, credentials, or raw stack traces are shown. */ }
  render() {
    if (!this.state.failed) return this.props.children;
    return <View className="flex-1 justify-center bg-background p-6"><Text className="text-2xl font-bold">This screen needs a refresh</Text><Text className="my-4 text-ink">Your saved device data is still available. Retry the screen or reopen the app.</Text><Pressable accessibilityRole="button" className="rounded-xl bg-raised p-4" onPress={() => this.setState({ failed: false })}><Text className="text-center font-semibold text-ink">Try again</Text></Pressable></View>;
  }
}
