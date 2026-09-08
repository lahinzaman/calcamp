import cors from 'cors';
import { createCachedLoader, type ResponseCache } from './cache';
import { structuredLimit } from './http';
import { rescueCatalog } from './data/rescueCatalog';
import { Router } from 'express';

import {
  fetchDailyMenu,
  normalizeMenuDate,
  NutrisliceError,
} from '../src/api/nutrislice';
import { isDiningHallSlug } from '../src/types/campus';

export interface NutrisliceFallbackOptions {
  /** Dependency injection for tests or server-side instrumentation. */
  fetchMenu?: typeof fetchDailyMenu; cache?: ResponseCache; ttlMs?: number;
}

/** Mount at /api/nutrislice. This router serves public menu data only. */
export function createNutrisliceFallbackRouter(
  { fetchMenu = fetchDailyMenu, cache, ttlMs }: NutrisliceFallbackOptions = {},
): Router {
  const router = Router(); const cached = createCachedLoader(cache);
  router.use(cors({ methods: ['GET'], exposedHeaders: ['X-Data-Freshness', 'X-Cache-Date'] }));
  router.use(structuredLimit({ limit: 60 }));

  router.get('/daily-menu', async (req, res) => {
    const { diningHall, date } = req.query;
    if (!isDiningHallSlug(diningHall) || typeof date !== 'string') {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Provide a supported diningHall and a date in YYYY-MM-DD format.',
        },
      });
      return;
    }

    try {
      normalizeMenuDate(date);
    } catch {
      res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'date must be a valid YYYY-MM-DD calendar date.' },
      });
      return;
    }

    const controller = new AbortController();
    const onDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once('close', onDisconnect);

    try {
      // No fallbackBaseUrl here: the server always calls Rutgers directly.
      // The client owns the allowlisted URL construction and shared parser.
      const menu = await cached(`menu:${diningHall}:${date}`, () => fetchMenu(diningHall, date, { signal: AbortSignal.timeout(15_000), timeoutMs: 12_000 }), ttlMs);
      if (controller.signal.aborted) return;
      res.set({ 'Cache-Control': 'public, max-age=60', 'X-Data-Freshness': menu.stale ? 'stale' : 'fresh', 'X-Cache-Date': new Date(menu.savedAt).toISOString() }).json(menu.value.map(item => ({ ...item, dataFreshness: menu.stale ? 'stale' : 'fresh', cachedAt: new Date(menu.savedAt).toISOString() })));
    } catch (error) {
      if (controller.signal.aborted) return;
      res.set('Cache-Control', 'no-store');
      const fallback = { kind: 'rescue-catalog', availabilityVerified: false, meals: rescueCatalog.flatMap(entry => entry.meals) };

      if (error instanceof NutrisliceError) {
        const status = error.code === 'INVALID_INPUT' ? 400 : error.code === 'TIMEOUT' ? 504 : 502;
        res.status(status).json({
          error: {
            code: error.code, fallback,
            message: status === 400 ? 'Invalid menu request.' : 'Rutgers menu data is unavailable.',
          },
        });
        return;
      }

      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', fallback, message: 'Unable to load the daily menu.' },
      });
    } finally {
      res.off('close', onDisconnect);
    }
  });

  return router;
}
