"""Build WordBloom's redistributable 20,000-lemma static dataset."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import wn
from wn.morphy import Morphy
from wordfreq import top_n_list, zipf_frequency


ELIGIBLE = re.compile(r"^[a-z]+(?:'[a-z]+)?$")
DATASET_ID = "oewn-2025-wordfreq-en-20k-v1"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("app/data/words.json"))
    parser.add_argument("--manifest", type=Path, default=Path("app/data/manifest.json"))
    parser.add_argument("--wn-data", type=Path, required=True)
    args = parser.parse_args()

    wn.config.data_directory = args.wn_data
    try:
        lexicon = wn.Wordnet("oewn:2025")
    except wn.Error:
        wn.download("oewn:2025")
        lexicon = wn.Wordnet("oewn:2025")

    lemma_form_count: dict[str, int] = {}
    for word in lexicon.words():
        lemma = word.lemma().strip().lower()
        forms = {form.strip().lower() for form in word.forms()}
        if not ELIGIBLE.fullmatch(lemma):
            continue
        lemma_form_count[lemma] = max(lemma_form_count.get(lemma, 0), len(forms))

    morphy = Morphy(lexicon)

    selected: list[tuple[str, float]] = []
    seen: set[str] = set()
    # Start from observed surface forms, then resolve ordinary inflections to
    # their OEWN headword. This avoids ranking rare homographs such as the noun
    # "are" by the very frequent verb form "are".
    for form in top_n_list("en", 120_000, ascii_only=True):
        form = form.lower()
        if not ELIGIBLE.fullmatch(form) or (len(form) == 1 and form not in {"a", "i"}):
            continue
        candidate_map = morphy(form)
        candidates = {
            lemma
            for lemmas in candidate_map.values()
            for lemma in lemmas
            if ELIGIBLE.fullmatch(lemma)
        }
        form_score = zipf_frequency(form, "en")
        if candidates:
            derived = [
                candidate
                for candidate in candidates
                if candidate != form
                and (len(candidate) > 1 or candidate in {"a", "i"})
                and zipf_frequency(candidate, "en") >= form_score - 0.6
            ]
            if derived:
                lemma = max(
                    derived,
                    key=lambda candidate: (
                        lemma_form_count.get(candidate, 1),
                        zipf_frequency(candidate, "en"),
                        -len(candidate),
                        candidate,
                    ),
                )
            else:
                lemma = form
        else:
            # WordNet intentionally focuses on open-class vocabulary; retain
            # common closed-class words such as "the" and "of" directly.
            lemma = form
        lemma_bases = {
            base
            for bases in morphy(lemma).values()
            for base in bases
            if base != lemma
        }
        if lemma_bases & seen:
            continue
        if lemma in seen:
            continue
        seen.add(lemma)
        selected.append((lemma, round(form_score, 2)))
        if len(selected) == 20_000:
            break
    if len(selected) != 20_000:
        raise RuntimeError(f"Expected 20,000 lemmas, found {len(selected)}")

    entries = [
        {"id": index, "lemma": lemma, "rank": index + 1, "zipf": score}
        for index, (lemma, score) in enumerate(selected)
    ]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    manifest = {
        "datasetId": DATASET_ID,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "entryCount": len(entries),
        "sources": [
            {
                "name": "Open English WordNet",
                "version": "2025",
                "license": "CC BY 4.0 with Princeton WordNet attribution",
                "url": "https://en-word.net/downloads",
            },
            {
                "name": "wordfreq",
                "version": importlib.metadata.version("wordfreq"),
                "license": "Apache-2.0 code; CC BY-SA 4.0 data",
                "url": "https://github.com/rspeer/wordfreq",
            },
        ],
        "filters": [
            "Open English WordNet 2025 core lemmas only",
            "lowercase single-token alphabetic headwords",
            "one internal apostrophe allowed; hyphenated compounds excluded because wordfreq tokenizes them as phrases",
            "identical spellings merged across parts of speech",
            "surface forms resolved to OEWN headwords, preferring morphological paradigms",
            "descending frequency of each lemma's first observed wordfreq form",
        ],
    }
    args.manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
