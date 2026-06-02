# Roadmap

## v0.2 — Current: Three runners shipped
- [x] `goldenDataset` — Levenshtein similarity, configurable threshold
- [x] `llmJudge` — LLM-as-judge scoring, rubric-based
- [x] `structural` — JSON schema + tool call shape assertions
- [x] GitHub Action — PR diff comments, merge-blocking on regression
- [x] npm package — `@ykstormsorg/goldset`
- [x] Listed on GitHub Marketplace

## v0.3 — CI improvements
- [ ] Parallel eval runs (run goldenDataset, llmJudge, structural concurrently)
- [ ] Eval result caching (skip cases already run with same code version)
- [ ] `--dry` mode for CI sanity checks before committing eval changes

## v1.0 — Production readiness
- [ ] Standalone action bundle (no `npm ci` step in CI)
- [ ] Structured rubric format (JSON dimensions vs freeform string)
- [ ] Baseline drift alerts (notify when scores consistently change without PR)

## Not planned (open issue first)
- Web dashboard / UI
- Automated test case generation
- Multi-model parallel comparison
- Integration with specific model providers (OpenAI, Anthropic) as first-class citizens