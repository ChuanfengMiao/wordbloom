# WordBloom

WordBloom is a customized personal English-study project: a private, local-first vocabulary inventory for classifying 20,000 general-English lemmas as **Known** or **Unknown**. It is designed for one person to move quickly through a stable word list, hear device-provided American English pronunciation, keep private per-word notes, review every decision, and keep progress entirely in the browser.

The MVP reports how many lemmas have been classified. It is not a statistically validated vocabulary-size estimate.

> [!IMPORTANT]
> This is a mixed-license repository. The application code is MIT-licensed, but the vocabulary artifacts incorporate and adapt third-party lexical and frequency data. Anyone redistributing or adapting those files must preserve the upstream attribution, license, modification, and warranty notices in [LICENSES.md](LICENSES.md), [NOTICE](NOTICE), [DATA_LICENSES.md](DATA_LICENSES.md), and [`THIRD_PARTY_NOTICES/`](THIRD_PARTY_NOTICES/). See [DISCLAIMER.md](DISCLAIMER.md) before reuse.

## MVP capabilities

- Classify by swipe, keyboard, or buttons.
- Play the current lemma with the browser's American English speech voice.
- Flip the current card to write an autosaved private note.
- Keep no more than three cards mounted at once.
- Undo the most recent classification with the button or `Ctrl/Cmd+Z`.
- Resume at the next unmarked lemma.
- Search, filter, revisit, and reclassify all 20,000 entries in a virtualized overview.
- Show known, unknown, and unmarked states with text and icons as well as color.
- Export, validate, import, and reset progress through accessible dialogs.
- Migrate retained decisions from the original v1 dataset to the corrected v2 dataset.
- Respect reduced-motion preferences and preserve keyboard focus and ARIA announcements.

## Controls

| Intent | Pointer or touch | Keyboard | Button |
| --- | --- | --- | --- |
| Known | Swipe left | `ArrowLeft` | Left / Known |
| Unknown | Swipe right | `ArrowRight` | Right / Unknown |
| Listen | — | `ArrowUp` | Listen |
| Open notes | — | `ArrowDown` | Notes |
| Close notes | — | `Escape` | Show front |
| Undo | — | `Ctrl/Cmd+Z` | Undo |

A swipe commits after crossing 22% of the card width or reaching 650 px/s in the swipe direction. Otherwise, the card springs back.

**Known** means the user can recall at least one ordinary meaning and recognize the lemma in context. Identically spelled homographs are one inventory item.

## Privacy model

WordBloom has no account system, analytics, tracking, cloud synchronization, or application backend. Vocabulary data ships as static assets. Classifications and notes are stored in browser `localStorage`; backup files are created only when the user explicitly exports them. Pronunciation uses the browser's speech synthesizer and does not contact an application service.

Backups can reveal vocabulary decisions and personal notes. They are intentionally ignored by Git and should be handled as private personal data. Clearing site storage without first exporting a backup permanently removes local progress and notes.

## Run locally

Requirements:

- Node.js 22.13 or newer
- npm (the committed lockfile is authoritative)

```powershell
npm install
npm run dev
```

Then open the local URL printed by the development server.

## Verify a change

```powershell
npm run check
```

This runs ESLint, TypeScript, the Vitest regression suite, and a production build. The automated tests cover dataset integrity, gestures, buttons, keyboard controls, pronunciation, card flipping, notes, undo, completion, persistence, backup validation, migration, overview search/filter/virtualization, the three-card limit, focus management, ARIA behavior, and reduced motion.

## Data methodology

The checked-in dataset is a reproducible product artifact:

1. Start from the Open English WordNet 2025 core edition, excluding the separate proper-name dataset.
2. Normalize lemmas to lowercase.
3. Keep single-token alphabetic headwords and legitimate internal apostrophes; exclude hyphenated forms because the ranking source treats them as phrases.
4. Merge identical spellings across parts of speech.
5. Rank with `wordfreq` English Zipf scores, using alphabetical order to break ties.
6. Select exactly 20,000 unique lemmas.

`app/data/words.json` is the canonical ranked dataset. `app/data/lemmas.json` is the smaller browser payload generated from it; tests require exact positional equality. `app/data/manifest.json` records the dataset identity, source versions, generation time, filters, and licensing.

Regeneration is deliberate release work, not a routine install step. It requires Python, `wn`, `wordfreq`, and an external WordNet data directory:

```powershell
python scripts/generate-word-data.py --wn-data .wordnet-data
npm test
```

Review the manifest and top-ranked sample before accepting regenerated output. See [DATA_LICENSES.md](DATA_LICENSES.md) for attribution, modification history, and reuse terms.

## Project map

- `app/components/WordBloomApp.tsx` — app shell, card workflow, persistence, import/export, and dialogs
- `app/components/Overview.tsx` — searchable, filterable, virtualized vocabulary grid
- `app/lib/progress.ts` — status/note encoding, schema validation, migration, backups, counts, and layout helpers
- `app/lib/speech.ts` — American English voice selection and utterance configuration
- `app/data/` — canonical data, compact payload, manifest, and v1 migration map
- `scripts/generate-word-data.py` — offline deterministic dataset generator
- `tests/setup.ts` — browser-environment test shims
- `.openai/hosting.json` — Sites project identity and logical bindings; it contains no credential

The app uses React, TypeScript, Vinext/Vite, Tailwind CSS, Motion, and TanStack Virtual. More detail is in [Documents/ARCHITECTURE.md](Documents/ARCHITECTURE.md).

## Persistence compatibility

Statuses use two bits per lemma: `0` unmarked, `1` known, and `2` unknown. Compact classification storage remains at schema version 1. Notes use a separate dataset-bound schema-version-1 record with a 1,000-character limit per lemma. New JSON backups use schema version 2 to include sparse notes; schema-version-1 backups remain importable with an empty note set. Incompatible format changes require an explicit migration or schema-version increment with tests.

The v1-to-v2 migration retains classifications only where the exact normalized lemma exists in both datasets. It never transfers a decision by rank alone.

## Deployment

The maintained Sites deployment is owner-only because progress is private. The public GitHub repository is source distribution, not a public hosted instance. Forks can be run locally or deployed only after reviewing their own access policy and privacy implications.

## Scope

Definitions, examples, phonetic transcription, selectable speech voices, CEFR levels, spaced repetition, learning content, note search/filtering, accounts, analytics, and cloud sync remain outside the current product scope.

## License

Application code is available under the [MIT License](LICENSE). The vocabulary datasets and derived mapping files are not covered by that MIT grant; their applicable terms and upstream rights are summarized in [LICENSES.md](LICENSES.md) and [DATA_LICENSES.md](DATA_LICENSES.md), with verbatim upstream texts in [`THIRD_PARTY_NOTICES/`](THIRD_PARTY_NOTICES/).

This repository is customized for personal study and is provided without legal, educational, or accuracy warranties; read [DISCLAIMER.md](DISCLAIMER.md). Contributions are welcome through [CONTRIBUTING.md](CONTRIBUTING.md). Security reports should follow [SECURITY.md](SECURITY.md).
