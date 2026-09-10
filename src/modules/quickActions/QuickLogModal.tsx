import { useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action, Field } from '../../components/FormControls';
import { nutritionStore } from '../../store/nutritionStore';
import { gramsToOz, ozToGrams } from '../../lib/units';
import { useFoodVision } from '../vision/useFoodVision';
import { lookupBarcode } from './barcode';
import type { MacroTotals } from '../../types/nutrition';
export type QuickAction = 'photo'|'barcode'|'manual'|'weight';
const names:Record<QuickAction,string>={photo:'AI Photo Log',barcode:'Barcode Scanner',manual:'Manual Food Log',weight:'Update Body Weight'};
const macroFields=[['caloriesKcal','Calories · kcal'],['proteinG','Protein · g'],['fatG','Fats · g'],['carbsG','Carbs · g']] as const;
export function QuickLogModal({action,onClose}:{action:QuickAction;onClose:()=>void}) {
  const [permission,requestPermission]=useCameraPermissions(); const camera=useRef<CameraView>(null);
  const [cameraReady,setCameraReady]=useState(false); const [foreground,setForeground]=useState(AppState.currentState==='active');
  const [editing,setEditing]=useState(action==='manual'||action==='weight');
  const [name,setName]=useState(''); const [portion,setPortion]=useState(''); const [weight,setWeight]=useState('');
  const [values,setValues]=useState<Record<keyof MacroTotals,string>>({caloriesKcal:'',proteinG:'',fatG:'',carbsG:''});
  const [notice,setNotice]=useState(''); const [error,setError]=useState<string|null>(null); const [busy,setBusy]=useState(false);
  const locked=useRef(false); const alive=useRef(true); const request=useRef<AbortController|null>(null); const vision=useFoodVision();
  const [reference,setReference]=useState<{grams:number;macros:MacroTotals}|null>(null);
  useEffect(()=>{const sub=AppState.addEventListener('change',s=>setForeground(s==='active'));return()=>{alive.current=false;request.current?.abort();sub.remove();};},[]);
  const fill=(food:{grams:number;macros:MacroTotals},label:string,source:string)=>{
    setReference(food);setName(label);setPortion(String(Number(gramsToOz(food.grams).toFixed(3))));
    setValues(Object.fromEntries(Object.entries(food.macros).map(([k,v])=>[k,String(v)])) as Record<keyof MacroTotals,string>);setNotice(source);setEditing(true);
  };
  const scan=async(code:string)=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError(null);request.current=new AbortController();
    try{const food=await lookupBarcode(code,request.current.signal);if(alive.current)fill(food,food.name,food.source);}
    catch{if(alive.current){setError('No complete food label found. Enter the package values manually.');setEditing(true);}}
    finally{if(alive.current)setBusy(false);locked.current=false;}
  };
  const capture=async()=>{
    if(locked.current||!cameraReady)return;locked.current=true;setBusy(true);setError(null);
    try{const photo=await camera.current?.takePictureAsync({base64:true,quality:.6});if(!alive.current)return;if(!photo?.base64)throw new Error();
      const result=await vision.analyze({base64:photo.base64,mimeType:'image/jpeg'});if(!alive.current)return;
      if(result)fill({grams:result.portion_size_grams,macros:result.macros},'Photo meal','AI estimate · adjust the portion and confirm all values before logging.');
      else{setEditing(true);setError('Recognition is unavailable. Enter this meal manually.');}}
    catch{if(alive.current)setError('The camera could not capture a photo. Try again or enter the meal manually.');}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  };
  const changePortion=(text:string)=>{
    setPortion(text); if(!reference||!text.trim()||!Number.isFinite(Number(text))||Number(text)<=0)return;
    const ratio=ozToGrams(Number(text))/reference.grams;
    setValues(Object.fromEntries(Object.entries(reference.macros).map(([k,v])=>[k,String(Number((v*ratio).toFixed(2)))])) as Record<keyof MacroTotals,string>);
  };
  const save=()=>{
    if(locked.current)return;setError(null);
    try{if(action==='weight'){
      if(!weight.trim()||!Number.isFinite(Number(weight))||Number(weight)<70||Number(weight)>700)throw new Error('Enter a body weight of 70–700 lbs.');
      nutritionStore.getState().setBodyWeightLbs(Number(weight));
    }else{
      if(!name.trim()||!portion.trim()||!Number.isFinite(Number(portion))||Number(portion)<=0||Number(portion)>352)throw new Error('Enter a food name and portion greater than 0 oz (up to 352 oz).');
      if(macroFields.some(([key])=>!values[key].trim()||!Number.isFinite(Number(values[key]))||Number(values[key])<0||Number(values[key])>20000))throw new Error('Complete all four macro values; unknown values are not zero.');
      nutritionStore.getState().addConsumed(Object.fromEntries(macroFields.map(([k])=>[k,Number(values[k])])) as unknown as MacroTotals);
    }locked.current=true;onClose();}catch(e){setError((e as Error).message);}
  };
  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}><SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,paddingBottom:60}}>
    <Text className="mb-5 text-3xl font-bold">{names[action]}</Text>
    {!editing && <>
      <Text className="mb-4">{action==='photo'?'Photograph your plate to estimate a portion. You review the result before logging.':'Scan the UPC/EAN on a package, then verify the nutrition label.'}</Text>
      {!permission?.granted?<><Action label="Allow camera access" disabled={busy} onPress={()=>{void requestPermission().catch(()=>setError('Camera access is unavailable. Use manual logging.'));}} />{permission?.canAskAgain===false&&<Action secondary label="Open camera permissions in Settings" onPress={()=>{void Linking.openSettings().catch(()=>setError('Open device Settings to enable the camera.'));}} />}</>:foreground&&<CameraView ref={camera} style={{height:320,borderRadius:20}} facing="back" onCameraReady={()=>setCameraReady(true)} onMountError={()=>setError('Camera unavailable. Use manual logging.')} barcodeScannerSettings={{barcodeTypes:['ean13','ean8','upc_a','upc_e']}} onBarcodeScanned={action==='barcode'&&!busy?result=>{void scan(result.data);}:undefined} />}
      {action==='photo'&&<Action label={busy?'Analyzing…':'Take food photo'} disabled={!permission?.granted||!cameraReady||busy} onPress={()=>{void capture();}} />}
      {action==='barcode'&&busy&&<Text className="my-3">Looking up the label…</Text>}
      <Action secondary label="Enter food manually" disabled={busy} onPress={()=>setEditing(true)} />
    </>}
    {editing&&(action==='weight'?<><Text className="mb-4">Saved to today's diary and queued for cloud sync.</Text><Field label="Body weight · lbs" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /></>:<>
      {!!notice&&<Text className="mb-4">{notice}</Text>}<Field label="Food name" value={name} onChangeText={setName} maxLength={150}/><Field label="Portion · oz" value={portion} onChangeText={changePortion} keyboardType="decimal-pad" />
      <Text className="mb-3">Macros for the entire portion above. Changing a manual macro keeps your edited value until you change the portion again.</Text>{macroFields.map(([key,label])=><Field key={key} label={label} value={values[key]} onChangeText={text=>setValues(s=>({...s,[key]:text}))} keyboardType="decimal-pad" />)}
    </>)}
    {error&&<Text accessibilityRole="alert" className="mb-4">{error}</Text>}
    {editing&&<Action label={action==='weight'?'Save body weight':'Confirm food log'} disabled={busy} onPress={save} />}<Action secondary label="Close quick log" onPress={onClose}/>
  </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>;
}
