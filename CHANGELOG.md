# Changelog

## 1.1.0 — 2026-09-02

- Added device-provided American English pronunciation through `ArrowUp` and on-card Listen controls.
- Added an accessible two-sided card with `ArrowDown`, private per-word notes, autosave, and reduced-motion fallback.
- Added dataset-bound note persistence and schema-version-2 backups while retaining schema-version-1 import compatibility.
- Consolidated architecture and construction plans under `Documents/`.

## 1.0.0 — 2026-08-29

First complete MVP release.

- Added the 20,000-lemma Known/Unknown card workflow, overview, search, filters, reclassification, one-step undo, completion state, and local resume.
- Added compact local persistence, validated JSON import/export, reset controls, and exact v1-to-v2 progress migration.
- Added keyboard, touch, pointer, focus, ARIA, non-color-label, responsive, and reduced-motion regression coverage.
- Corrected the vocabulary source pipeline to use the Open English WordNet 2025 core dataset and recorded reproducible source/licensing metadata.
- Reduced the shipped vocabulary payload while retaining the canonical ranked dataset and lockstep validation.
- Updated the application and build toolchain to versions with a clean npm security audit.
- Added explicit mixed-license scoping, verbatim upstream notices, modification disclosure, and a personal-study/legal disclaimer before public source distribution.
