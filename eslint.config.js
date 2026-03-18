import tseslint from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

const typescriptConfigs = tseslint.configs['flat/recommended'].map((config) => ({
  ...config,
  files: ['**/*.{ts,tsx}'],
  languageOptions: {
    ...config.languageOptions,
    parserOptions: {
      ...(config.languageOptions?.parserOptions ?? {}),
      ecmaVersion: 'latest',
      ecmaFeatures: {
        jsx: true
      }
    }
  }
}));

export default [
  {
    ignores: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**']
  },
  ...typescriptConfigs,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules
    }
  }
];
