import { Router, json } from 'express';
import cors from 'cors';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { structuredLimit } from './http';
export function createAccountRouter(options: { client?: () => SupabaseClient; purgeProvider?: (owner: string) => Promise<void> } = {}) {
  const router = Router();
  const client = options.client ?? (() => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Deletion is not configured.');
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } });
  });
  router.use(cors({ origin: (process.env.CAMPUS_ALLOWED_ORIGIN ?? process.env.VISION_ALLOWED_ORIGIN)?.split(',') ?? false, methods: ['DELETE'], allowedHeaders: ['Authorization','Content-Type'] }));
  router.use(structuredLimit({ windowMs: 60000, limit: 10 }));
  router.delete('/', json({ limit: '1kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) { res.status(401).json({ error: 'Sign in again to delete your account.' }); return; }
    if (req.body?.confirmation !== 'DELETE') { res.status(400).json({ error: 'Confirm permanent deletion.' }); return; }
    try {
      const admin = client(); const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) {
        // Recover a lost success response using a still-valid, signature-verified token.
        const verified = await admin.auth.getClaims(token);
        if (!verified.error && typeof verified.data?.claims.sub === 'string') {
          const existing = await admin.auth.admin.getUserById(verified.data.claims.sub);
          if (existing.error?.code === 'user_not_found') { res.json({ deleted: true }); return; }
        }
        res.status(401).json({ error: 'Sign in again to verify your account. If an earlier deletion completed, this account can no longer sign in.' }); return; }
      const owner = data.user.id; // Never accept a user ID from the request body.
      const mark = await admin.from('users').update({ deletion_requested_at: new Date().toISOString() }).eq('id', owner); if (mark.error) throw mark.error;
      // The recognition provider keeps no per-user history to purge: images are sent once and
      // never stored. The hook stays for a provider that does.
      if (options.purgeProvider) await options.purgeProvider(owner);
      // Revoke refresh sessions before hard-deleting auth identity; FK cascades remove all app rows.
      const signOut = await admin.auth.admin.signOut(token, 'global'); if (signOut.error) throw signOut.error;
      const deleted = await admin.auth.admin.deleteUser(owner, false); if (deleted.error) throw deleted.error;
      res.status(200).json({ deleted: true });
    } catch { res.status(503).json({ error: 'Deletion could not finish. Food scanning is paused while deletion is pending. Reconnect and retry to continue.' }); }
  });
  return router;
}
