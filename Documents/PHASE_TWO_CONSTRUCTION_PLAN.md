# Phase Two Construction Plan

Status: implemented, validated, and approved for owner-only release
Prepared: September 2, 2026

## September 3 refinement amendment

The completed stage checklists below record the original phase-two release. The following approved refinements supersede its Escape and editable-vertical-arrow decisions:

- Use one consistent rounded outline on both card faces, quieter solid surfaces, simpler controls, and reduced stack depth.
- `ArrowDown` toggles the card in both directions; `ArrowUp` plays American English pronunciation on either face, including inside the note editor.
- Left/Right and modified arrows remain editing keys. Repeated vertical shortcuts and composition input do not trigger card actions. Escape continues to close dialogs only.
- Add distinct, brief, locally synthesized Known/Unknown cues at accepted classification gestures, with overlap cancellation and graceful audio failure. Persistence and backup formats remain unchanged.

Regression coverage includes the changed keyboard/focus behavior, both button paths, cue selection/timing, audio resume/failure, cancellation, and teardown.

## Objective

Phase two adds two current-card actions without changing WordBloom's private, front-end-only product boundary:

- `ArrowUp` or a compact card button plays the current lemma with a device-provided American English speech voice.
- `ArrowDown` or a compact card button flips the current card to a back-side editor for private per-word notes.

Pronunciation is browser text-to-speech rather than an authoritative human recording. Notes remain on the device unless the user explicitly exports a backup.

## Approved product decisions

- Use `SpeechSynthesisUtterance` with `en-US`, rate `0.9`, pitch `1`, and volume `1`.
- Prefer an exact American English voice and handle delayed voice loading through `voiceschanged`.
- Store notes locally in a sparse, dataset-bound record with a 1,000-character limit and 300-millisecond autosave.
- Include notes in backup export, import, and reset.
- Keep compact classification storage at schema version 1 and introduce backup schema version 2 for notes.
- Open the back with `ArrowDown`; close it with a visible Show Front control or `Escape`.
- Preserve normal arrow-key editing inside the note field.
- Use an interruptible 3D card flip and a non-spatial cross-fade for reduced motion.

## Stage 0 — Documentation preparation

- [x] Establish `Documents/` as the architecture and construction-plan directory.
- [x] Move `ARCHITECTURE.md` into `Documents/`.
- [x] Add the canonical documentation index.
- [x] Add this phase-two construction plan.
- [x] Update links that referenced `docs/ARCHITECTURE.md`.
- [x] Keep operational and legal documents at their required root paths.
- [x] Report the completed structure and wait for the construction start checkpoint.

Acceptance gate: only documentation paths, documentation content, and their references have changed; application source and behavior remain untouched.

## Stage 1 — Pronunciation and notes foundations

- [x] Add a reusable speech controller with American English voice selection, speaking state, cancel/restart behavior, and unsupported/error handling.
- [x] Cancel active speech when the word or view changes, a modal opens, or the application unmounts.
- [x] Add versioned note serialization, parsing, validation, counting, and dataset checks under a separate local-storage key.
- [x] Retain the latest in-memory draft and expose a recoverable error if local storage cannot be written.
- [x] Add backup schema version 2 with sparse notes while continuing to accept compatible schema-version-1 and legacy-dataset backups.

Acceptance gate: speech and note helpers have focused unit coverage, existing classification persistence remains byte-for-byte compatible, and malformed imported notes are rejected before state changes.

## Stage 2 — Two-sided card interface

- [x] Separate horizontal swipe motion on the outer card from front/back rotation on an inner card layer.
- [x] Add 44-by-44-pixel Listen and Notes controls with Lucide icons, visible `ArrowUp`/`ArrowDown` hints, and explicit accessible labels.
- [x] Add a back face containing the lemma, rank, Listen control, Show Front control, labeled textarea, character counter, and save status.
- [x] Focus the textarea when notes open and restore focus to the current card when notes close.
- [x] Disable swipe dragging while the back is open without disabling the external Known and Unknown buttons.
- [x] Keep the inactive face out of the accessibility and tab trees.
- [x] Preserve the current-card-plus-two-next-cards mount limit.
- [x] Use an approximately 0.36-second, critically damped flip; replace it with a short cross-fade under reduced motion.

