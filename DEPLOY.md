# Publishing Goldset

Goldset ships two artifacts from this repo: the npm package
`@ykstormsorg/goldset` and the GitHub Action `ykstorm/goldset`. One tag releases
both.

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

Bump `version` in `package.json` and `package-lock.json`, merge that to `main`,
then tag the merged commit and push the tag:

```bash
git tag -a v0.3.0 -m "v0.3.0"
git push origin v0.3.0
```

Pushing a `v*` tag runs CI. The `publish-npm` job in `.github/workflows/ci.yml`
waits for the `test`, `dist-check` and `dogfood` jobs to pass; it does not run
the tests itself. It installs, builds, checks that the tag matches the
`package.json` version, and runs `npm publish --provenance --access public` with
the `NPM_TOKEN` secret. Nothing checks that the tagged commit is on `main`, so
tag only a commit that is. Verify:

```bash
npm view @ykstormsorg/goldset
```

## 3. Release the Action

The Action lives at the repo root and is versioned by the same tags. There is no
moving major tag such as `v1`; the docs pin the exact release tag. Do not push
one with the current workflow: every `v*` tag starts `publish-npm`, and a tag
such as `v1` fails its tag check. A major tag needs that job's condition limited
to full version tags first.

Consumers should pin the Action to a commit SHA in production (see the README),
not a moving tag.

To list on the GitHub Marketplace: open the release on GitHub, tick "Publish this
Action to the GitHub Marketplace", and choose the "Continuous integration"
category.

## 4. Versioning

Goldset follows SemVer:

- patch (`0.3.x`): fixes, no API change
- minor (`0.x.0`): new runners, assertion types or Action inputs
- major (`x.0.0`): breaking changes

Before 1.0, a minor release such as 0.3.0 may also break the API. The changelog
marks those changes as Breaking.

## 5. Rollback

npm versions are immutable; deprecate a bad one and point consumers at a good one:

```bash
npm deprecate @ykstormsorg/goldset@0.3.0 "Use 0.2.4 until 0.3.1"
```

For the Action there is no moving tag to move back. Tell consumers to pin the
last good tag or its commit SHA, for example `uses: ykstorm/goldset@v0.2.4`.
