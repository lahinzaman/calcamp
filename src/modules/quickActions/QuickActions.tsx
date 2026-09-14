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
import { useT, type MessageKey } from '../../i18n';
import { QuickLogModal, type QuickAction } from './QuickLogModal';
import { FoodSearchModal } from '../foods/FoodSearchModal';
type MenuKey = QuickAction | 'search';
type Group = 'camera' | 'manual';
/**
 * Seven equal choices asked people to know the difference between a barcode, a label and a
 * photograph before they had decided to take one. Three groups ask the smaller question first:
 * point a camera, type it in, or weigh yourself.
 */
const GROUPS:[Group|MenuKey,MessageKey][]=[['camera','fab.cameraGroup'],['manual','fab.manualGroup'],['weight','fab.weight']];
const MEMBERS:Record<Group,[MenuKey,MessageKey][]>={
  camera:[['barcode','fab.barcode'],['label','fab.label'],['photo','fab.photo']],
  manual:[['describe','fab.describe'],['search','fab.search'],['quick','fab.quick']],
};
const isGroup=(key:Group|MenuKey):key is Group=>key==='camera'||key==='manual';
export function QuickActions() {
  const [open,setOpen]=useState(false); const [pending,setPending]=useState<MenuKey|null>(null);
  const [group,setGroup]=useState<Group|null>(null);
  const [action,setAction]=useState<MenuKey|null>(null); const insets=useSafeAreaInsets();
  const path=usePathname(); const bottom=insets.bottom+76; const t=useT();
  const turn=useSharedValue(0);
  useEffect(()=>{turn.value=withSpring(open?1:0,SPRING.pop);},[open,turn]);
  const spin=useAnimatedStyle(()=>({transform:[{rotate:`${turn.value*135}deg`}]}));
  const reveal=(next:boolean)=>{haptic(next?'medium':'light');setOpen(next);if(!next)setGroup(null);};
  // iOS will not present a second modal while the first is still dismissing: doing both in
  // one commit silently drops the new screen, which is why the camera never appeared. Only
  // iOS needs the wait, so every other platform still opens the action in the same commit.
  const promote=()=>setPending(current=>{if(current)setAction(current);return null;});
  const choose=(key:MenuKey)=>{haptic('selection');setOpen(false);setGroup(null);if(Platform.OS==='ios')setPending(key);else setAction(key);};
  const tap=(key:Group|MenuKey)=>{if(isGroup(key)){haptic('selection');setGroup(key);return;}choose(key);};
  const shown:[Group|MenuKey,MessageKey][]=group?MEMBERS[group]:GROUPS;
  useEffect(()=>{
    if(!pending)return;
    // onDismiss normally wins the race; this is the safety net if it never arrives.
    const timer=setTimeout(promote,500);
    return ()=>clearTimeout(timer);
  },[pending]);
  // Remount per route closes camera/action sheets when tabs change.
  return <View pointerEvents="box-none" style={{position:'absolute',inset:0}} key={path}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('fab.open')} accessibilityState={{expanded:open}} onPress={()=>reveal(true)} tone="none" weight="firm" className="h-16 w-16 items-center justify-center rounded-full bg-accent shadow-lg" style={{position:'absolute',right:20,bottom}}><Text className="text-4xl">+</Text></Pressable>
    <Modal visible={open} transparent animationType="none" onDismiss={promote} onRequestClose={()=>reveal(false)}><ThemeRoot transparent>
      <Animated.View entering={FadeIn.duration(TIMING.base).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(TIMING.fast).reduceMotion(ReduceMotion.System)} style={{flex:1,backgroundColor:'rgba(0,0,0,.45)'}}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('fab.dismiss')} onPress={()=>reveal(false)} tone="none" style={{position:'absolute',inset:0}} />
        <View style={{position:'absolute',bottom,right:20,left:20,alignItems:'flex-end'}}>
          {shown.map(([key,messageKey],i)=><Animated.View key={key}
            entering={FadeInDown.delay((shown.length-1-i)*ENTER_STAGGER).duration(TIMING.base).reduceMotion(ReduceMotion.System)}
            exiting={FadeOutDown.delay(i*30).duration(TIMING.fast).reduceMotion(ReduceMotion.System)} style={{maxWidth:'100%'}}>
            <Pressable accessibilityRole="button" accessibilityLabel={t(messageKey)} onPress={()=>tap(key)} weight="firm" tone="none" className="mb-3 min-h-14 justify-center rounded-2xl bg-surface px-5 py-3"><Text className="text-lg font-bold">{t(messageKey)}</Text></Pressable>
          </Animated.View>)}
          {group&&<Animated.View entering={FadeInDown.duration(TIMING.base).reduceMotion(ReduceMotion.System)} exiting={FadeOutDown.duration(TIMING.fast).reduceMotion(ReduceMotion.System)}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('fab.back')} onPress={()=>{haptic('light');setGroup(null);}} weight="firm" tone="none" className="mb-3 min-h-14 justify-center rounded-2xl bg-raised px-5 py-3"><Text className="text-lg font-bold">‹ {t('fab.back')}</Text></Pressable>
          </Animated.View>}
          <Animated.View style={spin}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('fab.close')} onPress={()=>reveal(false)} tone="none" weight="firm" className="h-16 w-16 items-center justify-center rounded-full bg-accent"><Text className="text-4xl">+</Text></Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </ThemeRoot></Modal>
    {action==='search'&&<FoodSearchModal onClose={()=>setAction(null)}/>}
    {action&&action!=='search'&&<QuickLogModal key={action} action={action} onClose={()=>setAction(null)}/>}
  </View>;
}
