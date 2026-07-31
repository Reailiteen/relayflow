import base from '@relayflow/config/eslint/base';
import { universalImportRules } from '@relayflow/config/eslint/layers';

export default [
  ...base,
  {
    name: 'relayflow/app/mobile',
    languageOptions: {
      globals: { __DEV__: 'readonly' },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...universalImportRules,
            {
              group: ['@relayflow/data', '@relayflow/data/!(native)'],
              message:
                'Call a use-case from @relayflow/logic instead of querying directly. ' +
                'Only src/session.ts may build a client, via @relayflow/data/native.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/session.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
