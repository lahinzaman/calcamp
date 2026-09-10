import type { MacroTotals } from '../../types/nutrition';
export interface BarcodeFood { name: string; grams: number; macros: MacroTotals; source: string }
export function parseBarcodeProduct(value: unknown): BarcodeFood {
  const data = value as {status?:number;product?:{product_name?:string;nutriments?:Record<string,unknown>}};
  const n = data?.product?.nutriments;
  const read = (key:string) => typeof n?.[key] === 'number' && Number.isFinite(n[key]) && n[key] >= 0 ? n[key] as number : null;
  const caloriesKcal=read('energy-kcal_100g'), proteinG=read('proteins_100g'), carbsG=read('carbohydrates_100g'), fatG=read('fat_100g');
  if (data.status !== 1 || !data.product?.product_name || [caloriesKcal,proteinG,carbsG,fatG].some(v=>v===null)) throw new Error('No complete nutrition label found. Enter the values from the package manually.');
  return { name:data.product.product_name, grams:100, macros:{caloriesKcal:caloriesKcal!,proteinG:proteinG!,carbsG:carbsG!,fatG:fatG!}, source:'Open Food Facts · per 100 g reference; verify your package label' };
}
export async function lookupBarcode(code:string, signal:AbortSignal):Promise<BarcodeFood> {
  if (!/^\d{8,14}$/.test(code)) throw new Error('Scan an EAN or UPC food barcode.');
  const controller=new AbortController(); const cancel=()=>controller.abort(); const timer=setTimeout(cancel,10000);
  signal.addEventListener('abort',cancel,{once:true}); if(signal.aborted)cancel();
  try {
    const response=await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,nutriments`,{signal:controller.signal});
    if(!response.ok)throw new Error('Barcode lookup is unavailable. Enter this food manually.');
    return parseBarcodeProduct(await response.json());
  } finally {clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
