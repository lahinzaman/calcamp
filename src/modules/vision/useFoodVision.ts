import { useCallback, useEffect, useRef, useState } from 'react';

import type { MacroTotals } from '../../types/nutrition';
import { resolveItems, type RecognizedItem } from './resolveItems';

export type FoodVisionImage =
  | { base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }
  | { uri: string; mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' };
export type FoodVisionInput = FoodVisionImage;

/** The most angles worth sending: past this the cost rises and the estimate stops improving. */
export const MAX_ANGLES = 4;

export interface FoodVisionEstimate {
  items: RecognizedItem[];
  /** What the model could not settle. Shown as-is; never folded into a row. */
  note: string | null;
}

export type FoodVisionAnalyzer = (images: FoodVisionImage[], note: string | null, signal: AbortSignal) => Promise<unknown>;
export type FoodVisionErrorCode = 'NOT_CONFIGURED' | 'INVALID_IMAGE' | 'REQUEST_FAILED' | 'INVALID_RESPONSE' | 'TIMEOUT';
export class FoodVisionError extends Error {
  constructor(public readonly code: FoodVisionErrorCode, message: string) { super(message); this.name = 'FoodVisionError'; }
}

const macroValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Provider adapters must return whole-portion macros for each item, not per-100g values. */
export function parseVisionEstimate(value: unknown): FoodVisionEstimate {
  const payload = value as { items?: unknown; note?: unknown } | null;
  if (!payload || !Array.isArray(payload.items) || !payload.items.length) {
    throw new FoodVisionError('INVALID_RESPONSE', 'The estimate needs at least one recognised food.');
  }
  const parsed = payload.items.map((entry) => {
    const item = entry as { name?: unknown; grams?: unknown; confidence?: unknown; macros?: Partial<MacroTotals> } | null;
    const macros = item?.macros;
    if (!item || typeof item.name !== 'string' || !item.name.trim()
      || typeof item.grams !== 'number' || !Number.isFinite(item.grams) || item.grams <= 0
      || !macros || !(['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).every(key => macroValue(macros[key]))) {
      throw new FoodVisionError('INVALID_RESPONSE', 'Every food needs a name, a weight and all four macro values.');
    }
    const confidence = typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1 ? item.confidence : 0;
    return { name: item.name.trim(), grams: item.grams, confidence, macros: macros as MacroTotals };
  });
  return { items: resolveItems(parsed), note: typeof payload.note === 'string' && payload.note.trim() ? payload.note.trim() : null };
}

function normalizeImage(input: FoodVisionImage | string): FoodVisionImage {
  let image: FoodVisionImage;
  if (typeof input !== 'string') image = input;
  else if (/^(file|content|blob|https?):/.test(input)) image = { uri: input };
  else {
    const dataUri = /^data:(image\/(?:jpeg|png|webp));base64,(.*)$/s.exec(input);
    image = { base64: dataUri?.[2] ?? input, mimeType: (dataUri?.[1] ?? 'image/jpeg') as 'image/jpeg' };
  }
  if ('base64' in image) {
    if (!image.base64 || image.base64.length > 8_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)
      || image.base64.length % 4 !== 0 || !['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType)) {
      throw new FoodVisionError('INVALID_IMAGE', 'Use a valid JPEG, PNG, or WebP image smaller than 6 MB.');
    }
  } else if (!/^(file|content|blob|https?):/.test(image.uri)) {
    throw new FoodVisionError('INVALID_IMAGE', 'Select a camera or image URI.');
  }
  return image;
}

async function toBase64(image: FoodVisionImage, signal: AbortSignal): Promise<FoodVisionImage> {
  if ('base64' in image) return image;
  const response = await fetch(image.uri, { signal });
  if (!response.ok) throw new FoodVisionError('INVALID_IMAGE', 'Unable to read this image.');
  const blob = await response.blob();
  if (blob.size > 6_000_000) throw new FoodVisionError('INVALID_IMAGE', 'Use an image smaller than 6 MB.');
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => { reader.abort(); reject(new Error('Cancelled')); };
    if (signal.aborted) { reject(new Error('Cancelled')); return; }
    signal.addEventListener('abort', abort, { once: true });
    reader.onloadend = () => signal.removeEventListener('abort', abort);
    reader.onerror = () => reject(new Error('Unable to read image bytes.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
  return normalizeImage({ base64: dataUri.slice(dataUri.indexOf(',') + 1),
    mimeType: image.mimeType ?? (blob.type as 'image/jpeg') });
}

/** Authenticated JSON/base64 adapter for /api/vision. The provider key stays server-side. */
export function createVisionProxyAnalyzer(endpoint: string, accessToken?: () => Promise<string | null>): FoodVisionAnalyzer {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && __DEV__)) {
    throw new FoodVisionError('NOT_CONFIGURED', 'Configure an HTTPS food-vision endpoint.');
  }
  return async (images, note, signal) => {
    const token = accessToken ? await accessToken() : await (async () => {
      const { getSupabase } = await import('../../api/supabase');
      const { data, error } = await getSupabase().auth.getSession();
      if (error) throw error;
      return data.session?.access_token ?? null;
    })();
    if (!token) throw new FoodVisionError('NOT_CONFIGURED', 'Sign in before recognizing food.');
    const encoded = [];
    for (const image of images) encoded.push(await toBase64(image, signal));
    const response = await fetch(url.toString(), { method: 'POST',
      body: JSON.stringify({ images: encoded, note }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, signal });
    if (!response.ok) throw new FoodVisionError('REQUEST_FAILED', 'Food recognition is unavailable. Enter your meal manually.');
    return response.json();
  };
}

export function useFoodVision(options: { analyzer?: FoodVisionAnalyzer; endpoint?: string; timeoutMs?: number; accessToken?: () => Promise<string | null> } = {}) {
  const [result, setResult] = useState<FoodVisionEstimate | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<FoodVisionError | null>(null);
  const [manualOverrideRequired, setManualOverrideRequired] = useState(false);
  const request = useRef<{ id: number; controller: AbortController | null }>({ id: 0, controller: null });
  const cancel = useCallback(() => { request.current.id++; request.current.controller?.abort(); }, []);
  useEffect(() => cancel, [cancel]);

  /** `note` is the optional description: the facts a photo cannot carry at any angle. */
  const analyze = useCallback(async (input: FoodVisionImage | string | (FoodVisionImage | string)[] = [], note?: string | null): Promise<FoodVisionEstimate | null> => {
    cancel();
    const id = request.current.id;
    const controller = new AbortController();
    request.current.controller = controller;
    setStatus('loading'); setError(null); setResult(null); setManualOverrideRequired(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const list = (Array.isArray(input) ? input : [input]).map(normalizeImage);
      const described = typeof note === 'string' && !!note.trim();
      if (list.length > MAX_ANGLES) throw new FoodVisionError('INVALID_IMAGE', `Send at most ${MAX_ANGLES} photos.`);
      // A meal described in words is a complete request; a photograph is one way of describing one.
      if (!list.length && !described) throw new FoodVisionError('INVALID_IMAGE', 'Take a photo or describe the meal.');
      // More angles is more upload and more to read, so the deadline scales with them.
      const timeoutMs = options.timeoutMs ?? Math.min(60_000, 25_000 + list.length * 8_000);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) throw new FoodVisionError('NOT_CONFIGURED', 'Invalid vision timeout.');
      const analyzer = options.analyzer ?? ((options.endpoint ?? process.env.EXPO_PUBLIC_VISION_PROXY_URL) ? createVisionProxyAnalyzer((options.endpoint ?? process.env.EXPO_PUBLIC_VISION_PROXY_URL)!, options.accessToken) : null);
      if (!analyzer) throw new FoodVisionError('NOT_CONFIGURED', 'Connect a food recognition provider or enter your meal manually.');
      const interrupted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error('Cancelled'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => {
          reject(new FoodVisionError('TIMEOUT', 'Recognition timed out. You can enter your meal manually.'));
          controller.abort();
        }, timeoutMs);
      });
      const trimmed = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;
      const value = await Promise.race([analyzer(list, trimmed, controller.signal), interrupted]);
      const estimate = parseVisionEstimate(value);
      if (request.current.id !== id) return null;
      setResult(estimate); setStatus('success');
      return estimate;
    } catch (cause) {
      if (request.current.id !== id) return null;
      const failure = cause instanceof FoodVisionError ? cause
        : new FoodVisionError('REQUEST_FAILED', 'Could not recognize this meal. Enter it manually.');
      setError(failure); setStatus('error'); setManualOverrideRequired(true);
      return null;
    } finally {
      clearTimeout(timer);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
    }
  }, [cancel, options.analyzer, options.endpoint, options.timeoutMs, options.accessToken]);

  /** A meal in the person's own words, with no photograph at all. */
  const describe = useCallback((text: string) => analyze([], text), [analyze]);

  /** Replaces the working set of rows — used when the user edits, drops or re-portions one. */
  const setItems = useCallback((items: RecognizedItem[]) => {
    setResult(current => current ? { ...current, items } : { items, note: null });
  }, []);
  const triggerManualOverride = useCallback(() => {
    cancel(); setStatus('idle'); setError(null); setManualOverrideRequired(true);
  }, [cancel]);
  const reset = useCallback(() => {
    cancel(); setResult(null); setError(null); setStatus('idle'); setManualOverrideRequired(false);
  }, [cancel]);

  return { analyze, describe, result, status, isLoading: status === 'loading', error, manualOverrideRequired,
    setItems, triggerManualOverride, reset };
}
