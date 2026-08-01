import base from '@relayflow/config/eslint/base';
import { layerConfig } from '@relayflow/config/eslint/layers';

export default [
  ...base,
  layerConfig('logic'),
  {
    // Tests may reach for a concrete adapter — that is the point of them. The
    // exception is scoped to test files so production code still cannot, and
    // `@relayflow/fixtures` stays a devDependency so it can never ship.
    files: ['**/*.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
