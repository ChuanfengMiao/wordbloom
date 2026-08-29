"""Build WordBloom's redistributable 20,000-lemma static dataset."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import wn
from wordfreq import zipf_frequency


ELIGIBLE = re.compile(r"^[a-z]+(?:'[a-z]+)?$")
DATASET_ID = "oewn-2025-wordfreq-en-20k-v2"
OEWN_URL = "https://en-word.net/downloads/english-wordnet-2025.xml.gz"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("app/data/words.json"))
    parser.add_argument("--lemmas", type=Path, default=Path("app/data/lemmas.json"))
    parser.add_argument("--manifest", type=Path, default=Path("app/data/manifest.json"))
    parser.add_argument("--wn-data", type=Path, required=True)
    args = parser.parse_args()

    wn.config.data_directory = args.wn_data
    try:
        lexicon = wn.Wordnet("oewn:2025")
    except wn.Error:
        # The wn project index can lag OEWN's annual releases, so install the
        # official core-only LMF artifact directly from the publisher.
        wn.download(OEWN_URL)
        lexicon = wn.Wordnet("oewn:2025")

    eligible_lemmas: set[str] = set()
    for word in lexicon.words():
        lemma = word.lemma().strip().lower()
        if not ELIGIBLE.fullmatch(lemma) or (len(lemma) == 1 and lemma not in {"a", "i"}):
            continue
        eligible_lemmas.add(lemma)

    # Every candidate originates in the OEWN 2025 core lexicon. Rank the
    # normalized lemmas directly with wordfreq, then use alphabetical order as
    # the deterministic tie-breaker required by the product contract.
    ranked = sorted(
        ((lemma, round(zipf_frequency(lemma, "en"), 2)) for lemma in eligible_lemmas),
        key=lambda item: (-item[1], item[0]),
    )
    selected = ranked[:20_000]
    if len(selected) != 20_000:
        raise RuntimeError(f"Expected 20,000 lemmas, found {len(selected)}")

    entries = [
        {"id": index, "lemma": lemma, "rank": index + 1, "zipf": score}
        for index, (lemma, score) in enumerate(selected)
    ]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    args.lemmas.parent.mkdir(parents=True, exist_ok=True)
    args.lemmas.write_text(
        json.dumps([entry["lemma"] for entry in entries], ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    manifest = {
        "datasetId": DATASET_ID,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "entryCount": len(entries),
        "eligibleLemmaCount": len(eligible_lemmas),
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
            "every entry is a lemma in the Open English WordNet 2025 core lexicon",
            "descending wordfreq Zipf score with alphabetical tie-breaking",
        ],
    }
    args.manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
