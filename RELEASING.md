# Releasing

Treemapper follows three conventions:

- **[Semantic Versioning](https://semver.org)** — `MAJOR.MINOR.PATCH`.
- **[Keep a Changelog](https://keepachangelog.com)** — `changelog.md`.
- **[Conventional Commits](https://www.conventionalcommits.org)** — commit
  messages drive the version bump and the changelog.

## How a release happens

Releases are automated with
[release-please](https://github.com/googleapis/release-please). You do not tag or
bump the version by hand.

1. Push conventional commits to `main` (`feat:`, `fix:`, `docs:`, `refactor:`,
   `chore:` …). A `feat:` bumps the **minor**, a `fix:` the **patch**, and a
   `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer bumps the **major**.
2. The **release-please** GitHub Action (`.github/workflows/release-please.yml`)
   opens — and keeps updating — a **release PR** titled `chore(main): release
   x.y.z`. That PR is the staging area for the next release: it bumps
   `package.json`, updates `changelog.md`, and lists everything it will include.
3. **Review the release PR.** Its changelog entries are generated from the commit
   messages. This project prefers hand-written prose in the changelog, so **edit
   `changelog.md` in the PR** before merging if the generated lines are too terse.
4. **Merge the release PR.** release-please then tags `vx.y.z`, creates the
   GitHub Release, and the version in `package.json` is the released one.

Nothing ships until that PR is merged — merging is the deliberate "release it".

## Forcing a specific version

Add a footer to any commit to override the computed version:

```
Release-As: 2.0.0
```

## The 1.0.0 baseline

`v1.0.0` (2026-08-13) was cut by hand — its `changelog.md` entry is the full
hand-written history up to publication. release-please took over from there, and
`.release-please-manifest.json` records the last released version so it knows
where to start.

## One-time GitHub setting

The Action opens pull requests, which requires **Settings → Actions → General →
Workflow permissions → “Allow GitHub Actions to create and approve pull
requests”** to be enabled for the repository.
