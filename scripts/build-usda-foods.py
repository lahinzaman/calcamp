#!/usr/bin/env python3
"""Rebuilds src/data/usdaFoods.json from the USDA FoodData Central bulk downloads.

Download and unzip these next to each other first — they are not in the repo:
  https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2025-04-24.zip
  https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip

    python3 scripts/build-usda-foods.py <directory holding the unzipped JSON>

USDA FoodData Central is public domain. Re-run when a new release lands.
"""

import json, pathlib, re, sys
SCRATCH = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
OUT = pathlib.Path(__file__).resolve().parent.parent / 'src/data/usdaFoods.json'

# Nutrient numbers → the app's storage keys, read off live API responses earlier.
MICRO = {
 '291':('fiber_g',1), '269':('sugar_g',1), '539':('added_sugar_g',1),
 '606':('saturated_fat_g',1), '645':('monounsaturated_fat_g',1), '646':('polyunsaturated_fat_g',1),
 '605':('trans_fat_g',1), '601':('cholesterol_mg',1),
 '307':('sodium_mg',1), '306':('potassium_mg',1), '301':('calcium_mg',1),
 '303':('iron_mg',1), '304':('magnesium_mg',1), '305':('phosphorus_mg',1),
 '309':('zinc_mg',1), '312':('copper_mg',1), '315':('manganese_mg',1),
 '317':('selenium_mcg',1), '314':('iodine_mcg',1), '318':('chromium_mcg',1), '319':('molybdenum_mcg',1),
 '313':('fluoride_mg',0.001),
 '320':('vitamin_a_mcg_rae',1), '401':('vitamin_c_mg',1), '328':('vitamin_d_mcg',1),
 '323':('vitamin_e_mg',1), '430':('vitamin_k_mcg',1),
 '404':('thiamin_b1_mg',1), '405':('riboflavin_b2_mg',1), '406':('niacin_b3_mg',1),
 '410':('pantothenic_acid_b5_mg',1), '415':('vitamin_b6_mg',1), '416':('biotin_b7_mcg',1),
 '435':('folate_b9_mcg_dfe',1), '418':('vitamin_b12_mcg',1), '421':('choline_mg',1),
 '255':('water_g',1), '262':('caffeine_mg',1), '221':('alcohol_g',1),
}
MACRO = {'208':0, '203':1, '205':2, '204':3}   # kcal, protein, carbs, fat

def number(entry):
    n = entry.get('nutrient') or {}
    return n.get('number')

def amount(entry):
    value = entry.get('amount')
    return value if isinstance(value, (int, float)) and value >= 0 else None

# A household portion beats "100 g" for logging; prefer a whole, named one.
BAD_MODIFIER = re.compile(r'quantity not specified|undetermined', re.I)
def portion(food):
    best = None
    for p in food.get('foodPortions') or []:
        grams = p.get('gramWeight')
        if not isinstance(grams, (int, float)) or grams <= 0 or grams > 2000: continue
        unit = ((p.get('measureUnit') or {}).get('name') or '').strip()
        modifier = (p.get('modifier') or '').strip()
        label = ' '.join(x for x in [modifier if not BAD_MODIFIER.search(modifier) else '',
                                     unit if unit not in ('undetermined', '') else ''] if x).strip()
        if not label: continue
        amount_value = p.get('amount') or p.get('value') or 1
        text = f"{amount_value:g} {label}".strip()
        rank = (0 if p.get('sequenceNumber') in (1, None) else 1, len(text))
        if best is None or rank < best[0]: best = (rank, round(grams, 1), text[:48])
    return (best[1], best[2]) if best else (None, None)

def extract(path, key, type_code):
    data = json.loads(pathlib.Path(path).read_text())
    out = []
    for food in data[key]:
        name = (food.get('description') or '').strip()
        if not name: continue
        macros = [None] * 4
        micros = {}
        for entry in food.get('foodNutrients') or []:
            num = number(entry); value = amount(entry)
            if num is None or value is None: continue
            if num in MACRO:
                if macros[MACRO[num]] is None: macros[MACRO[num]] = value
            elif num in MICRO:
                key_name, factor = MICRO[num]
                if key_name not in micros: micros[key_name] = round(value * factor, 5)
        if any(m is None for m in macros): continue
        grams, label = portion(food)
        out.append({'id': food.get('fdcId'), 'name': name,
                    'category': ((food.get('foodCategory') or {}).get('description') or '').strip(),
                    'type': type_code, 'macros': [round(m, 2) for m in macros], 'micros': micros,
                    'portionGrams': grams, 'portionLabel': label})
    return out

foods = extract(SCRATCH / 'foundation/FoodData_Central_foundation_food_json_2025-04-24.json', 'FoundationFoods', 0)
foods += extract(SCRATCH / 'srlegacy/FoodData_Central_sr_legacy_food_json_2018-04.json', 'SRLegacyFoods', 1)

# A duplicate description would be two identical rows in search; keep the lab-analysed one.
seen = {}
for food in foods:
    existing = seen.get(food['name'].lower())
    if existing is None or food['type'] < existing['type']: seen[food['name'].lower()] = food
foods = sorted(seen.values(), key=lambda f: f['name'].lower())
print(f'{len(foods)} foods after dedupe', file=sys.stderr)

keys = sorted({k for food in foods for k in food['micros']})
index = {k: i for i, k in enumerate(keys)}
rows = [[f['id'], f['name'], f['category'], f['type'], *f['macros'],
         [[index[k], v] for k, v in sorted(f['micros'].items())],
         f['portionGrams'], f['portionLabel']] for f in foods]
payload = {'nutrients': keys, 'foods': rows}
text = json.dumps(payload, separators=(',', ':'), ensure_ascii=False)
OUT.write_text(text + '\n')
print(f'{len(text) / 1_000_000:.2f} MB written', file=sys.stderr)
print(f'{sum(1 for f in foods if f["portionGrams"])} have a household portion', file=sys.stderr)
