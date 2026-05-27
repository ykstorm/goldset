# Publishing & Deploying Goldset

Goldset is a TypeScript library, a GitHub Action, and a docs site. Three things to ship.

---

## 1. Publish the npm package

Pre-flight:
```bash
cd ~/projects/goldset
npm run lint
npm test
npm run build
ls dist/
# expect: index.js, index.mjs, index.d.ts
```

Tag + push:
```bash
git tag v1.0.0
git push --tags
```

CI's `publish-npm` job fires, signs with provenance, publishes `@ykstorm/goldset@1.0.0` to npm.

Verify:
```bash
npm view @ykstorm/goldset
# Look for "dist.signatures" array — provenance attestation
```

---

## 2. Publish the GitHub Action

The action lives at the root of the same repo. Two extra steps after npm publish:

Create a major-version tag (`v1`) that points at the latest 1.x release:
```bash
git tag -f v1 v1.0.0
git push --tags --force
```

This lets users pin `uses: ykstorm/goldset@v1` and get the latest stable.

List on the GitHub Marketplace:
1. Go to https://github.com/ykstorm/goldset → Releases → Edit release
2. Tick "Publish this Action to the GitHub Marketplace"
3. Choose category: "Continuous integration"
4. Set badge color + icon
5. Save

---

## 3. Deploy the docs + playground

`docs-site/` is a Next.js app showing the README content + interactive playground (paste a prompt, paste an expected output, run a runner, see the result).

Vercel:
```bash
cd docs-site
vercel link
vercel env add OPENAI_API_KEY    # for the live playground
vercel --prod
```

Custom domain: `goldset.lakshyaraj.dev`.

CI auto-deploys docs on every merge to `main` via the `publish-docs` job.

---

## 4. Add to npm README badges

Once the package is live, README badges resolve:
- npm version → live link to npmjs.com/package/@ykstorm/goldset
- CI status → live link to the workflow
- Docs → live link to goldset.lakshyaraj.dev

---

## 5. Migration from old package name

If you previously published as `vercel-ai-eval`:

```bash
# Deprecate old package (npm immutability — can't delete)
npm deprecate vercel-ai-eval@"*" "Renamed to @ykstorm/goldset — https://github.com/ykstorm/goldset"
```

Anyone hitting the old package gets a clear redirect message on install.

---

## 6. Smoke test after publish

```bash
mkdir /tmp/goldset-smoke && cd /tmp/goldset-smoke
npm init -y
npm install @ykstorm/goldset tsx
cat > smoke.ts <<'EOF'
import { goldenDataset } from '@ykstorm/goldset'
const r = await goldenDataset(
  [{ id: 't1', input: 'hi', expected: 'hello' }],
  { llm: async () => 'hello there', threshold: 0.5 }
)
console.log(JSON.stringify(r, null, 2))
EOF
npx tsx smoke.ts
# Expect: passed: true, similarity around 0.5-0.6
```

---

## 7. Launch announcement

Once npm + docs + Action all live:
1. LinkedIn (see linkedin-post.md Variant A)
2. X (Variant C)
3. Show HN: "Goldset — AI evals as code, with GitHub Action PR comments"
4. dev.to long-form: "Three eval runners every AI app needs"
5. r/MachineLearning (only after dev.to essay due to subreddit rules)
6. Vercel AI SDK Discord — the "tools built on top of AI SDK" channel

---

## 8. Versioning policy

Goldset follows SemVer strictly because it's published to npm with provenance:

- **Patch (1.0.x)** — bug fixes, no API change
- **Minor (1.x.0)** — additive runners, additive assertion types, additive Action inputs (all backward-compat)
- **Major (x.0.0)** — breaking changes; we maintain the previous major's branch for 6 months

GitHub Action major tag (`v1`) is force-pushed on every minor/patch — that's the standard GitHub Action pattern.

---

## 9. Rollback

npm:
```bash
npm deprecate @ykstorm/goldset@1.0.x "Rolling back, use 1.0.y"
# (Old version still installable; users explicitly pinning are unaffected)
```

GitHub Action:
```bash
git tag -f v1 v1.0.0-known-good
git push --tags --force
# users pinning @v1 immediately get the rolled-back action
```

Users pinning `@v1.0.x` are unaffected — that's why "pin major, get minor" is the recommended UX.
