import base from '@relayflow/config/eslint/base';
import { layerConfig } from '@relayflow/config/eslint/layers';

export default [
  ...base,
  // The one package permitted to import a Supabase client.
  layerConfig('data', { allowSupabase: true }),
  {
    files: ['src/**/*.ts'],
    rules: {
      // Rows arrive untyped from the network; everything must be parsed through
      // an entity schema before it leaves this package.
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
