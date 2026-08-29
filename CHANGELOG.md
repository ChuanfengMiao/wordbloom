# Changelog

## 1.0.0 — 2026-08-29

First complete MVP release.

- Added the 20,000-lemma Known/Unknown card workflow, overview, search, filters, reclassification, one-step undo, completion state, and local resume.
- Added compact local persistence, validated JSON import/export, reset controls, and exact v1-to-v2 progress migration.
- Added keyboard, touch, pointer, focus, ARIA, non-color-label, responsive, and reduced-motion regression coverage.
- Corrected the vocabulary source pipeline to use the Open English WordNet 2025 core dataset and recorded reproducible source/licensing metadata.
- Reduced the shipped vocabulary payload while retaining the canonical ranked dataset and lockstep validation.
- Updated the application and build toolchain to versions with a clean npm security audit.
