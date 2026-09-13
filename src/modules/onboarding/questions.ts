import { birthDateProblem } from './birthDate';
import type { OnboardingProfile } from '../../types/profile';
import { heightInches } from '../../lib/units';
import { defaultSurvey, RATE_CHOICES, type LifestyleSurvey } from './budget';

export type Draft = OnboardingProfile;
export interface QuizOption { value: string | number | boolean; label: string; description?: string }
export interface QuizQuestion {
  id: string;
  prompt: string;
  helper?: string;
  kind: 'choice' | 'number' | 'height' | 'weekdays' | 'text';
  options?: QuizOption[];
  /** Hidden questions are skipped entirely and never counted in the progress total. */
  applies?: (draft: Draft) => boolean;
  read: (draft: Draft) => unknown;
  write: (draft: Draft, value: never) => Partial<Draft>;
  /** Returns a message when the current answer cannot be accepted. */
  problem?: (draft: Draft) => string | null;
  /** Optional questions may be advanced past without an answer. */
  optional?: boolean;
  unit?: string;
  placeholder?: string;
}

const survey = (draft: Draft): LifestyleSurvey => ({ ...defaultSurvey, ...(draft.lifestyle_survey ?? {}) });
const patchSurvey = (draft: Draft, patch: Partial<LifestyleSurvey>): Partial<Draft> => ({ lifestyle_survey: { ...survey(draft), ...patch } });
const wantsRate = (draft: Draft) => ['lose', 'gain'].includes(survey(draft).goalDirection ?? 'auto');
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

