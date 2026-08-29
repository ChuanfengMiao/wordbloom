# Data licenses and attribution

The MIT License in `LICENSE` applies to WordBloom's application code. It does not replace the licenses of the vocabulary data or upstream sources.

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
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- License text: https://creativecommons.org/licenses/by/4.0/

Open English WordNet incorporates material originating in Princeton WordNet. Preserve the upstream attribution requirements when redistributing the data.

## wordfreq

WordBloom uses English Zipf frequency values from `wordfreq` 3.1.1 to rank eligible OEWN lemmas.

- Project: https://github.com/rspeer/wordfreq
- Author/maintainer attribution: Robyn Speer and contributors
- Software license: Apache License 2.0
- Frequency data license: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- License text: https://creativecommons.org/licenses/by-sa/4.0/

Because the ranked WordBloom dataset uses these frequency data, redistribution and adaptations must preserve attribution and comply with the applicable CC BY-SA 4.0 share-alike terms. This file is an attribution notice, not legal advice.

## Reproducibility record

`app/data/manifest.json` records the exact dataset ID, generation time, entry count, eligible count, source versions, and filters. `scripts/generate-word-data.py` contains the deterministic selection and ranking procedure.

Do not remove source attribution, license notices, or the manifest when redistributing the data artifacts.
