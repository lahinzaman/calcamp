import { useCallback, useEffect, useRef, useState } from 'react';

import type { MacroTotals } from '../../types/nutrition';

export type FoodVisionInput =
  | { base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }
  | { uri: string; mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' };

export interface FoodVisionEstimate {
  portion_size_grams: number;
  macros: MacroTotals;
  source: 'estimated' | 'manual';
}

export type FoodVisionAnalyzer = (image: FoodVisionInput, signal: AbortSignal) => Promise<unknown>;
export type FoodVisionErrorCode = 'NOT_CONFIGURED' | 'INVALID_IMAGE' | 'REQUEST_FAILED' | 'INVALID_RESPONSE' | 'TIMEOUT';
export class FoodVisionError extends Error {
  constructor(public readonly code: FoodVisionErrorCode, message: string) { super(message); this.name = 'FoodVisionError'; }
}

/** Provider adapters must return total macros for this portion, not per-100g values. */
export function parseVisionEstimate(value: unknown, source: FoodVisionEstimate['source'] = 'estimated'): FoodVisionEstimate {
  const candidate = value as Partial<FoodVisionEstimate> | null;
  const macros = candidate?.macros;
  if (!candidate || typeof candidate.portion_size_grams !== 'number'
    || !Number.isFinite(candidate.portion_size_grams) || candidate.portion_size_grams <= 0
    || !macros || !['caloriesKcal', 'proteinG', 'carbsG', 'fatG'].every((key) => {
      const amount = macros[key as keyof MacroTotals];
      return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
    })) throw new FoodVisionError('INVALID_RESPONSE', 'The estimate needs a portion weight and all four macro values.');
  return {
    portion_size_grams: candidate.portion_size_grams,
    macros: { caloriesKcal: macros.caloriesKcal, proteinG: macros.proteinG, carbsG: macros.carbsG, fatG: macros.fatG },
    source,
  };
}

function normalizeImage(input: FoodVisionInput | string): FoodVisionInput {
  let image: FoodVisionInput;
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

/** Authenticated JSON/base64 adapter for /api/vision. Provider secrets stay server-side. */
export function createVisionProxyAnalyzer(endpoint: string, accessToken?: () => Promise<string | null>): FoodVisionAnalyzer {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && __DEV__)) {
    throw new FoodVisionError('NOT_CONFIGURED', 'Configure an HTTPS food-vision endpoint.');
  }
  return async (input, signal) => {
    const token = accessToken ? await accessToken() : await (async () => {
      const { getSupabase } = await import('../../api/supabase');
      const { data, error } = await getSupabase().auth.getSession();
      if (error) throw error;
      return data.session?.access_token ?? null;
    })();
    if (!token) throw new FoodVisionError('NOT_CONFIGURED', 'Sign in before recognizing food.');
    let image = input;
    if ('uri' in image) {
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
      image = normalizeImage({ base64: dataUri.slice(dataUri.indexOf(',') + 1),
        mimeType: image.mimeType ?? (blob.type as 'image/jpeg') });
    }
    const response = await fetch(url.toString(), { method: 'POST',
      body: JSON.stringify({ image }), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, signal });
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

  const analyze = useCallback(async (input: FoodVisionInput | string): Promise<FoodVisionEstimate | null> => {
    cancel();
    const id = request.current.id;
    const controller = new AbortController();
    request.current.controller = controller;
    setStatus('loading'); setError(null); setResult(null); setManualOverrideRequired(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const image = normalizeImage(input);
      const timeoutMs = options.timeoutMs ?? 20_000;
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
      const value = await Promise.race([analyzer(image, controller.signal), interrupted]);
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

  const triggerManualOverride = useCallback(() => {
    cancel(); setStatus('idle'); setError(null); setManualOverrideRequired(true);
  }, [cancel]);
  const applyManualOverride = useCallback((value: Omit<FoodVisionEstimate, 'source'>) => {
    const estimate = parseVisionEstimate(value, 'manual');
    cancel(); setResult(estimate); setStatus('success'); setError(null); setManualOverrideRequired(false);
    return estimate;
  }, [cancel]);
  const reset = useCallback(() => {
    cancel(); setResult(null); setError(null); setStatus('idle'); setManualOverrideRequired(false);
  }, [cancel]);

  return { analyze, result, status, isLoading: status === 'loading', error, manualOverrideRequired,
    triggerManualOverride, applyManualOverride, reset };
}
