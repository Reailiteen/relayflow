import { z } from 'zod';

/**
 * Environment access is centralized so a missing variable fails at boot with a
 * readable list, rather than as `undefined` deep inside a request.
 *
 * The client/server split is load-bearing: `client` keys are inlined into
 * browser and app bundles, so anything secret must live in `server` only.
 */
export interface EnvSpec<
  TServer extends z.ZodRawShape,
  TClient extends z.ZodRawShape,
> {
  server: TServer;
  client: TClient;
  /** The already-inlined values, e.g. { NEXT_PUBLIC_X: process.env.NEXT_PUBLIC_X }. */
  runtimeEnv: Record<string, string | undefined>;
  /** Skip validation in lint/CI steps that have no real environment. */
  skipValidation?: boolean;
}

export function createEnv<TServer extends z.ZodRawShape, TClient extends z.ZodRawShape>(
  spec: EnvSpec<TServer, TClient>,
): z.infer<z.ZodObject<TServer>> & z.infer<z.ZodObject<TClient>> {
  type Parsed = z.infer<z.ZodObject<TServer>> & z.infer<z.ZodObject<TClient>>;

  if (spec.skipValidation) return spec.runtimeEnv as unknown as Parsed;

  // `'window' in globalThis` rather than `typeof window` so this package needs
  // no DOM lib — it runs on Node, in browsers, and on React Native.
  const isServer = !('window' in globalThis);
  const shape = isServer ? { ...spec.client, ...spec.server } : spec.client;
  const parsed = z.object(shape).safeParse(spec.runtimeEnv);

  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${missing}`);
  }

  // On the client, reading a server-only key is a build-time leak waiting to
  // happen. Fail fast and loudly instead of returning undefined.
  return new Proxy(parsed.data as Parsed, {
    get(target, key: string) {
      if (!isServer && key in spec.server) {
        throw new Error(
          `"${key}" is a server-only environment variable and cannot be read on the client.`,
        );
      }
      return Reflect.get(target, key);
    },
  });
}
