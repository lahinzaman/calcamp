import { NUTRIENT_UNITS, type NutrientKey } from '../../types/nutrition';
export type NutrientGroup = 'macro' | 'vitamin' | 'mineral' | 'other';
/** FDA Daily Values for adults and children 4+ (2016 labeling rule), except where noted.
 *  `kind: 'limit'` means stay under; `'goal'` means reach it. General reference, not medical advice.
 *  `why` is one plain sentence on what the nutrient does, so the list reads as something more
 *  than a wall of percentages. */
export interface DailyValue { amount: number; kind: 'goal' | 'limit'; group: NutrientGroup; label: string; why: string }
export const DAILY_VALUES: Partial<Record<NutrientKey, DailyValue>> = {
  fiber_g: { amount: 28, kind: 'goal', group: 'macro', label: 'Fibre', why: 'Feeds gut bacteria, slows digestion and keeps you full longer.' },
  added_sugar_g: { amount: 50, kind: 'limit', group: 'macro', label: 'Added sugar', why: 'Sugar put into food rather than naturally present; energy with nothing else attached.' },
  saturated_fat_g: { amount: 20, kind: 'limit', group: 'macro', label: 'Saturated fat', why: 'Raises LDL cholesterol in most people when it makes up a large share of fat intake.' },
  cholesterol_mg: { amount: 300, kind: 'limit', group: 'macro', label: 'Cholesterol', why: 'Dietary cholesterol, which moves blood cholesterol far less than saturated fat does.' },
  sodium_mg: { amount: 2300, kind: 'limit', group: 'mineral', label: 'Sodium', why: 'Balances body fluid, but a consistently high intake pushes blood pressure up.' },
  potassium_mg: { amount: 4700, kind: 'goal', group: 'mineral', label: 'Potassium', why: 'Works against sodium on blood pressure, and carries nerve and muscle signals.' },
  calcium_mg: { amount: 1300, kind: 'goal', group: 'mineral', label: 'Calcium', why: 'Builds bone and teeth, and lets muscles contract.' },
  iron_mg: { amount: 18, kind: 'goal', group: 'mineral', label: 'Iron', why: 'Makes the haemoglobin that carries oxygen around your blood.' },
  magnesium_mg: { amount: 420, kind: 'goal', group: 'mineral', label: 'Magnesium', why: 'Involved in hundreds of enzyme reactions, including nerve and blood sugar control.' },
  phosphorus_mg: { amount: 1250, kind: 'goal', group: 'mineral', label: 'Phosphorus', why: 'Structural in bone and in every cell membrane, and central to energy transfer.' },
  zinc_mg: { amount: 11, kind: 'goal', group: 'mineral', label: 'Zinc', why: 'Immune defence, wound healing and growth.' },
  copper_mg: { amount: 0.9, kind: 'goal', group: 'mineral', label: 'Copper', why: 'Energy production, connective tissue and blood vessel formation.' },
  manganese_mg: { amount: 2.3, kind: 'goal', group: 'mineral', label: 'Manganese', why: 'Helps process carbohydrate, cholesterol and amino acids.' },
  selenium_mcg: { amount: 55, kind: 'goal', group: 'mineral', label: 'Selenium', why: 'Antioxidant defence and thyroid hormone metabolism.' },
  iodine_mcg: { amount: 150, kind: 'goal', group: 'mineral', label: 'Iodine', why: 'The raw material for thyroid hormones, which set your metabolic rate.' },
  chromium_mcg: { amount: 35, kind: 'goal', group: 'mineral', label: 'Chromium', why: 'Supports the action of insulin on blood sugar.' },
  molybdenum_mcg: { amount: 45, kind: 'goal', group: 'mineral', label: 'Molybdenum', why: 'A cofactor for enzymes that break down sulphites and certain amino acids.' },
  fluoride_mg: { amount: 4, kind: 'goal', group: 'mineral', label: 'Fluoride', why: 'Hardens tooth enamel and bone. Adequate Intake, not a labelling Daily Value.' },
  chloride_mg: { amount: 2300, kind: 'goal', group: 'mineral', label: 'Chloride', why: 'Partners sodium in fluid balance, and makes stomach acid.' },
  vitamin_a_mcg_rae: { amount: 900, kind: 'goal', group: 'vitamin', label: 'Vitamin A', why: 'Vision in low light, immune function and the lining of your organs.' },
  vitamin_c_mg: { amount: 90, kind: 'goal', group: 'vitamin', label: 'Vitamin C', why: 'Builds collagen for skin and connective tissue, and helps you absorb iron.' },
  vitamin_d_mcg: { amount: 20, kind: 'goal', group: 'vitamin', label: 'Vitamin D', why: 'Lets you absorb calcium, and supports bone and immune function.' },
  vitamin_e_mg: { amount: 15, kind: 'goal', group: 'vitamin', label: 'Vitamin E', why: 'A fat-soluble antioxidant that protects cell membranes from damage.' },
  vitamin_k_mcg: { amount: 120, kind: 'goal', group: 'vitamin', label: 'Vitamin K', why: 'Required for blood clotting and for binding calcium into bone.' },
  thiamin_b1_mg: { amount: 1.2, kind: 'goal', group: 'vitamin', label: 'Thiamin (B1)', why: 'Turns carbohydrate into usable energy.' },
  riboflavin_b2_mg: { amount: 1.3, kind: 'goal', group: 'vitamin', label: 'Riboflavin (B2)', why: 'Cellular energy production and fat metabolism.' },
  niacin_b3_mg: { amount: 16, kind: 'goal', group: 'vitamin', label: 'Niacin (B3)', why: 'Central to the reactions that release energy from food.' },
  pantothenic_acid_b5_mg: { amount: 5, kind: 'goal', group: 'vitamin', label: 'Pantothenic acid (B5)', why: 'Needed to build and break down fatty acids.' },
  vitamin_b6_mg: { amount: 1.7, kind: 'goal', group: 'vitamin', label: 'Vitamin B6', why: 'Amino acid metabolism, red blood cell formation and brain chemistry.' },
  biotin_b7_mcg: { amount: 30, kind: 'goal', group: 'vitamin', label: 'Biotin (B7)', why: 'Helps metabolise fat, protein and glucose.' },
  folate_b9_mcg_dfe: { amount: 400, kind: 'goal', group: 'vitamin', label: 'Folate (B9)', why: 'Cell division and DNA synthesis; critical before and during pregnancy.' },
  vitamin_b12_mcg: { amount: 2.4, kind: 'goal', group: 'vitamin', label: 'Vitamin B12', why: 'Maintains nerve tissue and red blood cells. Only reliably in animal foods.' },
  choline_mg: { amount: 550, kind: 'goal', group: 'other', label: 'Choline', why: 'Liver function, cell membranes and the neurotransmitter acetylcholine.' },
  caffeine_mg: { amount: 400, kind: 'limit', group: 'other', label: 'Caffeine', why: 'A stimulant; past this much a day, sleep and anxiety usually pay for it.' },
  water_g: { amount: 3700, kind: 'goal', group: 'other', label: 'Water', why: 'Total water from drinks and food. Thirst is a late signal, not an early one.' },
};
export const GROUP_LABELS: Record<NutrientGroup, string> = { macro: 'Fats, fibre & sugar', vitamin: 'Vitamins', mineral: 'Minerals', other: 'Other' };
export interface NutrientStatus { key: NutrientKey; label: string; why: string; amount: number; target: number; ratio: number; kind: 'goal' | 'limit'; group: NutrientGroup; unit: string }
/** Missing nutrients are unreported, not zero, so they are listed separately rather than shown at 0%. */
export function nutrientStatuses(consumed: Partial<Record<NutrientKey, number>>) {
  const tracked: NutrientStatus[] = [];
  const unreported: NutrientStatus[] = [];
  for (const [key, value] of Object.entries(DAILY_VALUES) as [NutrientKey, DailyValue][]) {
    const amount = consumed[key];
    const status: NutrientStatus = { key, label: value.label, why: value.why, amount: amount ?? 0, target: value.amount,
      ratio: value.amount ? (amount ?? 0) / value.amount : 0, kind: value.kind, group: value.group, unit: NUTRIENT_UNITS[key] };
    (amount === undefined ? unreported : tracked).push(status);
  }
  return { tracked, unreported };
}
