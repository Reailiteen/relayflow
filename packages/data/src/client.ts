import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';

/**
 * Every repository takes a client; none of them create one.
 *
 * Web and mobile build their own client (cookie-backed on the server,
 * AsyncStorage-backed on device) and inject it. That keeps this package free of
 * platform code, and — more importantly — means a repository can never quietly
 * upgrade itself to a more privileged connection.
 */
export type RelayflowClient = SupabaseClient<Database>;

/**
 * A client whose requests carry an end user's JWT, so every statement runs
 * under row-level security. This is the only kind of client application code
 * is allowed to hold.
 */
export type RlsClient = RelayflowClient & { readonly __rls?: true };
