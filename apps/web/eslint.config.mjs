import base from '@relayflow/config/eslint/base';
import { universalImportRules } from '@relayflow/config/eslint/layers';
import next from '@next/eslint-plugin-next';

export default [
  ...base,
  {
    name: 'relayflow/next',
    plugins: { '@next/next': next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
    },
  },
  {
    name: 'relayflow/app/web',
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...universalImportRules,
            {
              // Apps orchestrate; they do not query. A page that reaches for a
              // repository is a page that will grow its own ad-hoc policy.
              group: ['@relayflow/data', '@relayflow/data/*', '@relayflow/fixtures'],
              message:
                'Call a use-case from @relayflow/logic instead of querying directly. ' +
                'Only src/server/context.ts chooses a storage adapter.',
            },
          ],
        },
      ],
    },
  },
  {
    // The files that pick an adapter or hold the session seam. Everything else
    // in the app reaches storage only through a use-case.
    //
    //   context.ts    chooses the repositories and resolves the actor
    //   supabase.ts   builds the request-scoped, RLS-bound client
    //   proxy.ts      refreshes the session cookie before it expires
    //
    // Keeping the exception to these three is what makes the storage choice
    // auditable in one place rather than a habit spread across route handlers.
    files: ['src/server/context.ts', 'src/server/supabase.ts', 'proxy.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
