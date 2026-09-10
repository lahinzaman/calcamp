/** Presentation-only classification; never infer nutrition or allergens from a name. */
export function foodEmoji(name: string): string {
  const value = name.toLowerCase();
  for (const [pattern, emoji] of [
    [/chicken|turkey|poultry/, '🍗'], [/salmon|tuna|fish|shrimp/, '🐟'], [/beef|steak|pork/, '🥩'],
    [/egg|omelet/, '🍳'], [/salad|spinach|broccoli|vegetable/, '🥗'], [/apple|berry|berries|fruit|banana/, '🍓'],
    [/rice|quinoa|grain/, '🍚'], [/pasta|noodle|spaghetti/, '🍝'], [/pizza/, '🍕'], [/bread|bagel|toast|sandwich/, '🥪'],
    [/yogurt|milk|cheese/, '🥛'], [/soup|stew/, '🍲'], [/tofu|bean|lentil/, '🫘'], [/cake|cookie|brownie/, '🍪'],
  ] as const) if (pattern.test(value)) return emoji;
  return '🍽️';
}