export const QUESTIONS: QuizQuestion[] = [
  {
    id: 'track', kind: 'choice',
    prompt: 'How closely do you want to track?',
    helper: 'You can change this later — neither option locks you in.',
    options: [
      { value: false, label: 'Keep it simple', description: 'One daily calorie and macro target. Log food, see where you stand.' },
      { value: true, label: 'Train seriously', description: 'Separate rest and training day targets, pre-workout carb timing, and a training split.' },
    ],
    read: draft => draft.is_advanced_track,
    write: (_draft, value: boolean) => ({ is_advanced_track: value }),
  },
  {
    id: 'goal', kind: 'choice',
    prompt: 'What do you want your weight to do?',
    helper: 'This sets the direction. The exact numbers come from your answers.',
    options: [
      { value: 'lose', label: 'Lose fat', description: 'Eat below what you burn, with protein kept high to hold onto muscle.' },
      { value: 'maintain', label: 'Stay where I am', description: 'Eat at maintenance and keep your habits steady.' },
      { value: 'gain', label: 'Build muscle', description: 'A controlled surplus, paired with training.' },
      { value: 'recomp', label: 'Recomp — leaner at the same weight', description: 'Maintenance calories, higher protein, gradual change. Slower, but the scale stays put.' },
      { value: 'auto', label: 'I am not sure — suggest one', description: 'We will infer a gentle direction from your build, energy and priorities.' },
    ],
    read: draft => survey(draft).goalDirection ?? 'auto',
    write: (draft, value: LifestyleSurvey['goalDirection']) => patchSurvey(draft, { goalDirection: value }),
  },
  {
    id: 'rate', kind: 'choice', applies: wantsRate,
    prompt: 'How quickly?',
    helper: 'Faster is not better. Above about 1% of your body weight per week, more of the loss comes from muscle.',
    options: [
      { value: RATE_CHOICES[0], label: 'Gently · 0.5 lb a week', description: 'Easiest to sustain and least disruptive to training.' },
      { value: RATE_CHOICES[1], label: 'Steady · 1 lb a week', description: 'The usual choice. Noticeable progress without feeling punishing.' },
      { value: RATE_CHOICES[2], label: 'Quickly · 1.5 lb a week', description: 'Demanding. Expect hunger and lower energy in training.' },
      { value: RATE_CHOICES[3], label: 'Aggressively · 2 lb a week', description: 'Only sensible at higher body weights, and we will reduce it if it is unsafe for you.' },
    ],
    read: draft => survey(draft).rateLbsPerWeek ?? 1,
    write: (draft, value: number) => patchSurvey(draft, { rateLbsPerWeek: value }),
  },
  {
    id: 'goalWeight', kind: 'number', applies: wantsRate, optional: true, unit: 'lbs',
    prompt: 'Do you have a goal weight in mind?',
    helper: 'Optional. If you give one, we will estimate how long it should take.',
    read: draft => survey(draft).goalWeightLbs ?? null,
    write: (draft, value: number | null) => patchSurvey(draft, { goalWeightLbs: value }),
    problem: draft => { const value = survey(draft).goalWeightLbs; return value == null || (value >= 70 && value <= 700) ? null : 'Enter a goal weight between 70 and 700 lbs.'; },
  },
  {
    id: 'sex', kind: 'choice',
    prompt: 'Which metabolic reference should we use?',
    helper: 'The Mifflin–St Jeor equation uses this. It is a physiological input, not a question about gender identity.',
    options: [
      { value: 'female', label: 'Female reference' },
      { value: 'male', label: 'Male reference' },
      { value: 'unspecified', label: 'Prefer not to say', description: 'We use a midpoint, which widens the margin of error until your real data refines it.' },
    ],
    read: draft => survey(draft).metabolicSex,
    write: (draft, value: LifestyleSurvey['metabolicSex']) => patchSurvey(draft, { metabolicSex: value }),
  },
  {
    id: 'birthDate', kind: 'text',
    prompt: 'When were you born?',
    helper: 'Energy needs fall gradually with age. A date stays right as time passes, where a typed age is wrong within the year.',
    placeholder: 'YYYY-MM-DD',
    read: draft => survey(draft).birthDate ?? '',
    write: (draft, value: string) => patchSurvey(draft, { birthDate: value.trim() || null }),
    problem: draft => { const value = survey(draft).birthDate; return value ? birthDateProblem(value) : 'Enter a date of birth as YYYY-MM-DD.'; },
  },
  {
    id: 'height', kind: 'height',
    prompt: 'How tall are you?',
    read: draft => draft.height_inches,
    write: (_draft, value: { feet: number; inches: number }) => ({ height_inches: heightInches(value.feet, value.inches) }),
    problem: draft => Number.isFinite(draft.height_inches) && draft.height_inches! >= 48 && draft.height_inches! <= 90 ? null : 'Enter a height between 4 ft and 7 ft 6 in.',
  },
  {
    id: 'weight', kind: 'number', unit: 'lbs',
    prompt: 'What do you weigh right now?',
    helper: 'A rough figure is fine. CalCamp tracks the trend, not any single morning.',
    read: draft => draft.weight_lbs,
    write: (_draft, value: number | null) => ({ weight_lbs: value }),
    problem: draft => Number.isFinite(draft.weight_lbs) && draft.weight_lbs! >= 70 && draft.weight_lbs! <= 700 ? null : 'Enter a weight between 70 and 700 lbs.',
  },
  {
    id: 'activity', kind: 'choice',
    prompt: 'Outside of training, how active is your day?',
    helper: 'Think about work and getting around, not your workouts — those come next.',
    options: [
      { value: 'sedentary', label: 'Mostly seated', description: 'Desk work, driving, little walking.' },
      { value: 'light', label: 'Some walking', description: 'On your feet now and then; a walkable commute.' },
      { value: 'moderate', label: 'On my feet a lot', description: 'Teaching, retail, hospitality, campus walking all day.' },
      { value: 'high', label: 'Physically demanding', description: 'Trades, warehouse, nursing — moving or lifting most of the day.' },
    ],
    read: draft => draft.activity_level,
    write: (_draft, value: Draft['activity_level']) => ({ activity_level: value }),
  },
  {
    id: 'trainingDays', kind: 'choice',
    prompt: 'How many days a week do you train?',
    options: [
      { value: 0, label: 'Not currently' },
      { value: 2, label: '1–2 days' },
      { value: 3, label: '3–4 days' },
      { value: 5, label: '5–6 days' },
      { value: 7, label: 'Every day' },
    ],
    read: draft => survey(draft).trainingDaysPerWeek ?? 3,
    write: (draft, value: number) => patchSurvey(draft, { trainingDaysPerWeek: value }),
  },
  {
    id: 'diet', kind: 'choice',
    prompt: 'How do you prefer to eat?',
    helper: 'This changes how your calories are split, never how many you get.',
    options: [
      { value: 'balanced', label: 'No strong preference', description: 'An even split that suits most people.' },
      { value: 'high_protein', label: 'Higher protein', description: 'Best when you are training hard or cutting.' },
      { value: 'lower_carb', label: 'Lower carb', description: 'More calories from fat. Some people find it more filling.' },
      { value: 'higher_carb', label: 'Higher carb', description: 'Suits endurance work and high training volume.' },
      { value: 'plant_forward', label: 'Plant-forward', description: 'Mostly plants; protein targets stay realistic for that.' },
    ],
    read: draft => survey(draft).dietStyle ?? 'balanced',
    write: (draft, value: LifestyleSurvey['dietStyle']) => patchSurvey(draft, { dietStyle: value }),
  },
  {
    id: 'recovery', kind: 'choice',
    prompt: 'How is your energy and recovery lately?',
    helper: 'This is a safety question. We will not put you in a deficit while you are running on empty.',
    options: [
      { value: 'steady', label: 'Generally rested', description: 'Sleeping reasonably and recovering between sessions.' },
      { value: 'tired', label: 'Often tired or under-fuelled', description: 'Your plan will start at maintenance until this settles.' },
    ],
    read: draft => survey(draft).recovery,
    write: (draft, value: LifestyleSurvey['recovery']) => patchSurvey(draft, { recovery: value }),
  },
  {
    id: 'composition', kind: 'choice',
    prompt: 'How would you describe your build?',
    helper: 'A rough self-description. It nudges the estimate; nothing here is a judgement.',
    options: [
      { value: 'unsure', label: 'Not sure' },
      { value: 'lean', label: 'Lean' },
      { value: 'balanced', label: 'Somewhere in the middle' },
      { value: 'higher', label: 'Carrying more body fat' },
    ],
    read: draft => survey(draft).composition,
    write: (draft, value: LifestyleSurvey['composition']) => patchSurvey(draft, { composition: value }),
  },
  {
    id: 'priority', kind: 'choice',
    prompt: 'What would make daily life better?',
    options: [
      { value: 'energy', label: 'Steadier energy' },
      { value: 'strength', label: 'Feeling stronger' },
      { value: 'mobility', label: 'Moving more comfortably' },
    ],
    read: draft => survey(draft).priority,
    write: (draft, value: LifestyleSurvey['priority']) => patchSurvey(draft, { priority: value }),
  },
  {
    id: 'medical', kind: 'choice',
    prompt: 'Does any of this apply to you right now?',
    helper: 'Automatic calorie targets are not appropriate in these situations.',
    options: [
      { value: false, label: 'None of these' },
      { value: true, label: 'Pregnant, breastfeeding, or following clinician-managed nutrition', description: 'You can still track everything — we just will not generate a calorie target.' },
    ],
    read: draft => survey(draft).specializedNutrition,
    write: (draft, value: boolean) => patchSurvey(draft, { specializedNutrition: value }),
  },
  {
    id: 'split', kind: 'weekdays', applies: draft => draft.is_advanced_track,
    prompt: 'Which four days will you train?',
    helper: 'Rest and training days get different targets, keeping the weekly total the same.',
    read: draft => draft.training_days,
    write: (_draft, value: number[]) => ({ training_days: value }),
    problem: draft => draft.training_days.length === 4 ? null : `Choose exactly four days — you have ${draft.training_days.length}.`,
  },
  {
    id: 'preworkout', kind: 'choice', applies: draft => draft.is_advanced_track,
    prompt: 'Reserve fast-digesting carbs before training?',
    helper: 'Carves a portion of your training-day carbs into the hour before you lift.',
    options: [
      { value: false, label: 'No, keep it simple' },
      { value: true, label: 'Yes, reserve some', description: 'Around 30 g about an hour beforehand. You can tune it afterwards.' },
    ],
    read: draft => draft.preworkout_fast_carbs,
    write: (_draft, value: boolean) => ({ preworkout_fast_carbs: value, preworkout_carbs_g: value ? 30 : 0 }),
  },
];

export function visibleQuestions(draft: Draft) {
  return QUESTIONS.filter(question => question.applies?.(draft) ?? true);
}
/** The next visible index after `index`, or null when the quiz is finished. */
export function nextIndex(draft: Draft, index: number) {
  const visible = visibleQuestions(draft);
  return index + 1 < visible.length ? index + 1 : null;
}
export function answered(question: QuizQuestion, draft: Draft) {
  if (question.problem) return question.problem(draft) === null;
  const value = question.read(draft);
  if (question.optional) return true;
  return value !== null && value !== undefined && value !== '';
}
