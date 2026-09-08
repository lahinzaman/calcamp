/** Portable to native runtimes without AbortSignal.any/timeout. */
export const boundedFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const parent = init?.signal;
  const abort = () => controller.abort();
  parent?.addEventListener('abort', abort, { once: true });
  if (parent?.aborted) abort();
  const timer = setTimeout(abort, 15_000);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); parent?.removeEventListener('abort', abort); }
};
