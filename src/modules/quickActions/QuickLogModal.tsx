import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { CameraScanner } from './CameraScanner';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action, Field } from '../../components/FormControls';
import { nutritionStore } from '../../store/nutritionStore';
import { confirmToast } from '../../components/Toast';
import { gramsToOz, ozToGrams } from '../../lib/units';
import { readUnits, readWeight, showWeight, weightUnit } from '../settings/measurementUnits';
import { MAX_ANGLES, useFoodVision } from '../vision/useFoodVision';
import { MealReview } from '../vision/MealReview';
import { ScanProgress, useScanProgress } from '../../components/ScanProgress';
import type { RecognizedItem } from '../vision/resolveItems';
import { BarcodeUnknown, lookupBarcode } from './barcode';
import { LabelUnavailable, recognizeLabel } from './recognizeLabel';
import { missingMacros } from './nutritionLabel';
import { WeightPhotoSheet } from '../progress/WeightPhotoSheet';
import { addPhotos } from '../progress/photos';
import { useAuthStore } from '../../store/authStore';
import { localDateKey } from '../../store/nutritionStore';
import type { MacroTotals } from '../../types/nutrition';
export type QuickAction = 'photo'|'barcode'|'label'|'manual'|'weight'|'quick'|'describe'|'treadmill';
const names:Record<QuickAction,string>={photo:'AI Photo Log',barcode:'Barcode Scanner',label:'Scan a Nutrition Label',manual:'Manual Food Log',weight:'Update Body Weight',quick:'Quick Add Calories',describe:'Describe Your Meal',treadmill:'Treadmill Session'};
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
  const [angles,setAngles]=useState<string[]>([]);
  const [described,setDescribed]=useState('');
  // Barcode and label scans have their own steps to report; the photo path reports its own.
  const scan=useScanProgress();
  const [reference,setReference]=useState<{grams:number;macros:MacroTotals}|null>(null);
  useEffect(()=>()=>{alive.current=false;request.current?.abort();},[]);
  const fill=(food:{grams:number;macros:MacroTotals},label:string,source:string)=>{
    setReference(food);setName(label);setPortion(String(Number(gramsToOz(food.grams).toFixed(3))));
    setValues(Object.fromEntries(Object.entries(food.macros).map(([k,v])=>[k,String(v)])) as Record<keyof MacroTotals,string>);setNotice(source);setEditing(true);
  };
  const lookUp=async(code:string)=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError(null);scan.begin();request.current=new AbortController();
    try{
      scan.reach(.35);
      const food=await lookupBarcode(code,request.current.signal);
      scan.reach(.9);
      if(alive.current){
        scan.done();
        // The serving the package leads with, with the macros published for that serving —
        // never another serving's figures shown against this one.
        const serving=food.servings[food.selected]??food.servings[0];
        // The weight these macros are *for*. A serving measured in ml (a drink) or in nothing at
        // all has no gram weight, and the old fallback pinned its macros to one ounce — so the
        // figures were right as shown and wrong the moment the portion was changed, because
        // every later scaling divided by 28 g that the serving never weighed.
        const known=serving.metricUnit==='g'&&serving.metricAmount?serving.metricAmount:null;
        fill({grams:known??ozToGrams(1),macros:serving.macros},food.brand?`${food.brand} ${food.name}`:food.name,
          `${food.source} · ${serving.description}${known?'':' · this serving has no published weight, so adjust the portion by eye'}`);
      }
    }
    catch(cause){if(alive.current){scan.reset();
      // An unknown barcode is a dead end, not a failure to explain away: the form is already
      // open and filling it in by hand is the way through.
      setError(cause instanceof BarcodeUnknown?cause.message:'Barcode lookup is unavailable. Enter the package values manually.');
      setEditing(true);}}
    finally{if(alive.current)setBusy(false);locked.current=false;}
  };
  const readLabel=async(uri:string)=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError(null);scan.begin();
    try{
      scan.reach(.4);
      const reading=await recognizeLabel(uri);if(!alive.current)return;
      scan.done();
      if(!Object.keys(reading.macros).length){setEditing(true);setError('No nutrition panel was readable in that photo. Fill the frame with the label, or enter it by hand.');return;}
      setReference({grams:ozToGrams(1),macros:reading.macros as MacroTotals});
      setName('Packaged food');setPortion('1');
      setValues({caloriesKcal:String(reading.macros.caloriesKcal??''),proteinG:String(reading.macros.proteinG??''),
        fatG:String(reading.macros.fatG??''),carbsG:String(reading.macros.carbsG??'')});
      setNotice(`Read from the label${reading.servingLabel?` · per ${reading.servingLabel}`:''}. Check every value before logging.`);
      setEditing(true);
      const missing=missingMacros(reading);
      if(missing.length)setError(`The ${missing.join(' and ')} line could not be read. Fill it in from the package.`);
    }catch(cause){if(alive.current){scan.reset();setEditing(true);
      setError(cause instanceof LabelUnavailable?cause.message:'That label could not be read. Try again, or enter it by hand.');}}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  };
  // Angles accumulate; nothing is sent until the user says they have enough.
  const capture=(base64:string)=>{setError(null);setAngles(list=>list.length>=MAX_ANGLES?list:[...list,base64]);};
  const estimate=async(note?:string)=>{
    if(locked.current||!angles.length)return;locked.current=true;setBusy(true);setError(null);
    try{
      const result=await vision.analyze(angles.map(base64=>({base64,mimeType:'image/jpeg' as const})),note);
      if(!alive.current)return;
      if(result)setEditing(true);
      else{setEditing(true);setError(visionMessage(vision.error?.code));}
    }catch{if(alive.current)setError('That meal could not be estimated. Try again or enter it manually.');}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  };
  // A meal in words takes the same route as a photographed one: the model extracts the foods,
  // the bundled USDA data supplies the numbers, and the same editable rows come back.
  const describe=async()=>{
    if(locked.current||!described.trim())return;locked.current=true;setBusy(true);setError(null);
    try{
      const result=await vision.describe(described.trim());
      if(!alive.current)return;
      setEditing(true);
      if(!result)setError(visionMessage(vision.error?.code));
    }catch{if(alive.current)setError('That meal could not be read. Try again, or log it by hand.');}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  };
  const logItems=(items:RecognizedItem[])=>{
    if(locked.current)return;
    // Each recognised food becomes its own diary row, so a wrong one can be removed on its own.
    for(const item of items)nutritionStore.getState().addEntry({name:item.name,servings:1,
      servingLabel:`${Math.round(item.grams)} g`,referenceMacros:item.macros,
      referenceMicros:item.source==='usda'?item.micros:undefined,source:'photo'});
    const total=Math.round(items.reduce((sum,item)=>sum+item.macros.caloriesKcal,0));
    confirmToast(`${items.length} ${items.length===1?'food':'foods'} added · ${total} kcal`);
    locked.current=true;onClose();
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
        confirmToast(`${name.trim()||'Quick add'} added · ${Math.round(Number(values.caloriesKcal))} kcal`);
        locked.current=true;onClose();return;
      }
      if(!name.trim()||!portion.trim()||!Number.isFinite(Number(portion))||Number(portion)<=0||Number(portion)>352)throw new Error('Enter a food name and portion greater than 0 oz (up to 352 oz).');
      if(macroFields.some(([key])=>!values[key].trim()||!Number.isFinite(Number(values[key]))||Number(values[key])<0||Number(values[key])>20000))throw new Error('Complete all four macro values; unknown values are not zero.');
      // The macro fields describe the whole portion entered, so that portion is one serving.
      nutritionStore.getState().addEntry({name:name.trim(),servings:1,servingLabel:`${Number(portion)} oz`,
        referenceMacros:Object.fromEntries(macroFields.map(([k])=>[k,Number(values[k])])) as unknown as MacroTotals,
        source:action==='photo'?'photo':action==='barcode'?'barcode':'manual'});
      confirmToast(`${name.trim()} added · ${Math.round(Number(values.caloriesKcal))} kcal`);
    }locked.current=true;onClose();}catch(e){setError((e as Error).message);}
  };
  // One Modal for the life of this screen. presentationStyle cannot be changed on a modal
  // that is already presented, and swapping between two of them races iOS's dismissal.
  const scanner=action==='photo'||action==='barcode'||action==='label';
  const progressValue=action==='photo'||action==='describe'?vision.progress:scan.value;
  const progressLabel=action==='barcode'?'Looking up that barcode…':action==='label'?'Reading that label…'
    :action==='describe'?'Working out what that was…':'Working out what is on the plate…';
  // The scan happens while the camera is still on screen, so the ring has to live over it.
  // Rendering it only in the body below meant it was never once visible for a camera scan:
  // this branch returns first, and by the time it stops returning the work has finished.
  if(scanner&&!editing)return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
    <View style={{flex:1}}>
      <CameraScanner mode={action==='photo'?'photo':action==='label'?'label':'barcode'} busy={busy} notice={error}
        angles={angles.length} maxAngles={action==='photo'?MAX_ANGLES:1} onDone={()=>{void estimate();}}
        onBarcode={code=>{void lookUp(code);}} onCapture={base64=>{capture(base64);}} onCaptureUri={uri=>{void readLabel(uri);}}
        onManual={()=>{setError(null);setAngles([]);setEditing(true);}} onClose={onClose} />
      {busy&&<View accessibilityViewIsModal style={{position:'absolute',top:0,right:0,bottom:0,left:0,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(0,0,0,.6)'}}>
        <ScanProgress value={progressValue} label={progressLabel} onDark />
      </View>}
    </View>
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
      <Action label={busy?'Looking up…':'Look up this barcode'} disabled={busy||!code.trim()} onPress={()=>{void lookUp(code.trim());}} />
      <Action secondary label="Back to the scanner" disabled={busy} onPress={()=>{setError(null);setEditing(false);}} />
    </>}
    {action==='weight'&&<Text className="mb-4">A photo alongside the number is what actually shows change — the scale moves with water and food. Photos stay on this device and are never uploaded.</Text>}
    {(action==='photo'||action==='describe')&&vision.result&&<MealReview items={vision.result.items} note={vision.result.note} busy={busy}
      onChange={vision.setItems}
      onRefine={description=>{void (action==='describe'?vision.describe(description):estimate(description));}}
      onConfirm={()=>logItems(vision.result!.items)} onCancel={onClose} />}
    {busy&&<ScanProgress value={progressValue} label={progressLabel} />}
    {action==='describe'&&!vision.result&&<>
      <Text className="mb-4">Write it the way you would say it — portions, how it was cooked, anything a photo would not show. Each food comes back as its own row for you to check.</Text>
      <Field label="What did you eat?" value={described} onChangeText={setDescribed} multiline maxLength={500}
        placeholder="a bowl of oatmeal with a scoop of whey and a banana" />
      <Action label={busy?'Reading…':'Work out the macros'} disabled={busy||!described.trim()} onPress={()=>{void describe();}} />
    </>}
    {!((action==='photo'||action==='describe')&&vision.result)&&action!=='describe'&&editing&&(action==='quick'?<>
      <Text className="mb-4">For when you know roughly what it cost you but not the breakdown. Leave a macro blank and it is recorded as zero for this entry.</Text>
      <Field label="Food name" value={name} onChangeText={setName} maxLength={150} placeholder="Quick add" />
      {macroFields.map(([key,label])=><Field key={key} label={key==='caloriesKcal'?label:`${label} · optional`} value={values[key]} onChangeText={text=>setValues(s=>({...s,[key]:text}))} keyboardType="decimal-pad" />)}
    </>:action==='weight'?<><Text className="mb-4">Saved to today's diary and queued for cloud sync.</Text><Field label={`Body weight · ${weightUnit(units)}`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /></>:<>
      {!!notice&&<Text className="mb-4">{notice}</Text>}<Field label="Food name" value={name} onChangeText={setName} maxLength={150}/><Field label="Portion · oz" value={portion} onChangeText={changePortion} keyboardType="decimal-pad" />
      <Text className="mb-3">Macros for the entire portion above. Changing a manual macro keeps your edited value until you change the portion again.</Text>{macroFields.map(([key,label])=><Field key={key} label={label} value={values[key]} onChangeText={text=>setValues(s=>({...s,[key]:text}))} keyboardType="decimal-pad" />)}
    </>)}
    {error&&<Text accessibilityRole="alert" className="mb-4">{error}</Text>}
    {!((action==='photo'||action==='describe')&&vision.result)&&<>
      {editing&&action!=='describe'&&<Action label={action==='weight'?'Save body weight':action==='quick'?'Add calories':'Confirm food log'} disabled={busy} onPress={save} />}
      <Action secondary label="Close quick log" onPress={onClose}/>
    </>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>;
}
