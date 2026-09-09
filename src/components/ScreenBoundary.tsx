import { reportException } from '../modules/telemetry/events';
import React, { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
export class ScreenBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { reportException(_error); /* No health records, credentials, or raw stack traces are shown. */ }
  render() {
    if (!this.state.failed) return this.props.children;
    return <View className="flex-1 justify-center bg-zinc-50 p-6"><Text className="text-2xl font-bold">This screen needs a refresh</Text><Text className="my-4 text-zinc-600">Your saved device data is still available. Retry the screen or reopen the app.</Text><Pressable accessibilityRole="button" className="rounded-xl bg-red-700 p-4" onPress={() => this.setState({ failed: false })}><Text className="text-center font-semibold text-white">Try again</Text></Pressable></View>;
  }
}
