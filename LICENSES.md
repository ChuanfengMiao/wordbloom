# Repository license map

WordBloom is a mixed-license repository. No single license covers every file.

## WordBloom-authored code and documentation

Original application code, tests, build configuration, and project documentation are licensed under the MIT License in `LICENSE`, except where a file is identified below or carries a different notice.

## Vocabulary data and derived artifacts

These files incorporate, select, arrange, transform, or map third-party-derived lexical and frequency data and are expressly excluded from the MIT grant:

- `app/data/words.json`
- `app/data/lemmas.json`
- `app/data/manifest.json`
- `app/data/legacy-v1-map.json`

They incorporate Open English WordNet material licensed under CC BY 4.0 and ultimately derived from Princeton WordNet under its own license notice. Their ranking and selection use `wordfreq` frequency data distributed under CC BY-SA 4.0 and subject to the attributions in the upstream `wordfreq` notice.

To the extent WordBloom contributors hold rights in the selection, arrangement, transformations, or migration mapping, those contributions are offered under CC BY-SA 4.0. Upstream material remains governed by its upstream terms. Nothing in this repository grants rights that its contributors do not possess.

The controlling texts and notices are preserved in:

- `THIRD_PARTY_NOTICES/open-english-wordnet-LICENSE.md`
- `THIRD_PARTY_NOTICES/open-english-wordnet-WNDB_License.txt`
- `THIRD_PARTY_NOTICES/CC-BY-4.0.txt`
- `THIRD_PARTY_NOTICES/wordfreq-NOTICE.md`
- `THIRD_PARTY_NOTICES/wordfreq-LICENSE.txt`
- `THIRD_PARTY_NOTICES/CC-BY-SA-4.0.txt`

`DATA_LICENSES.md` provides the attribution, source record, and modification statement for this distribution. `NOTICE` provides a compact notice that should accompany copies. `DISCLAIMER.md` describes important limitations.

If this summary conflicts with an upstream license text, the applicable upstream text controls. This license map is not legal advice.
