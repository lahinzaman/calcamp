import { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Pressable } from '../../theme/Pressable';
import { ThemeRoot } from '../../theme/ThemeRoot';
import { Text } from '../../theme/primitives';
import { ENTER_STAGGER, SPRING, TIMING } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { QuickLogModal, type QuickAction } from './QuickLogModal';
const actions:[QuickAction,string][]=[['photo','📷 AI Photo Log'],['barcode','▥ Barcode Scanner'],['manual','✎ Manual Food Log'],['weight','⚖ Update Body Weight']];
export function QuickActions() {
  const [open,setOpen]=useState(false); const [action,setAction]=useState<QuickAction|null>(null); const insets=useSafeAreaInsets();
  const path=usePathname(); const bottom=insets.bottom+76;
  const turn=useSharedValue(0);
  useEffect(()=>{turn.value=withSpring(open?1:0,SPRING.pop);},[open,turn]);
  const spin=useAnimatedStyle(()=>({transform:[{rotate:`${turn.value*135}deg`}]}));
  const reveal=(next:boolean)=>{haptic(next?'medium':'light');setOpen(next);};
  // Remount per route closes camera/action sheets when tabs change.
  return <View pointerEvents="box-none" style={{position:'absolute',inset:0}} key={path}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open quick actions" accessibilityState={{expanded:open}} onPress={()=>reveal(true)} tone="none" weight="firm" className="h-16 w-16 items-center justify-center rounded-full bg-accent shadow-lg" style={{position:'absolute',right:20,bottom}}><Text className="text-4xl">+</Text></Pressable>
    <Modal visible={open} transparent animationType="none" onRequestClose={()=>reveal(false)}><ThemeRoot transparent>
      <Animated.View entering={FadeIn.duration(TIMING.base).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(TIMING.fast).reduceMotion(ReduceMotion.System)} style={{flex:1,backgroundColor:'rgba(0,0,0,.45)'}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss quick actions" onPress={()=>reveal(false)} tone="none" style={{position:'absolute',inset:0}} />
        <View style={{position:'absolute',bottom,right:20,left:20,alignItems:'flex-end'}}>
          {actions.map(([key,label],i)=><Animated.View key={key}
            entering={FadeInDown.delay((actions.length-1-i)*ENTER_STAGGER).duration(TIMING.base).reduceMotion(ReduceMotion.System)}
            exiting={FadeOutDown.delay(i*30).duration(TIMING.fast).reduceMotion(ReduceMotion.System)} style={{maxWidth:'100%'}}>
            <Pressable accessibilityRole="button" accessibilityLabel={label.slice(2).trim()} onPress={()=>{haptic('selection');setOpen(false);setAction(key);}} weight="firm" tone="none" className="mb-3 min-h-14 justify-center rounded-2xl bg-surface px-5 py-3"><Text className="text-lg font-bold">{label}</Text></Pressable>
          </Animated.View>)}
          <Animated.View style={spin}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close quick actions" onPress={()=>reveal(false)} tone="none" weight="firm" className="h-16 w-16 items-center justify-center rounded-full bg-accent"><Text className="text-4xl">+</Text></Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </ThemeRoot></Modal>
    {action&&<QuickLogModal key={action} action={action} onClose={()=>setAction(null)}/>}
  </View>;
}