Acceptance gate: pointer, keyboard, focus, swipe, and reduced-motion behavior match the approved mappings without changing the existing Known/Unknown interaction invariants.

## Stage 3 — Workflow and data integration

- [x] Reset each newly opened or revisited card to its front face.
- [x] Autosave notes after idle and flush on blur, classification, navigation, visibility loss, export, and unmount.
- [x] Delete sparse entries for blank notes; keep undo limited to classification state.
- [x] Flush the current note before pointer-based classification advances the cursor.
- [x] Export decisions and notes together and show both counts before import replacement.
- [x] Treat import as full replacement; schema-version-1 backups import with no notes and therefore clear existing notes after confirmation.
- [x] Reset classifications, notes, drafts, speech, and undo state together.

Acceptance gate: revisiting a lemma restores its note, import/export is deterministic, reset is complete, and a note write failure never corrupts classification progress.

## Stage 4 — Regression coverage and project documentation

- [x] Test `ArrowUp`, Listen buttons, exact `en-US` preference, delayed voices, replay, cancellation, unsupported synthesis, and speech errors.
- [x] Test `ArrowDown`, card controls, textarea focus, `Escape`, normal arrow editing, drag suppression, classification from the back, and reduced motion.
- [x] Test note round trips, blank deletion, length validation, autosave, write failures, backup-v2 compatibility, backup-v1 compatibility, malformed imports, reset, and export flushing.
- [x] Re-run existing gesture, direction, undo, overview, completion, focus, ARIA, virtualization, and three-card-limit regressions.
- [x] Update the project README, architecture, changelog, documentation index, and collaboration guide to describe the completed phase-two behavior and compatibility contract.

Acceptance gate: `npm run check` passes and the working-tree diff contains only intended source, test, and documentation changes.

## Stage 5 — Private release

- [x] Confirm the validated build still matches the committed source and leaves `.openai/hosting.json` resource bindings unchanged.
- [x] Preserve the existing social image and owner-only deployment policy.
- [x] Commit and push the exact validated source with no credentials or private exports.
- [x] Package the matching build, save one Sites version, verify owner-only access, and deploy privately.
- [x] Confirm the deployment succeeds and hand off the private URL.

Acceptance gate: the deployed owner-only site runs the exact validated phase-two commit without broadening access or adding remote data services.

## Accessibility and motion requirements

- Global card shortcuts remain inactive while an input, textarea, select, or content-editable element has focus.
- `Escape` closes the note face and restores focus; inactive card content is not announced or tabbable.
- Speaking, save errors, unavailable synthesis, and face changes have concise accessible status where useful; successful speech does not compete with itself through a live region.
- Controls use text or icons in addition to color and maintain readable contrast and touch-target size.
- Reduced motion removes the 3D rotation rather than merely accelerating it.

## Persistence and compatibility contract

- Classification state remains two-bit encoded under dataset ID `oewn-2025-wordfreq-en-20k-v2` and stored with progress schema version 1.
- Notes use a separate dataset-specific local-storage record with their own schema version.
- New exports use backup schema version 2 and contain a sparse `notes` object keyed by lemma index.
- Compatible backup schema version 1 remains importable with an empty note set.
- Legacy dataset decisions continue to use the committed v1-to-v2 map; no legacy notes exist to migrate.
- Invalid note indices, non-string values, oversized values, incompatible datasets, and unsupported schemas fail validation before replacement.

## Explicit exclusions

- Human-recorded or downloaded audio, phonetic transcription, voice selection, and playback-speed settings.
- Definitions, examples, CEFR levels, spaced repetition, and other learning content.
- Note search, note filtering, overview note indicators, and note history or undo.
- Accounts, analytics, cloud synchronization, a backend, D1, R2, or other remote persistence.
- Broader deployment access or a social-preview redesign.
