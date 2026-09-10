import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { Pressable } from '../theme/Pressable';
import { Text } from '../theme/primitives';
export function Dropdown<T extends string>({label,value,options,onChange,disabled=false}:{label:string;value:T;options:readonly {value:T;label:string}[];onChange:(value:T)=>void;disabled?:boolean}) {
  const [open,setOpen]=useState(false);
  return <Animated.View layout={LinearTransition.duration(180).reduceMotion(ReduceMotion.System)} className="mb-3">
    <Text className="mb-2 text-sm font-bold">{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${options.find(o=>o.value===value)?.label ?? value}`} accessibilityState={{expanded:open,disabled}} disabled={disabled} onPress={()=>setOpen(v=>!v)} className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4"><Text className="flex-1 text-lg font-bold">{options.find(o=>o.value===value)?.label ?? value}</Text><Text>{open?'▴':'▾'}</Text></Pressable>
    {open&&!disabled&&<Animated.View entering={FadeInDown.duration(160).reduceMotion(ReduceMotion.System)} exiting={FadeOutUp.duration(120).reduceMotion(ReduceMotion.System)} className="mt-2 rounded-2xl bg-raised p-2">{options.map(option=><Pressable key={option.value} accessibilityRole="radio" accessibilityState={{checked:option.value===value}} onPress={()=>{setOpen(false);onChange(option.value);}} className="min-h-12 justify-center rounded-xl p-3"><Text>{option.value===value?'✓ ':''}{option.label}</Text></Pressable>)}</Animated.View>}
  </Animated.View>;
}
