import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { kgToLbs,lbsToKg,heightInches,gramsToOz,ozToGrams } from '../../lib/units';
import { migrateImperialSnapshot } from '../sync/imperialMigration';
import { SyncEngine } from '../sync/engine';
import { memoryStorage } from '../sync/storage';
import { createTrackingRepository } from '../../api/trackingRepository';
import { startingBudget,defaultSurvey,dayCalories,countTrainingDays } from '../onboarding/budget';
import { validateOnboarding } from '../../types/profile';
import { useOnboardingStore } from '../../store/onboardingStore';
import { EXERCISE_CATALOG } from '../workout/catalog';
import { validateRoutine } from '../workout/routines';
import { parseBarcodeFood } from '../quickActions/barcode';
import { servingLabel } from '../dining/serving';

test('Imperial snapshot migration converts old drafts and pending workouts once while preserving retry payloads', async()=>{
  const s={weightKg:50,estimatedOneRepMaxKg:60};
  const old={version:1,days:{today:{bodyWeightKg:80}},workout:{sets:[{...s}],pendingWorkouts:[{workout:{sets:[{...s}]}}]},queue:[{id:'retry',kind:'nutrition',data:{patch:{bodyWeightKg:80.123,isAdherent:true}}},{kind:'workout',data:{sets:[{...s}]}}],health:{exported:['keep']},workoutReceipts:['keep-workout']};
  const value=migrateImperialSnapshot(structuredClone(old)) as any;
  assert.equal(value.version,2);assert.equal(value.days.today.bodyWeightLbs,kgToLbs(80));assert.equal(value.workout.sets[0].weightLbs,kgToLbs(50));
  assert.equal(value.queue[1].data.sets[0].estimatedOneRepMaxLbs,kgToLbs(60));
  assert.deepEqual(value.queue[0].data.legacyMetricPatch,{bodyWeightKg:80.123,isAdherent:true});
  assert.deepEqual(migrateImperialSnapshot(structuredClone(value)),value);assert.deepEqual(value.health.exported,['keep']);assert.deepEqual(value.workoutReceipts,['keep-workout']);
  assert.equal(old.workout.sets[0].weightKg,50);
  assert.ok(Math.abs(lbsToKg(kgToLbs(80))-80)<1e-10);assert.equal(heightInches(5,11),71);assert.throws(()=>heightInches(5,12));assert.ok(Math.abs(ozToGrams(gramsToOz(100))-100)<1e-10);
});
test('Supabase nutrition boundary sends legacy retry patches byte-for-byte and new pounds as kilograms', async()=>{
  const patches:unknown[]=[];
  const client=createClient('https://test.supabase.co','key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(_input,init)=>{
    patches.push(JSON.parse(String(init?.body)).p_patch);
    return Response.json({user_id:'alice',log_date:'2026-09-10',calories_kcal:0,protein_g:0,carbs_g:0,fat_g:0,micronutrients:{},is_adherent:false,body_weight_kg:80});
  }}});
  client.auth.getUser=async()=>({data:{user:{id:'alice'}},error:null}) as any;
  const repo=createTrackingRepository(client);const m={date:'2026-09-10',macros:{caloriesKcal:0,proteinG:0,carbsG:0,fatG:0},micros:{},patch:{bodyWeightLbs:180}};
  const result=await repo.applyNutritionMutation!('alice','new',m);assert.deepEqual(patches[0],{bodyWeightKg:lbsToKg(180)});assert.equal(result.bodyWeightLbs,kgToLbs(80));
  await repo.applyNutritionMutation!('alice','old',{...m,legacyMetricPatch:{bodyWeightKg:80.123}});assert.deepEqual(patches[1],{bodyWeightKg:80.123});
});
test('onboarding budgets preserve weekly energy and do not infer deficits for uncertain or fatigued answers',()=>{
  const base={...useOnboardingStore.getState().draft,height_inches:71,weight_lbs:180,activity_level:'moderate' as const,lifestyle_survey:{...defaultSurvey,age:21,metabolicSex:'male' as const}};
  const casual=startingBudget(base);assert.equal(casual.direction,'steady');
  const advanced=startingBudget({...base,is_advanced_track:true});assert.equal((advanced.rest.caloriesKcal*3+advanced.training.caloriesKcal*4)/7,casual.rest.caloriesKcal);
  for(const macros of [advanced.rest,advanced.training])assert.equal(macros.proteinG*4+macros.carbsG*4+macros.fatG*9,macros.caloriesKcal);
  const reduction=startingBudget({...base,lifestyle_survey:{...base.lifestyle_survey,composition:'higher',priority:'mobility'}});assert.ok(reduction.weeklyChangeLbs<0&&reduction.weeklyChangeLbs>=-.5);
  assert.equal(startingBudget({...base,lifestyle_survey:{...base.lifestyle_survey,composition:'higher',priority:'mobility',recovery:'tired'}}).weeklyChangeLbs,0);
  assert.throws(()=>startingBudget({...base,lifestyle_survey:{...base.lifestyle_survey,age:17}}));assert.throws(()=>startingBudget({...base,lifestyle_survey:{...base.lifestyle_survey,specializedNutrition:true}}));
});
test('a training schedule of any length spends the same week without gutting a rest day',()=>{
  const base={...useOnboardingStore.getState().draft,height_inches:71,weight_lbs:180,activity_level:'moderate' as const,is_advanced_track:true,lifestyle_survey:{...defaultSurvey,age:21,metabolicSex:'male' as const}};
  const average=startingBudget({...base,is_advanced_track:false}).rest.caloriesKcal;
  for(const days of [[3],[2,5],[1,3,5],[1,2,4,5],[1,2,3,5,6],[0,1,2,3,5,6]]){
    const b=startingBudget({...base,training_days:days});
    assert.equal(b.trainingDayCount,days.length,String(days));
    assert.ok(Math.abs(b.training.caloriesKcal*days.length+b.rest.caloriesKcal*(7-days.length)-average*7)<=3,String(days));
    assert.ok(b.training.caloriesKcal>b.rest.caloriesKcal&&b.rest.caloriesKcal>=average*.9-1,String(days));
    for(const macros of [b.rest,b.training])assert.equal(macros.proteinG*4+macros.carbsG*4+macros.fatG*9,macros.caloriesKcal,String(days));
  }
  // Training every day leaves no rest day to shift energy onto, so both figures hold at the average.
  const everyDay=startingBudget({...base,training_days:[0,1,2,3,4,5,6]});
  assert.equal(everyDay.training.caloriesKcal,average);assert.equal(everyDay.rest.caloriesKcal,average);
  assert.deepEqual(dayCalories(2400,0),{trainingCalories:2400,restCalories:2400});
  assert.equal(countTrainingDays([1,1,4,9,-1,null as unknown as number]),2);
  for(const days of [[3],[1,2,4,5],[0,1,2,3,4,5,6]])validateOnboarding({...base,training_days:days});
  for(const days of [[],[1,1],[7],[-1]])assert.throws(()=>validateOnboarding({...base,training_days:days}),String(days));
});
test('all 101 presets have distinct IDs and motion help; routine creation survives offline restart',async()=>{
  assert.equal(EXERCISE_CATALOG.length,232);assert.equal(new Set(EXERCISE_CATALOG.map(e=>e.id)).size,232);
  assert.equal(new Set(EXERCISE_CATALOG.map(e=>e.name.toLowerCase())).size,232);
  for(const e of EXERCISE_CATALOG){assert.ok(e.description.length>60,e.name);assert.ok(e.primaryMuscle.length>2,e.name);}
  const routine={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'My Tuesday',exerciseIds:EXERCISE_CATALOG.slice(0,4).map(e=>e.id)};
  validateRoutine(routine);assert.throws(()=>validateRoutine({...routine,exerciseIds:[routine.exerciseIds[0],routine.exerciseIds[0]]}));
  const storage=memoryStorage();let sends=0;const first=new SyncEngine(storage,async()=>{sends++;});first.activate('alice');first.setOnline(false);first.queue({kind:'routine',data:routine},'routine:id',{routines:[routine]});
  const next=new SyncEngine(storage,async()=>{sends++;});next.activate('alice');assert.deepEqual(next.data.routines,[routine]);assert.equal(sends,0);await next.drain();assert.equal(sends,1);assert.equal(next.data.queue.length,0);next.activate('bob');assert.equal(next.data.routines,undefined);
});
test('barcode normalization rejects unknown macros and displays Imperial food portions',()=>{
  assert.throws(()=>parseBarcodeFood({itemName:'Food',servings:[]}));
  const food=parseBarcodeFood({itemName:'Food',brandName:'Brand',defaultServingId:'2',servings:[
    {servingId:'1',description:'100 g',metricAmount:100,metricUnit:'g',isDefault:false,macros:{caloriesKcal:100,proteinG:3,carbsG:20,fatG:1}},
    {servingId:'2',description:'1 bar',metricAmount:45,metricUnit:'g',isDefault:true,macros:{caloriesKcal:190,proteinG:5,carbsG:24,fatG:8}}]});
  assert.equal(food.servings.length,2);assert.equal(food.selected,1,'the serving the package leads with');
  assert.equal(food.servings[food.selected].macros.proteinG,5);
  assert.equal(servingLabel({amount:100,unit:'g',label:'100 g'}),'3.53 oz');assert.equal(servingLabel({amount:1,unit:'cup',label:'1 cup'}),'1 cup');
});

