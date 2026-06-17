#!/usr/bin/env python3
"""
Lightweight conference-page watcher for GitHub Actions.

It does not try to fully parse every CFP page, because conference websites are
heterogeneous and fragile. Instead it stores normalized page fingerprints and
keyword hits. When a source page changes, the workflow opens an issue so you can
manually verify the new official dates and edit data/conferences.json.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "conferences.json"
SNAPSHOT = ROOT / "data" / "snapshots.json"
REPORT = ROOT / "watch-report.md"

USER_AGENT = "chip-conf-countdown/0.1 (+GitHub Actions date watcher)"


def normalize(text: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", "", text, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def fetch(url: str) -> str:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=25) as resp:
        raw = resp.read()
    return raw.decode("utf-8", errors="replace")


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    conferences = load_json(DATA, [])
    snapshots = load_json(SNAPSHOT, {})
    new_snapshots = dict(snapshots)
    changes = []
    errors = []

    for conf in conferences:
        conf_id = conf["id"]
        watch = conf.get("watch", {})
        keywords = watch.get("keywords", [])
        for url in conf.get("sources", []):
            key = f"{conf_id}::{url}"
            try:
                normalized = normalize(fetch(url))
                page_hash = digest(normalized)
                keyword_state = {kw: (kw.lower() in normalized.lower()) for kw in keywords}
                previous = snapshots.get(key)
                current = {"hash": page_hash, "keywords": keyword_state, "checkedAt": int(time.time())}
                new_snapshots[key] = current
                if previous and (previous.get("hash") != page_hash or previous.get("keywords") != keyword_state):
                    changes.append((conf, url, previous, current))
            except Exception as exc:  # noqa: BLE001 - report and continue
                errors.append((conf, url, str(exc)))

    SNAPSHOT.write_text(json.dumps(new_snapshots, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    lines = ["# Conference source watch report", ""]
    if changes:
        lines.append("## Pages with changes")
        for conf, url, previous, current in changes:
            lines.append(f"- **{conf['name']} {conf['year']}** changed: {url}")
            lines.append(f"  - old hash: `{previous.get('hash')}`; new hash: `{current.get('hash')}`")
            changed_keywords = [kw for kw, hit in current.get("keywords", {}).items() if previous.get("keywords", {}).get(kw) != hit]
            if changed_keywords:
                lines.append(f"  - keyword-hit changes: {', '.join(changed_keywords)}")
    else:
        lines.append("No source-page changes detected.")

    if errors:
        lines.extend(["", "## Fetch errors"])
        for conf, url, err in errors:
            lines.append(f"- **{conf['name']} {conf['year']}**: {url} — `{err}`")

    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(REPORT.read_text(encoding="utf-8"))
    return 1 if changes else 0


if __name__ == "__main__":
    sys.exit(main())
