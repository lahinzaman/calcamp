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
export function nutrientStatuses(consumed: Partial<Record<NutrientKey, number>>,
  values: Partial<Record<NutrientKey, DailyValue>> = DAILY_VALUES) {
  const tracked: NutrientStatus[] = [];
  const unreported: NutrientStatus[] = [];
  for (const [key, value] of Object.entries(values) as [NutrientKey, DailyValue][]) {
    const amount = consumed[key];
    const status: NutrientStatus = { key, label: value.label, why: value.why, amount: amount ?? 0, target: value.amount,
      ratio: value.amount ? (amount ?? 0) / value.amount : 0, kind: value.kind, group: value.group, unit: NUTRIENT_UNITS[key] };
    (amount === undefined ? unreported : tracked).push(status);
  }
  return { tracked, unreported };
}

export type MetabolicSex = 'female' | 'male' | 'unspecified';
export interface NutrientReference { sex: MetabolicSex; age: number | null }

/**
 * Institute of Medicine Dietary Reference Intakes, which differ by sex and age where the
 * FDA's single label Daily Value does not. A woman reading this panel was being held to a
 * man's vitamin A, choline, manganese and potassium; she was also being shown a magnesium
 * target 100 mg above her own.
 *
 * Values are RDA where one exists and Adequate Intake otherwise. Sodium stays the FDA limit.
 * With no sex on file the FDA Daily Values above are used unchanged, because guessing a sex
 * from nothing is worse than a general reference.
 */
const DRI: Partial<Record<NutrientKey, { male: number; female: number; olderMale?: number; olderFemale?: number }>> = {
  vitamin_a_mcg_rae: { male: 900, female: 700 },
  vitamin_c_mg: { male: 90, female: 75 },
  vitamin_k_mcg: { male: 120, female: 90 },
  thiamin_b1_mg: { male: 1.2, female: 1.1 },
  riboflavin_b2_mg: { male: 1.3, female: 1.1 },
  niacin_b3_mg: { male: 16, female: 14 },
  vitamin_b6_mg: { male: 1.3, female: 1.3, olderMale: 1.7, olderFemale: 1.5 },
  choline_mg: { male: 550, female: 425 },
  calcium_mg: { male: 1000, female: 1000, olderMale: 1000, olderFemale: 1200 },
  iron_mg: { male: 8, female: 18, olderMale: 8, olderFemale: 8 },
  magnesium_mg: { male: 400, female: 310, olderMale: 420, olderFemale: 320 },
  zinc_mg: { male: 11, female: 8 },
  manganese_mg: { male: 2.3, female: 1.8 },
  chromium_mcg: { male: 35, female: 25, olderMale: 30, olderFemale: 20 },
  potassium_mg: { male: 3400, female: 2600 },
  fluoride_mg: { male: 4, female: 3 },
  water_g: { male: 3700, female: 2700 },
};
/** The DRI tables change band at 31 for magnesium and at 51 for the rest; 31 is the earlier. */
const OLDER_FROM = 31;

export function personalDailyValues(reference: NutrientReference): Partial<Record<NutrientKey, DailyValue>> {
  if (reference.sex === 'unspecified') return DAILY_VALUES;
  const older = reference.age !== null && reference.age >= OLDER_FROM;
  const adjusted: Partial<Record<NutrientKey, DailyValue>> = { ...DAILY_VALUES };
  for (const [key, band] of Object.entries(DRI) as [NutrientKey, (typeof DRI)[NutrientKey]][]) {
    const base = adjusted[key];
    if (!base || !band) continue;
    const amount = reference.sex === 'male'
      ? (older && band.olderMale !== undefined ? band.olderMale : band.male)
      : (older && band.olderFemale !== undefined ? band.olderFemale : band.female);
    adjusted[key] = { ...base, amount };
  }
  return adjusted;
}
