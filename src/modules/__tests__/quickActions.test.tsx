import assert from 'node:assert/strict';
import { afterEach,mock,test } from 'node:test';
import React from 'react';
import { act,create,type ReactTestRenderer } from 'react-test-renderer';
import { reanimatedMock } from './support/reanimated';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,__DEV__:true});
mock.module('nativewind',{namedExports:{cssInterop:()=>{},vars:(v:unknown)=>v}});
mock.module('react-native-reanimated', reanimatedMock);
mock.module('react-native',{namedExports:{View:'View',Text:'Text',TextInput:'TextInput',Pressable:'Pressable',Modal:'Modal',ScrollView:'ScrollView',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'web'},StyleSheet:{create:(v:Record<string,unknown>)=>v,absoluteFill:{}},Linking:{openSettings:async()=>{}},AppState:{currentState:'active',addEventListener:()=>({remove(){}})}}});
mock.module('react-native-safe-area-context',{namedExports:{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:0,bottom:34,left:0,right:0})}});
mock.module('expo-router',{namedExports:{usePathname:()=>'/dining'}});
mock.module('@shopify/flash-list',{namedExports:{
  FlashList:React.forwardRef((props:{data:{id:string}[];renderItem:(a:{item:{id:string};index:number})=>React.ReactNode;ListFooterComponent?:React.ReactNode},ref:React.Ref<unknown>)=>{
    React.useImperativeHandle(ref,()=>({scrollToOffset:()=>{}}),[]);
    return React.createElement(React.Fragment,null,
      ...props.data.map((item,index)=>React.createElement(React.Fragment,{key:item.id},props.renderItem({item,index}))),
      props.ListFooterComponent as React.ReactNode);
  })}});
let permission=false;let prompts=0;
mock.module('expo-camera',{namedExports:{CameraView:React.forwardRef((props:unknown,ref)=>{React.useImperativeHandle(ref,()=>({takePictureAsync:async()=>({base64:'/9j/4AECAwQ='})}));return React.createElement('Camera',props as object);}),useCameraPermissions:()=>[{granted:permission,canAskAgain:true},async()=>{prompts++;}]}});
const {QuickActions}=require('../quickActions/QuickActions') as typeof import('../quickActions/QuickActions');
const {QuickLogModal}=require('../quickActions/QuickLogModal') as typeof import('../quickActions/QuickLogModal');
const {ExerciseHelp}=require('../workout/ExerciseHelp') as typeof import('../workout/ExerciseHelp');
const {EXERCISE_CATALOG}=require('../workout/catalog') as typeof import('../workout/catalog');
const {nutritionStore}=require('../../store/nutritionStore') as typeof import('../../store/nutritionStore');
let view:ReactTestRenderer|undefined;
const label=(name:string)=>view!.root.findByProps({accessibilityLabel:name});
const press=async(name:string)=>{await act(async()=>{view!.root.findAllByType('Pressable' as React.ElementType).find(n=>n.findAllByType('Text' as React.ElementType).some(t=>t.props.children===name))!.props.onPress();});};
const type=async(name:string,text:string)=>{await act(async()=>label(name).props.onChangeText(text));};
afterEach(async()=>{await act(async()=>view?.unmount());view=undefined;nutritionStore.getState().reset();permission=false;prompts=0;});
test('the FAB asks which kind of logging first, and the camera stays opt-in',async()=>{
 await act(async()=>{view=create(<QuickActions/>);});await act(async()=>label('Open quick actions').props.onPress());
 const shown=()=>JSON.stringify(view!.toJSON());
 // Three groups, not seven equal choices; the specific ways to log live one tap in.
 for(const text of ['Camera logging','Manually log food','Log your weight'])assert.ok(shown().includes(text),text);
 for(const text of ['Scan a barcode','Quick add calories'])assert.ok(!shown().includes(text),`${text} is not top level`);

 await press('Manually log food');
 for(const text of ['Describe what you ate','Search the food database','Quick add calories'])assert.ok(shown().includes(text),text);
 await act(async()=>label('Back').props.onPress());assert.ok(shown().includes('Camera logging'),'back returns to the groups');

 await press('Camera logging');
 for(const text of ['Scan a barcode','Scan a nutrition label','Photograph a meal'])assert.ok(shown().includes(text),text);
 await press('Photograph a meal');assert.equal(prompts,0);assert.equal(view!.root.findAllByType('Camera' as React.ElementType).length,0);
 await press('Enter food manually');assert.ok(label('Food name'));
});
test('manual food log refuses partial nutrition and logs once after confirmation',async()=>{
 let closed=0;await act(async()=>{view=create(<QuickLogModal action="manual" onClose={()=>{closed++;}}/>);});
 await press('Confirm food log');assert.equal(closed,0);assert.equal(nutritionStore.getState().consumedMacros.caloriesKcal,0);
 await type('Food name','Test rice');await type('Portion · oz','4');await type('Calories · kcal','200');await type('Protein · g','4');await type('Fats · g','0');await type('Carbs · g','45');
 await press('Confirm food log');await press('Confirm food log');assert.equal(closed,1);assert.equal(nutritionStore.getState().consumedMacros.caloriesKcal,200);
});
test('a weigh-in goes through the photo step, and an invalid one never gets there',async()=>{
 let closed=0;await act(async()=>{view=create(<QuickLogModal action="weight" onClose={()=>closed++}/>);});
 await type('Body weight · lbs','NaN');await press('Save body weight');
 assert.equal(closed,0);assert.equal(nutritionStore.getState().bodyWeightLbs,null);
 await type('Body weight · lbs','180.5');await press('Save body weight');
 // The weight is not committed until the photo step resolves, one way or the other.
 assert.equal(nutritionStore.getState().bodyWeightLbs,null);
 assert.ok(JSON.stringify(view!.toJSON()).includes('Progress photo'));
 await press('Save the weight without a photo');
 assert.equal(nutritionStore.getState().bodyWeightLbs,180.5);assert.equal(closed,1);
});
test('exercise help explains the movement in words',async()=>{
 const exercise=EXERCISE_CATALOG[0];await act(async()=>{view=create(<ExerciseHelp exercise={exercise}/>);});
 await act(async()=>label(`Help for ${exercise.name}`).props.onPress());
 assert.ok(JSON.stringify(view!.toJSON()).includes(exercise.description));
 await press('Close exercise help');assert.ok(!JSON.stringify(view!.toJSON()).includes(exercise.description));
});
