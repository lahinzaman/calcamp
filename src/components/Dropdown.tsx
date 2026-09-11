import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Pressable } from '../theme/Pressable';
import { Text } from '../theme/primitives';
import { ENTER_STAGGER, SPRING, TIMING } from '../theme/motion';
export function Dropdown<T extends string>({label,value,options,onChange,disabled=false}:{label:string;value:T;options:readonly {value:T;label:string}[];onChange:(value:T)=>void;disabled?:boolean}) {
  const [open,setOpen]=useState(false);
  const turn=useSharedValue(0);
  useEffect(()=>{turn.value=withSpring(open?1:0,SPRING.sheet);},[open,turn]);
  const chevron=useAnimatedStyle(()=>({transform:[{rotate:`${turn.value*180}deg`}]}));
  const current=options.find(o=>o.value===value)?.label ?? value;
  return <Animated.View layout={LinearTransition.duration(TIMING.base).reduceMotion(ReduceMotion.System)} className="mb-3">
    <Text className="mb-2 text-sm font-bold">{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current}`} accessibilityState={{expanded:open,disabled}} disabled={disabled} onPress={()=>setOpen(v=>!v)} tone="selection" className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
      <Text className="flex-1 text-lg font-bold">{current}</Text>
      <Animated.View style={chevron}><Text>▾</Text></Animated.View>
    </Pressable>
    {open&&!disabled&&<Animated.View layout={LinearTransition.duration(TIMING.base).reduceMotion(ReduceMotion.System)} className="mt-2 overflow-hidden rounded-2xl bg-raised p-2">
      {options.map((option,i)=><Animated.View key={option.value}
        entering={FadeInUp.delay(i*ENTER_STAGGER*.5).duration(TIMING.base).reduceMotion(ReduceMotion.System)}
        exiting={FadeOutUp.duration(TIMING.fast).reduceMotion(ReduceMotion.System)}>
        <Pressable accessibilityRole="radio" accessibilityState={{checked:option.value===value}} onPress={()=>{setOpen(false);onChange(option.value);}} tone="selection" weight="subtle" className="min-h-12 justify-center rounded-xl p-3"><Text>{option.value===value?'✓ ':''}{option.label}</Text></Pressable>
      </Animated.View>)}
    </Animated.View>}
  </Animated.View>;
}
