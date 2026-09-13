import { useEffect, useState } from 'react';
import { Modal, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Pressable } from '../../theme/Pressable';
import { ThemeRoot } from '../../theme/ThemeRoot';
import { Text } from '../../theme/primitives';
import { ENTER_STAGGER, SPRING, TIMING } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { QuickLogModal, type QuickAction } from './QuickLogModal';
import { FoodSearchModal } from '../foods/FoodSearchModal';
type MenuKey = QuickAction | 'search';
const actions:[MenuKey,string][]=[['search','🔎 Search the food database'],['photo','📷 AI Photo Log'],['barcode','▥ Barcode Scanner'],['label','▤ Scan a Nutrition Label'],['quick','⚡ Quick Add Calories'],['manual','✎ Manual Food Log'],['weight','⚖ Update Body Weight']];
export function QuickActions() {
  const [open,setOpen]=useState(false); const [pending,setPending]=useState<MenuKey|null>(null);
  const [action,setAction]=useState<MenuKey|null>(null); const insets=useSafeAreaInsets();
  const path=usePathname(); const bottom=insets.bottom+76;
  const turn=useSharedValue(0);
  useEffect(()=>{turn.value=withSpring(open?1:0,SPRING.pop);},[open,turn]);
  const spin=useAnimatedStyle(()=>({transform:[{rotate:`${turn.value*135}deg`}]}));
  const reveal=(next:boolean)=>{haptic(next?'medium':'light');setOpen(next);};
  // iOS will not present a second modal while the first is still dismissing: doing both in
  // one commit silently drops the new screen, which is why the camera never appeared. Only
  // iOS needs the wait, so every other platform still opens the action in the same commit.
  const promote=()=>setPending(current=>{if(current)setAction(current);return null;});
  const choose=(key:MenuKey)=>{haptic('selection');setOpen(false);if(Platform.OS==='ios')setPending(key);else setAction(key);};
  useEffect(()=>{
    if(!pending)return;
    // onDismiss normally wins the race; this is the safety net if it never arrives.
    const timer=setTimeout(promote,500);
    return ()=>clearTimeout(timer);
  },[pending]);
  // Remount per route closes camera/action sheets when tabs change.
  return <View pointerEvents="box-none" style={{position:'absolute',inset:0}} key={path}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open quick actions" accessibilityState={{expanded:open}} onPress={()=>reveal(true)} tone="none" weight="firm" className="h-16 w-16 items-center justify-center rounded-full bg-accent shadow-lg" style={{position:'absolute',right:20,bottom}}><Text className="text-4xl">+</Text></Pressable>
    <Modal visible={open} transparent animationType="none" onDismiss={promote} onRequestClose={()=>reveal(false)}><ThemeRoot transparent>
      <Animated.View entering={FadeIn.duration(TIMING.base).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(TIMING.fast).reduceMotion(ReduceMotion.System)} style={{flex:1,backgroundColor:'rgba(0,0,0,.45)'}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss quick actions" onPress={()=>reveal(false)} tone="none" style={{position:'absolute',inset:0}} />
        <View style={{position:'absolute',bottom,right:20,left:20,alignItems:'flex-end'}}>
          {actions.map(([key,label],i)=><Animated.View key={key}
            entering={FadeInDown.delay((actions.length-1-i)*ENTER_STAGGER).duration(TIMING.base).reduceMotion(ReduceMotion.System)}
            exiting={FadeOutDown.delay(i*30).duration(TIMING.fast).reduceMotion(ReduceMotion.System)} style={{maxWidth:'100%'}}>
            <Pressable accessibilityRole="button" accessibilityLabel={label.slice(2).trim()} onPress={()=>choose(key)} weight="firm" tone="none" className="mb-3 min-h-14 justify-center rounded-2xl bg-surface px-5 py-3"><Text className="text-lg font-bold">{label}</Text></Pressable>
          </Animated.View>)}
          <Animated.View style={spin}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close quick actions" onPress={()=>reveal(false)} tone="none" weight="firm" className="h-16 w-16 items-center justify-center rounded-full bg-accent"><Text className="text-4xl">+</Text></Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </ThemeRoot></Modal>
    {action==='search'&&<FoodSearchModal onClose={()=>setAction(null)}/>}
    {action&&action!=='search'&&<QuickLogModal key={action} action={action} onClose={()=>setAction(null)}/>}
  </View>;
}
