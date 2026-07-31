import { createClient } from '@supabase/supabase-js';
import type { Database } from '../generated/database.types';

/**
 * QUARANTINE ZONE — the service-role client bypasses row-level security.
 *
 * The sanadycare audit's most severe finding was privileged clients reachable
 * from ordinary request handlers, which turns every RLS policy into decoration.
 * Three things keep that from happening again:
 *
 *   1. This module lives behind the "@relayflow/data/admin" subpath, which the
 *      lint layer rules forbid apps and @relayflow/logic from importing.
 *   2. The factory refuses to run anywhere but a trusted server process.
 *   3. Each caller must state a written reason, which shows up in review and
 *      in logs.
 *
 * Before reaching for this, ask whether the work can be a SECURITY DEFINER SQL
 * function with a narrow signature instead. It usually can, and that version is
 * auditable in one place.
 */

export interface AdminClientOptions {
  /** Why RLS must be bypassed. Recorded, and read during code review. */
  readonly reason: string;
}

export function createAdminClient(options: AdminClientOptions) {
  if ('window' in globalThis) {
    throw new Error('The service-role client can never be constructed in a browser or app bundle.');
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use the service-role client.',
    );
  }

  if (!options.reason.trim()) {
    throw new Error('createAdminClient requires a stated reason for bypassing RLS.');
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-relayflow-admin-reason': options.reason } },
  });
}
