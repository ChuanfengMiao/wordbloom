# Data licenses, attribution, and modifications

The MIT License in `LICENSE` applies only to WordBloom-authored application code. It does not replace or override licenses, notices, or other rights that apply to the vocabulary data and upstream sources. This summary is subordinate to the verbatim texts in `THIRD_PARTY_NOTICES/`.

## Covered files

The following committed product artifacts are data or are directly derived from data:

- `app/data/words.json`
- `app/data/lemmas.json`
- `app/data/manifest.json`
- `app/data/legacy-v1-map.json`

## Open English WordNet

WordBloom uses normalized lemmas from the Open English WordNet 2025 core edition and excludes its separate proper-name dataset.

- Project: https://en-word.net/
- Download/source record: https://en-word.net/downloads
- Copyright: 2019–present, The Open English WordNet Team
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- License text: https://creativecommons.org/licenses/by/4.0/
- Canonical citation: John P. McCrae, Alexandre Rademaker, Francis Bond, Ewa Rudnicka, and Christiane Fellbaum (2019), “English WordNet 2019 – An Open-Source WordNet for English,” Proceedings of GWC 2019.

Open English WordNet is derived from Princeton WordNet. Redistribution must credit both the Open English WordNet team and Princeton WordNet and preserve the Princeton WordNet license notice. The project does not claim affiliation with or endorsement by either source.

## wordfreq

WordBloom uses English Zipf frequency values from `wordfreq` 3.1.1 to rank eligible OEWN lemmas.

- Project: https://github.com/rspeer/wordfreq
- Copyright and required attribution name: Copyright 2022 Robyn Speer
- Software license: Apache License 2.0
- Frequency data license: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- License text: https://creativecommons.org/licenses/by-sa/4.0/

The upstream `wordfreq` notice identifies additional frequency-data sources and attribution conditions. That notice is preserved verbatim at `THIRD_PARTY_NOTICES/wordfreq-NOTICE.md` and must accompany redistributed data.

## WordBloom modifications and data terms

WordBloom contributors made the following changes in 2026:

- selected the Open English WordNet 2025 core edition and excluded the separate proper-name dataset;
- lowercased and normalized eligible headwords;
- excluded multi-token and hyphenated forms under the documented filter;
- merged identical spellings across parts of speech;
- ranked candidates with `wordfreq` 3.1.1 English Zipf values, with alphabetical tie-breaking;
- selected 20,000 entries and emitted canonical and compact browser representations; and
- created an exact-lemma index map for migrating compatible decisions from the earlier list.

To the extent WordBloom contributors hold copyright or database rights in this selection, arrangement, or adaptation, those contributions to the covered data artifacts are offered under CC BY-SA 4.0. This does not relicense upstream material or grant rights that WordBloom contributors do not hold. Recipients must comply with all applicable upstream terms, including attribution, indication of modifications, preservation of notices, and share-alike requirements.

## Reproducibility record

`app/data/manifest.json` records the exact dataset ID, generation time, entry count, eligible count, source versions, and filters. `scripts/generate-word-data.py` contains the deterministic selection and ranking procedure.

Do not remove source attribution, license notices, modification notices, or the manifest when redistributing the data artifacts. Personal or educational use does not cancel applicable license conditions.

This document is a good-faith compliance summary, not legal advice. See `DISCLAIMER.md` and the controlling upstream texts in `THIRD_PARTY_NOTICES/`.
