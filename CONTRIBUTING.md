# Contributing

Thank you for helping improve WordBloom.

## Before changing code

Read `AGENTS.md`; it is the product and engineering contract. In particular, preserve the privacy boundary, direction mappings, three-card limit, one-step undo, dataset identity rules, accessible state labels, focus behavior, and reduced-motion behavior.

Keep changes focused. Do not add accounts, analytics, trackers, cloud sync, a backend, learning content, or a regenerated dataset without explicit product approval.

## Development

Use Node.js 22.13 or newer and the committed npm lockfile.

```powershell
npm install
npm run dev
```

Before submitting a change:

```powershell
npm run check
git diff --check
git status --short
```

Add focused tests for behavior changes. Do not commit build output, dependency directories, environment files, credentials, or exported progress.

## Dataset changes

The checked-in word list is a versioned product artifact. Do not regenerate it because a local dependency version differs. Any intended change must preserve reproducibility, update the manifest, address storage compatibility, review representative samples, and pass all dataset and migration tests.

## Commit and review style

Prefer small, descriptive commits. Explain non-obvious product or compatibility decisions in a nearby document or comment. A pull request should state what changed, why, how it was verified, and whether it affects data or stored-progress compatibility.
