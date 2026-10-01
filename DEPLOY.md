# Publishing Goldset

Goldset ships two artifacts from this repo: the npm package
`@ykstormsorg/goldset` and the GitHub Action `ykstorm/goldset`.

## 1. Pre-flight

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
ls dist/   # index.cjs, index.mjs, index.d.ts, index.d.cts, action.cjs
```

Commit any rebuilt `dist/` (CI fails if it is out of sync).

## 2. Publish the npm package

Tag the release and push the tag:

```bash
git tag v0.2.5
git push origin v0.2.5
```

CI's `publish-npm` job (in `.github/workflows/ci.yml`) runs on `v*` tags: it
builds, tests, and runs `npm publish --provenance --access public`. Verify:

```bash
npm view @ykstormsorg/goldset
```

## 3. Release the Action

The Action lives at the repo root and is versioned by the same tags. Move the
major tag so consumers pinning `@v1` get the latest release in that major:

```bash
git tag -f v1 v0.2.5   # once 1.x exists, point v1 at the 1.x tag
git push origin -f v1
```

Consumers should pin the Action to a commit SHA in production (see the README),
not a moving tag.

To list on the GitHub Marketplace: open the release on GitHub, tick "Publish this
Action to the GitHub Marketplace", and choose the "Continuous integration"
category.

## 4. Versioning

Goldset follows SemVer:

- patch (`0.2.x`) — fixes, no API change
- minor (`0.x.0`) — additive runners, assertion types, or Action inputs
- major (`x.0.0`) — breaking changes

## 5. Rollback

npm versions are immutable; deprecate a bad one and point consumers at a good one:

```bash
npm deprecate @ykstormsorg/goldset@0.2.x "Use 0.2.y"
```

For the Action, move the major tag back to a known-good tag:

```bash
git tag -f v1 v0.2.4
git push origin -f v1
```
