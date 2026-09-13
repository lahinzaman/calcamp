import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { CameraScanner } from './CameraScanner';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action, Field } from '../../components/FormControls';
import { nutritionStore } from '../../store/nutritionStore';
import { gramsToOz, ozToGrams } from '../../lib/units';
import { readUnits, readWeight, showWeight, weightUnit } from '../settings/measurementUnits';
import { useFoodVision } from '../vision/useFoodVision';
import { lookupBarcode } from './barcode';
import { LabelUnavailable, recognizeLabel } from './recognizeLabel';
import { missingMacros } from './nutritionLabel';
import { WeightPhotoSheet } from '../progress/WeightPhotoSheet';
import { addPhotos } from '../progress/photos';
import { useAuthStore } from '../../store/authStore';
import { localDateKey } from '../../store/nutritionStore';
import type { MacroTotals } from '../../types/nutrition';
export type QuickAction = 'photo'|'barcode'|'label'|'manual'|'weight'|'quick';
const names:Record<QuickAction,string>={photo:'AI Photo Log',barcode:'Barcode Scanner',label:'Scan a Nutrition Label',manual:'Manual Food Log',weight:'Update Body Weight',quick:'Quick Add Calories'};
const macroFields=[['caloriesKcal','Calories · kcal'],['proteinG','Protein · g'],['fatG','Fats · g'],['carbsG','Carbs · g']] as const;
/** Distinguish "this build has no provider" from "the request failed" — they need different actions. */
export function visionMessage(code: string | undefined) {
  if (code === 'NOT_CONFIGURED') return 'Photo recognition is not set up on this build, so there is nothing to send the photo to. Enter this meal by hand — every other feature works.';
  if (code === 'TIMEOUT') return 'Recognition took too long to answer. Try again, or enter this meal by hand.';
  if (code === 'INVALID_IMAGE') return 'That photo could not be read. Try again with the plate filling more of the frame.';
  return 'This meal could not be recognised. Enter it by hand and it will be logged the same way.';
}
export function QuickLogModal({action,onClose}:{action:QuickAction;onClose:()=>void}) {
  const [editing,setEditing]=useState(action==='manual'||action==='weight'||action==='quick');
  const [name,setName]=useState(''); const [portion,setPortion]=useState(''); const [weight,setWeight]=useState('');
  const [values,setValues]=useState<Record<keyof MacroTotals,string>>({caloriesKcal:'',proteinG:'',fatG:'',carbsG:''});
  const [notice,setNotice]=useState(''); const [error,setError]=useState<string|null>(null); const [busy,setBusy]=useState(false);
  const [code,setCode]=useState('');
  const [photoWeight,setPhotoWeight]=useState<number|null>(null);
  const units=useMemo(()=>readUnits(),[]);
  const bounds={min:showWeight(70,units,0),max:showWeight(700,units,0)};
  const owner=useAuthStore(s=>s.session?.user.id)??'anonymous';
  const locked=useRef(false); const alive=useRef(true); const request=useRef<AbortController|null>(null); const vision=useFoodVision();
  const [reference,setReference]=useState<{grams:number;macros:MacroTotals}|null>(null);
  useEffect(()=>()=>{alive.current=false;request.current?.abort();},[]);
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
  const readLabel=async(uri:string)=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError(null);
    try{
      const reading=await recognizeLabel(uri);if(!alive.current)return;
      if(!Object.keys(reading.macros).length){setEditing(true);setError('No nutrition panel was readable in that photo. Fill the frame with the label, or enter it by hand.');return;}
      setReference({grams:ozToGrams(1),macros:reading.macros as MacroTotals});
      setName('Packaged food');setPortion('1');
      setValues({caloriesKcal:String(reading.macros.caloriesKcal??''),proteinG:String(reading.macros.proteinG??''),
        fatG:String(reading.macros.fatG??''),carbsG:String(reading.macros.carbsG??'')});
      setNotice(`Read from the label${reading.servingLabel?` · per ${reading.servingLabel}`:''}. Check every value before logging.`);
      setEditing(true);
      const missing=missingMacros(reading);
      if(missing.length)setError(`The ${missing.join(' and ')} line could not be read. Fill it in from the package.`);
    }catch(cause){if(alive.current){setEditing(true);
      setError(cause instanceof LabelUnavailable?cause.message:'That label could not be read. Try again, or enter it by hand.');}}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  };
  const capture=async(base64:string)=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError(null);
    try{const photo={base64};if(!alive.current)return;if(!photo?.base64)throw new Error();
      const result=await vision.analyze({base64:photo.base64,mimeType:'image/jpeg'});if(!alive.current)return;
      if(result)fill({grams:result.portion_size_grams,macros:result.macros},'Photo meal','AI estimate · adjust the portion and confirm all values before logging.');
      else{setEditing(true);setError(visionMessage(vision.error?.code));}}
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
      const pounds=weight.trim()&&Number.isFinite(Number(weight))?readWeight(Number(weight),units):Number.NaN;
      if(!Number.isFinite(pounds)||pounds<70||pounds>700)throw new Error(`Enter a body weight of ${bounds.min}–${bounds.max} ${weightUnit(units)}.`);
      // The photo step saves the weight; the scale number alone shows far less than it plus a photo.
      setPhotoWeight(pounds);return;
    }else{
      if(action==='quick'){
        if(!values.caloriesKcal.trim()||!Number.isFinite(Number(values.caloriesKcal))||Number(values.caloriesKcal)<=0||Number(values.caloriesKcal)>20000)throw new Error('Enter the calories for this quick add.');
        if(macroFields.some(([key])=>values[key].trim()&&(!Number.isFinite(Number(values[key]))||Number(values[key])<0||Number(values[key])>20000)))throw new Error('Macro amounts must be between 0 and 20000 g.');
        nutritionStore.getState().addEntry({name:name.trim()||'Quick add',servings:1,servingLabel:null,
          referenceMacros:Object.fromEntries(macroFields.map(([k])=>[k,Number(values[k]||0)])) as unknown as MacroTotals,source:'quick'});
        locked.current=true;onClose();return;
      }
      if(!name.trim()||!portion.trim()||!Number.isFinite(Number(portion))||Number(portion)<=0||Number(portion)>352)throw new Error('Enter a food name and portion greater than 0 oz (up to 352 oz).');
      if(macroFields.some(([key])=>!values[key].trim()||!Number.isFinite(Number(values[key]))||Number(values[key])<0||Number(values[key])>20000))throw new Error('Complete all four macro values; unknown values are not zero.');
      // The macro fields describe the whole portion entered, so that portion is one serving.
      nutritionStore.getState().addEntry({name:name.trim(),servings:1,servingLabel:`${Number(portion)} oz`,
        referenceMacros:Object.fromEntries(macroFields.map(([k])=>[k,Number(values[k])])) as unknown as MacroTotals,
        source:action==='photo'?'photo':action==='barcode'?'barcode':'manual'});
    }locked.current=true;onClose();}catch(e){setError((e as Error).message);}
  };
  // One Modal for the life of this screen. presentationStyle cannot be changed on a modal
  // that is already presented, and swapping between two of them races iOS's dismissal.
  const scanner=action==='photo'||action==='barcode'||action==='label';
  if(scanner&&!editing)return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
    <CameraScanner mode={action==='photo'?'photo':action==='label'?'label':'barcode'} busy={busy} notice={error}
      onBarcode={code=>{void scan(code);}} onCapture={base64=>{void capture(base64);}} onCaptureUri={uri=>{void readLabel(uri);}}
      onManual={()=>{setError(null);setEditing(true);}} onClose={onClose} />
  </Modal>;
  if(photoWeight!==null)return <WeightPhotoSheet weightLbs={photoWeight} onClose={()=>setPhotoWeight(null)}
    onDone={photos=>{
      nutritionStore.getState().setBodyWeightLbs(photoWeight);
      if(photos.length)addPhotos(owner,localDateKey(new Date()),photos);
      locked.current=true;onClose();
    }} />;
  return <Modal visible presentationStyle={scanner?'fullScreen':'pageSheet'} animationType="slide" onRequestClose={onClose}><SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,paddingBottom:60}}>
    <Text className="mb-5 text-3xl font-bold">{names[action]}</Text>
    {action==='barcode'&&!reference&&<>
      <Text className="mb-3">Scanner not cooperating, or the code is damaged? Type the digits printed under the barcode.</Text>
      <Field label="Barcode number" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={14} />
      <Action label={busy?'Looking up…':'Look up this barcode'} disabled={busy||!code.trim()} onPress={()=>{void scan(code.trim());}} />
      <Action secondary label="Back to the scanner" disabled={busy} onPress={()=>{setError(null);setEditing(false);}} />
    </>}
    {action==='weight'&&<Text className="mb-4">A photo alongside the number is what actually shows change — the scale moves with water and food. Photos stay on this device and are never uploaded.</Text>}
    {editing&&(action==='quick'?<>
      <Text className="mb-4">For when you know roughly what it cost you but not the breakdown. Leave a macro blank and it is recorded as zero for this entry.</Text>
      <Field label="Food name" value={name} onChangeText={setName} maxLength={150} placeholder="Quick add" />
      {macroFields.map(([key,label])=><Field key={key} label={key==='caloriesKcal'?label:`${label} · optional`} value={values[key]} onChangeText={text=>setValues(s=>({...s,[key]:text}))} keyboardType="decimal-pad" />)}
    </>:action==='weight'?<><Text className="mb-4">Saved to today's diary and queued for cloud sync.</Text><Field label={`Body weight · ${weightUnit(units)}`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /></>:<>
      {!!notice&&<Text className="mb-4">{notice}</Text>}<Field label="Food name" value={name} onChangeText={setName} maxLength={150}/><Field label="Portion · oz" value={portion} onChangeText={changePortion} keyboardType="decimal-pad" />
      <Text className="mb-3">Macros for the entire portion above. Changing a manual macro keeps your edited value until you change the portion again.</Text>{macroFields.map(([key,label])=><Field key={key} label={label} value={values[key]} onChangeText={text=>setValues(s=>({...s,[key]:text}))} keyboardType="decimal-pad" />)}
    </>)}
    {error&&<Text accessibilityRole="alert" className="mb-4">{error}</Text>}
    {editing&&<Action label={action==='weight'?'Save body weight':action==='quick'?'Add calories':'Confirm food log'} disabled={busy} onPress={save} />}<Action secondary label="Close quick log" onPress={onClose}/>
  </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>;
}
