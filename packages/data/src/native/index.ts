import { createClient } from '@supabase/supabase-js';
import type { Database } from '../generated/database.types';
import type { RlsClient } from '../client';

/**
 * React Native client. The session lives in whatever secure storage the app
 * hands in — AsyncStorage for ordinary state, SecureStore where the platform
 * offers it — rather than being hardcoded here, so the data package stays free
 * of native module imports.
 */

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createNativeClient(
  url: string,
  anonKey: string,
  storage: SessionStorage,
): RlsClient {
  return createClient<Database>(url, anonKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      // There is no URL to parse on device; leaving this on breaks deep links.
      detectSessionInUrl: false,
    },
  });
}
