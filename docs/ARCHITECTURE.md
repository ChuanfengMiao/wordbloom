# Architecture

## System boundary

WordBloom is a front-end-only application. The runtime boundary is the browser: static application and vocabulary assets enter it, while personal progress remains in browser storage unless the user explicitly exports a JSON backup.

```text
committed vocabulary assets
          |
          v
WordBloomApp ----> card workflow / overview
     |                       |
     v                       v
progress.ts <-------- status updates
     |
     +---- localStorage (automatic)
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
- load, save, import, export, reset, and v1 migration orchestration.

Only the current card and next two cards are rendered. A classification updates the status array, records the single undo snapshot, advances to the next unmarked lemma, announces the result, and persists the compact state.

`Overview` receives the ordered entries and status array. Search and status filters are memoized, rows are virtualized, and selecting a tile returns to the card view at that exact index. Reclassification is allowed.

## Persistence

The in-memory `Uint8Array` uses one byte per status for simple updates. Storage uses a two-bit packed representation: four decisions per byte, Base64-encoded inside validated JSON. Backups use a sparse index-to-name map so exported files remain understandable and contain only classified entries.

Both formats include schema version, dataset ID, and cursor. Parsing rejects malformed lengths, invalid statuses, out-of-range indices, unsupported schemas, and unrelated datasets.

The v1 migration file maps every old index either to the exact matching v2 lemma index or to `-1`. Duplicate targets are forbidden by tests. Removed or corrected v1 entries are not guessed.

## Accessibility constraints

Direction mappings, labels, focus behavior, announcements, contrast, and reduced motion are product contracts. Dialogs trap focus, close on Escape, and restore focus to their trigger. Status never relies on color alone. Keyboard handlers ignore editable controls.

## Build and hosting

Vinext builds the Next-style app through Vite. The OpenAI Sites and Cloudflare plugins package the same output for the private Sites deployment. `.openai/hosting.json` contains logical resource identity only; credentials are supplied per deployment and are never committed.
