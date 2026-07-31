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
              group: ['@relayflow/data', '@relayflow/data/!(web)'],
              message:
                'Call a use-case from @relayflow/logic instead of querying directly. ' +
                'Only src/server/context.ts may build a client, via @relayflow/data/web.',
            },
          ],
        },
      ],
    },
  },
  {
    // The one file allowed to construct a client and import the SDK: session
    // refresh has to run before any application code does.
    files: ['src/server/context.ts', 'src/proxy.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
