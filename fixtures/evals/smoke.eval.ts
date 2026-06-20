/**
 * Fixture eval used by .github/workflows/test-public-action.yml to verify the
 * public Action end-to-end on a clean checkout (golden + structural runners,
 * no API key). All cases pass, so the Action should write goldset-results.json
 * and exit 0.
 */
import { goldenDataset, structural, runEval } from '../../src/index';

const llm = (input: string): string =>
  input.includes('json')
    ? JSON.stringify({ ok: true })
    : 'The quick brown fox';

const golden = await goldenDataset(
  [{ id: 'fox', input: 'say the fox line', expected: 'The quick brown fox' }],
  { llm, threshold: 0.9 }
);

const shape = await structural(
  [{ id: 'json', input: 'emit json' }],
  { llm, assertions: [{ type: 'json-schema', schema: { type: 'object', properties: { ok: {} } } }] }
);

await runEval(golden, shape);
