import cors from 'cors';
import { Router } from 'express';

import {
  fetchDailyMenu,
  normalizeMenuDate,
  NutrisliceError,
} from '../src/api/nutrislice';
import { isDiningHallSlug } from '../src/types/campus';

export interface NutrisliceFallbackOptions {
  /** Dependency injection for tests or server-side instrumentation. */
  fetchMenu?: typeof fetchDailyMenu;
}

/** Mount at /api/nutrislice. This router serves public menu data only. */
export function createNutrisliceFallbackRouter(
  { fetchMenu = fetchDailyMenu }: NutrisliceFallbackOptions = {},
): Router {
  const router = Router();
  router.use(cors({ methods: ['GET'] }));

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
      const menu = await fetchMenu(diningHall, date, { signal: controller.signal });
      if (controller.signal.aborted) return;
      res.set('Cache-Control', 'public, max-age=60').json(menu);
    } catch (error) {
      if (controller.signal.aborted) return;
      res.set('Cache-Control', 'no-store');

      if (error instanceof NutrisliceError) {
        const status = error.code === 'INVALID_INPUT' ? 400 : error.code === 'TIMEOUT' ? 504 : 502;
        res.status(status).json({
          error: {
            code: error.code,
            message: status === 400 ? 'Invalid menu request.' : 'Rutgers menu data is unavailable.',
          },
        });
        return;
      }

      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Unable to load the daily menu.' },
      });
    } finally {
      res.off('close', onDisconnect);
    }
  });

  return router;
}
