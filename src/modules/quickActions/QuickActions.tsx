import { useState } from 'react';
import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { Pressable } from '../../theme/Pressable';
import { ThemeRoot } from '../../theme/ThemeRoot';
import { Text } from '../../theme/primitives';
import { QuickLogModal, type QuickAction } from './QuickLogModal';
const actions:[QuickAction,string][]=[['photo','📷 AI Photo Log'],['barcode','▥ Barcode Scanner'],['manual','✎ Manual Food Log'],['weight','⚖ Update Body Weight']];
export function QuickActions() {
  const [open,setOpen]=useState(false); const [action,setAction]=useState<QuickAction|null>(null); const insets=useSafeAreaInsets();
  const path=usePathname(); const bottom=insets.bottom+76;
  // Remount per route closes camera/action sheets when tabs change.
  return <View pointerEvents="box-none" style={{position:'absolute',inset:0}} key={path}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open quick actions" accessibilityState={{expanded:open}} onPress={()=>setOpen(true)} className="h-16 w-16 items-center justify-center rounded-full bg-accent shadow-lg" style={{position:'absolute',right:20,bottom}}><Text className="text-4xl">+</Text></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}><ThemeRoot transparent><View style={{flex:1,backgroundColor:'rgba(0,0,0,.45)'}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss quick actions" onPress={()=>setOpen(false)} style={{position:'absolute',inset:0}} />
      <View style={{position:'absolute',bottom,right:20,left:20,alignItems:'flex-end'}}>{actions.map(([key,label],i)=><Animated.View key={key} entering={FadeInDown.delay(i*35).duration(160).reduceMotion(ReduceMotion.System)} exiting={FadeOutDown.duration(120).reduceMotion(ReduceMotion.System)} style={{maxWidth:'100%'}}><Pressable accessibilityRole="button" accessibilityLabel={label.slice(2).trim()} onPress={()=>{setOpen(false);setAction(key);}} className="mb-3 min-h-14 justify-center rounded-2xl bg-surface px-5 py-3"><Text className="text-lg font-bold">{label}</Text></Pressable></Animated.View>)}<Pressable accessibilityRole="button" accessibilityLabel="Close quick actions" onPress={()=>setOpen(false)} className="h-16 w-16 items-center justify-center rounded-full bg-accent"><Text className="text-3xl">×</Text></Pressable></View>
    </View></ThemeRoot></Modal>
    {action&&<QuickLogModal key={action} action={action} onClose={()=>setAction(null)}/>}
  </View>;
}
