# Architecture

## System boundary

WordBloom is a front-end-only application. The runtime boundary is the browser: static application and vocabulary assets enter it, while personal classifications and notes remain in browser storage unless the user explicitly exports a JSON backup.

```text
committed vocabulary assets
          |
          v
WordBloomApp ----> two-sided card workflow / overview
     |                  |              |
     v                  v              v
progress.ts <---- status + notes   speech.ts
     |
     +---- localStorage (automatic, dataset-bound)
     +---- JSON backup (explicit import/export)
```

There are no application API routes, user accounts, remote databases, analytics events, or synchronization services.

## Runtime data

The canonical `words.json` entries contain `id`, `lemma`, `rank`, and `zipf`. Shipping all repeated field names and ranking values added substantial client weight, although the interface only needs the ordered lemma sequence. The generator therefore emits `lemmas.json`, and the client deterministically derives `id` and `rank` from each array index.

The canonical file remains the source for validation, licensing, and future regeneration. A regression test checks that the compact payload exactly equals `words.map(word => word.lemma)`.

## UI state and flow

`WordBloomApp` owns:

- the current card/overview view;
- a 20,000-byte in-memory status array;
- the active cursor and one-step undo snapshot;
- dialog state and accessible status announcements;
- card face, note draft/save state, and speech playback state;
- load, save, import, export, reset, and v1 migration orchestration.

Only the current card and next two cards are rendered. The current card owns separate swipe and front/back transform layers so note editing does not change the established gesture thresholds. A classification updates the status array, records the single undo snapshot, advances to the next unmarked lemma, announces the result, and persists the compact state. Notes are sparse, limited to 1,000 characters per lemma, and autosaved separately from classifications.

Pronunciation uses the browser's `SpeechSynthesisUtterance` implementation with `en-US`. It prefers an exact local American English voice when available and does not introduce audio assets or application network requests.

`Overview` receives the ordered entries and status array. Search and status filters are memoized, rows are virtualized, and selecting a tile returns to the card view at that exact index. Reclassification is allowed.

## Persistence

The in-memory `Uint8Array` uses one byte per status for simple updates. Storage uses a two-bit packed representation: four decisions per byte, Base64-encoded inside validated JSON. Backups use a sparse index-to-name map so exported files remain understandable and contain only classified entries.

Compact progress storage remains schema version 1. Notes use a separate schema-version-1 record bound to the same dataset. New backups use schema version 2 and combine sparse decisions with sparse notes; schema-version-1 backups remain importable and intentionally restore an empty note set. Parsing rejects malformed lengths, invalid statuses or notes, oversized notes, out-of-range indices, unsupported schemas, and unrelated datasets.

The v1 migration file maps every old index either to the exact matching v2 lemma index or to `-1`. Duplicate targets are forbidden by tests. Removed or corrected v1 entries are not guessed.

## Accessibility constraints

Direction mappings, labels, focus behavior, announcements, contrast, and reduced motion are product contracts. Dialogs trap focus, close on Escape, and restore focus to their trigger. Opening the card back focuses the note editor; `Escape` returns to the front and restores card focus. Inactive faces are hidden from the accessibility and tab trees. Status never relies on color alone. Keyboard handlers preserve normal arrow-key editing in editable controls, and reduced motion replaces the 3D flip with a short cross-fade.

## Build and hosting

Vinext builds the Next-style app through Vite. The OpenAI Sites and Cloudflare plugins package the same output for the private Sites deployment. `.openai/hosting.json` contains logical resource identity only; credentials are supplied per deployment and are never committed.
