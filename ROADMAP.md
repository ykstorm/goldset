# Roadmap

## v0.2: released as npm 0.2.4
- [x] `goldenDataset`: Levenshtein similarity, configurable threshold
- [x] `llmJudge`: LLM-as-judge scoring, rubric-based
- [x] `structural`: JSON schema, regex, substring, tool call shape assertions
- [x] GitHub Action: PR diff comments, fails the check on a failing eval
- [x] npm package: `@ykstormsorg/goldset`
- [x] Listed on GitHub Marketplace

## v0.3: 0.3.0, not yet published
- [x] `grounding`: RAG faithfulness, answer supported by context
- [x] Judge verdict cache for `llmJudge` and `grounding`
- [x] Action inputs `timeout-ms` and `pass-env`
- [ ] Parallel eval runs (run goldenDataset, llmJudge, structural concurrently)
- [ ] Result caching for the other runners (skip cases already run with same code version)
- [ ] `--dry` mode for CI sanity checks before committing eval changes

## v1.0: production readiness
- [ ] Standalone action bundle (no `npm ci` step in CI)
- [ ] Structured rubric format (JSON dimensions vs freeform string)
- [ ] Baseline drift alerts (notify when scores consistently change without PR)

## Not planned (open issue first)
- Web dashboard / UI
- Automated test case generation
- Multi-model parallel comparison
- Integration with specific model providers (OpenAI, Anthropic) as first-class citizens
