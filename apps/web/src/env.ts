import { z } from 'zod';
import { createEnv } from '@relayflow/core/env';

/**
 * Anything under `client` is inlined into the browser bundle. The service-role
 * key is deliberately absent from both lists — it is read only inside
 * @relayflow/data/admin, which this app cannot import.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  // Lint and typecheck run without a real environment; the build and runtime do not.
  skipValidation: process.env.SKIP_ENV_VALIDATION === '1',
});
