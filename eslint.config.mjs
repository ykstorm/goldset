import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', '.github/actions'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] } },
  // Shipped code fails lint at complexity 15; 10 to 14 is watched through repo-metrics.
  { files: ['src/**/*.ts', 'action/**/*.ts'], rules: { complexity: ['error', { max: 14 }] } }
);
