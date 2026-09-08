import type { RescueMeal } from '../../src/types/rescue';
// US standard portions, derived from the restaurant's published ingredient table.
// Expand with sourced local menus or exact Place IDs; unknown restaurant macros never qualify.
const sourceUrl = 'https://www.chipotle.com/content/dam/chipotle/menu/nutrition/US-Nutrition-Facts-Paper-Menu-3-2025.pdf';
const reviewedAt = '2026-09-08';
export const rescueCatalog: { restaurantNames: string[]; meals: RescueMeal[] }[] = [{
  restaurantNames: ['Chipotle Mexican Grill'],
  meals: [
    { id: 'chipotle-chicken-rice', name: 'Chicken + white rice bowl (4 oz each; no other toppings)', macros: { caloriesKcal: 390, proteinG: 36, carbsG: 40, fatG: 11 }, sourceUrl, reviewedAt },
    { id: 'chipotle-chicken-beans', name: 'Chicken + black beans bowl (4 oz each; no other toppings)', macros: { caloriesKcal: 310, proteinG: 40, carbsG: 22, fatG: 8.5 }, sourceUrl, reviewedAt },
    { id: 'chipotle-rice-beans', name: 'White rice + black beans bowl (4 oz each; no other toppings)', macros: { caloriesKcal: 340, proteinG: 12, carbsG: 62, fatG: 5.5 }, sourceUrl, reviewedAt },
  ],
}];
