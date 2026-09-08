import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createVisionProxyRouter } from './vision-proxy';
import express from 'express';
import { createCampusProxyRouter } from './campus-proxy';

import { createNutrisliceFallbackRouter } from './nutrislice-fallback';

export function createApp() {
  config({ path: resolve(process.cwd(), 'backend/.env'), quiet: true });
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/campus', createCampusProxyRouter());
  app.use('/api/vision', createVisionProxyRouter());
  app.use('/api/nutrislice', createNutrisliceFallbackRouter());
  return app;
}

// Importing the app in tests never binds a port.
if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 through 65535.');
  }
  app.listen(port, () => {
    console.log(`RULocked API listening on port ${port}`);
  });
}
