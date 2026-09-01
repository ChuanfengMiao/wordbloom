# WordBloom Collaboration Guide

This file is the shared operating agreement for people and coding agents working on WordBloom. Keep it current whenever the product, data pipeline, architecture, or release process changes.

## Product mission

WordBloom is a private, front-end-only vocabulary inventory. Its primary job is to help one person quickly classify 20,000 general-English lemmas as known or unknown, review the whole list, and preserve progress locally.

The MVP measures classified lemmas. Do not describe its result as a statistically validated vocabulary-size estimate.

## Product boundaries

- Keep vocabulary and user progress client-side. Do not add accounts, analytics, trackers, cloud sync, or a backend without explicit approval.
- Preserve the meaning of **Known**: the user can recall at least one ordinary meaning and recognize the lemma in context.
- Treat homographs with the same normalized spelling as one inventory item.
- Keep the word list faithful to general English; do not silently sanitize legitimate vocabulary.
- Definitions, examples, pronunciation, CEFR levels, spaced repetition, and learning content are future-scope features unless explicitly requested.
- Protect privacy. Never commit exported progress, local environment files, credentials, tokens, or personal data.

## Interaction invariants

These behaviors are intentional and must not drift:

- Swipe left, press `ArrowLeft`, or use the left button for **Known**.
- Swipe right, press `ArrowRight`, or use the right button for **Unknown**.
- A swipe commits after 22% of card width or 650 px/s directional velocity; otherwise it springs back.
- Mount no more than the current card and the next two cards.
- Support one-step undo through the button and `Ctrl/Cmd+Z`.
- Resume at the next unmarked lemma when appropriate; overview tiles may revisit and reclassify any lemma.
- Known, unknown, and unmarked states must remain identifiable with text or icons, never by color alone.
- Preserve keyboard focus, ARIA announcements, readable contrast, and reduced-motion behavior.

## Visual language

Maintain WordBloom's youthful, calm, lightly playful character:

- Canvas: warm cream `#FFF9F2`
- Accent: lavender `#8175C7`
- Text: dark blue-gray `#293047`
- Known: `#E5F4E9`
- Unknown: `#F9E5EC`
- Unmarked: `#ECEEF2`
- Nunito typography, rounded surfaces, soft shadows, and restrained flower/star motifs

Extend the existing design tokens and components rather than introducing a competing visual system.

## Architecture map

- `app/components/WordBloomApp.tsx`: application shell, card workflow, persistence, import/export, and dialogs
- `app/components/Overview.tsx`: searchable/filterable virtualized vocabulary grid
- `app/lib/progress.ts`: status encoding, persistence schema, backup validation, counts, and layout helpers
- `app/data/words.json`: committed 20,000-entry static dataset
- `app/data/lemmas.json`: compact browser payload derived from the canonical dataset
- `app/data/manifest.json`: source, version, generation, filtering, and license record
- `app/data/README.md`: in-directory redistribution warning and license pointers
- `app/data/legacy-v1-map.json`: one-time index map for migrating compatible v1 progress to the corrected v2 dataset
- `scripts/generate-word-data.py`: reproducible offline dataset generator
- `tests/setup.ts`: browser-environment test shims
- `.openai/hosting.json`: Sites project identity and logical resource bindings only
- `LICENSES.md`, `NOTICE`, `DATA_LICENSES.md`, and `THIRD_PARTY_NOTICES/`: mixed-license scope, attribution, modification, and verbatim upstream terms

Keep UI components focused. Put reusable state-format and calculation logic in `app/lib`, and keep generated data out of hand-written source files.

## Dataset rules

- Source eligible lemmas from the Open English WordNet 2025 core edition, excluding its proper-name dataset.
- Rank with `wordfreq` English Zipf scores.
- Normalize to lowercase and keep valid single-token alphabetic headwords with legitimate internal apostrophes. Hyphenated forms remain excluded while the ranking source treats them as phrases and would distort rank order.
- Merge identical spellings across parts of speech.
- Sort by descending frequency with alphabetical tie-breaking and select exactly 20,000 unique entries.
- Do not substitute commercial COCA exact rankings.
- When regenerating, update the manifest and review both top-ranked samples and validation tests before committing.

The checked-in dataset is a product artifact. Do not regenerate it merely because a local dependency version differs.

Treat the vocabulary artifacts as separately licensed data, not MIT-licensed application code. Preserve all upstream attribution, modification, warranty, and share-alike notices when distributing the repository.

## State compatibility

- `WordStatus`: `0` unmarked, `1` known, `2` unknown.
- Local persistence uses a compact two-bit representation under dataset ID `oewn-2025-wordfreq-en-20k-v2`.
- Progress saved against `oewn-2025-wordfreq-en-20k-v1` is migrated by lemma index when the same lemma exists in v2; removed entries remain untouched in the legacy storage key.
- JSON backups currently use schema version `1`; current backups must match the exact dataset ID, while v1 backups are accepted only through the committed v1-to-v2 migration map.
- Any incompatible storage or backup change requires a deliberate migration or schema-version increment plus tests.

## Development workflow

Use the existing npm lockfile and Node.js 22.13 or newer.

```powershell
npm install
npm run dev
npm test
npm run build
```

Before handing off a behavior change:

1. Add or update focused tests.
2. Run `npm test`.
3. Run `npm run build`.
4. Confirm `git diff` contains only intended changes.

Do not use browser screenshots, click-through testing, or visual inspection unless the user explicitly asks for browser QA. Automated interaction tests are the default regression guard.

## Required regression coverage

Preserve tests for:

- dataset count, uniqueness, normalization, ranks, and non-increasing frequency;
- gesture threshold and cancellation, direction mappings, buttons, keyboard controls, undo, revisiting, and completion;
- progress counts, two-bit persistence, backup round trips, corrupt input, and schema/dataset mismatches;
- search, filters, responsive column calculations, and row virtualization;
- the three-card mount limit, focus behavior, ARIA announcements, reduced motion, and non-color state labels.

## Git and release safety

- Work on `main` unless the user requests a feature branch.
- Never rewrite shared history or use destructive reset/checkout commands without explicit approval.
- Do not commit `.env` files, credentials, deployment archives, local progress exports, dependency folders, coverage, or build output.
- Keep generated source data, its manifest, the generator, tests, social image, and lockfile tracked.
- Keep mixed-license summaries, the project notice and disclaimer, and verbatim upstream license/attribution files tracked with every public distribution.
- Use small, descriptive commits. Inspect `git status` and staged changes before every commit.
- The Sites source remote must contain no embedded credential. Authenticate pushes per command with the short-lived Sites credential.
- For any deployable change, follow the Sites build and hosting workflow: validate, commit, push the exact commit, package the matching build, save a version, and deploy only after confirming the existing access policy.
- Keep deployments owner-only unless the user explicitly approves broader access.

## Collaboration expectations

- Read this file before making project changes.
- Preserve unrelated user work in a dirty worktree.
- State assumptions when they materially influence behavior or scope.
- Prefer the smallest coherent change that fully solves the request.
- Document non-obvious decisions here or in a nearby code comment; avoid comments that merely restate code.
- When a request conflicts with these guidelines, the user's current explicit instruction wins. Update this file if the new direction is intended to persist.