test('the survey asks which days you train rather than assuming four of them', async () => {
  const { useOnboardingStore } = await import('../../store/onboardingStore');
  const { visibleQuestions, answered } = await import('../onboarding/questions');
  useOnboardingStore.getState().reset();

  assert.deepEqual(useOnboardingStore.getState().draft.training_days, [],
    'no day is pre-selected, so nobody inherits a schedule they never chose');

  // And the question cannot be skipped past: an empty split is not an answer.
  useOnboardingStore.getState().patch({ is_advanced_track: true });
  const draft = useOnboardingStore.getState().draft;
  const split = visibleQuestions(draft).find(question => question.id === 'split')!;
  assert.ok(split, 'the split question is asked on the advanced track');
  assert.equal(answered(split, draft), false);
  assert.match(split.problem!(draft) ?? '', /at least one training day/);

  const picked = { ...draft, ...split.write(draft, [1, 4] as never) };
  assert.deepEqual(picked.training_days, [1, 4]);
  assert.equal(answered(split, picked), true);
  assert.equal(split.problem!(picked), null);

  // Keeping it simple skips the question entirely; an empty split is right there.
  const simple = { ...draft, is_advanced_track: false };
  assert.equal(visibleQuestions(simple).some(question => question.id === 'split'), false);
});
