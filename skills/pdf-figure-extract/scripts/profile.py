#!/usr/bin/env python3
"""
PDF fingerprint + profile registry manager.

Subcommands:
  fingerprint <pdf>             Generate + print fingerprint JSON, try match
  match <fingerprint.json>      Match against registry, print best profile
  save <profile.json>           Add/update profile in registry
  update-stats <name> --success Update encounter count + success rate
  list                          Show all registered profiles
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

import fitz

REGISTRY_PATH = Path(__file__).parent.parent / "data" / "profiles.json"


# ============================================================================
# Fingerprinting
# ============================================================================

def fingerprint(pdf_path: str) -> dict:
    """
    Generate a lightweight fingerprint for a PDF.
    """
    doc = fitz.open(pdf_path)
    meta = doc.metadata or {}

    page1_text = doc[0].get_text() if len(doc) > 0 else ""
    page_size = [doc[0].rect.width, doc[0].rect.height] if len(doc) > 0 else [0, 0]

    # Detect dominant language from first page
    hangul_count = sum(1 for c in page1_text if "가" <= c <= "힣")
    ascii_count = sum(1 for c in page1_text if c.isascii() and c.isalpha())
    if hangul_count > ascii_count * 0.3:
        lang = "ko"
    elif ascii_count > 10:
        lang = "en"
    else:
        lang = "unknown"

    fp = {
        "producer": meta.get("producer", "") or "",
        "creator": meta.get("creator", "") or "",
        "title": meta.get("title", "") or "",
        "page_size_pt": [round(page_size[0], 1), round(page_size[1], 1)],
        "page_count": len(doc),
        "first_page_header": page1_text[:300].strip(),
        "first_page_tail": page1_text[-200:].strip() if len(page1_text) > 200 else "",
        "dominant_language": lang,
    }

    # Generate short hash for quick equality checks
    h_source = (
        fp["producer"] + "|" + fp["creator"] + "|" +
        str(fp["page_size_pt"]) + "|" + fp["first_page_header"][:100]
    )
    fp["hash"] = hashlib.sha256(h_source.encode()).hexdigest()[:16]

    doc.close()
    return fp


# ============================================================================
# Registry I/O
# ============================================================================

def load_registry() -> dict:
    if not REGISTRY_PATH.exists():
        return {"version": "1.0", "profiles": {}}
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_registry(reg: dict):
    """
    Atomic write to avoid corruption when multiple subagents race.
    Writes to a temp file in the same directory, then renames.
    """
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    reg["last_updated"] = date.today().isoformat()
    tmp_path = REGISTRY_PATH.with_suffix(".json.tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(reg, f, indent=2, ensure_ascii=False)
    # On Windows, os.replace overwrites atomically
    os.replace(tmp_path, REGISTRY_PATH)


# ============================================================================
# Profile matching
# ============================================================================

def match_profile(fp: dict, reg: dict) -> tuple:
    """
    Try to match fingerprint against registered profiles.
    Returns (best_profile_name, confidence 0-1) or (None, 0).
    """
    best_name = None
    best_score = 0.0

    for name, profile in reg.get("profiles", {}).items():
        score = score_match(fp, profile.get("match", {}))
        if score > best_score:
            best_score = score
            best_name = name

    return best_name, best_score


def score_match(fp: dict, match_rules: dict) -> float:
    """
    Score a fingerprint against a profile's match rules.
    Each rule contributes a fraction; final score in [0, 1].
    """
    total_weight = 0.0
    passed_weight = 0.0

    # Producer regex
    if "metadata_producer_regex" in match_rules:
        total_weight += 3.0
        patterns = match_rules["metadata_producer_regex"]
        if any(re.search(p, fp["producer"], re.IGNORECASE) for p in patterns):
            passed_weight += 3.0

    # Header text contains
    if "header_text_contains" in match_rules:
        total_weight += 2.0
        keywords = match_rules["header_text_contains"]
        hits = sum(1 for k in keywords if k.lower() in fp["first_page_header"].lower())
        if hits > 0:
            passed_weight += 2.0 * min(hits / len(keywords), 1.0)

    # Page size
    if "page_size_pt" in match_rules:
        total_weight += 1.0
        expected = match_rules["page_size_pt"]
        actual = fp["page_size_pt"]
        if abs(expected[0] - actual[0]) < 5 and abs(expected[1] - actual[1]) < 5:
            passed_weight += 1.0

    # Language
    if "language" in match_rules:
        total_weight += 1.0
        if match_rules["language"] == fp["dominant_language"]:
            passed_weight += 1.0

    if total_weight == 0:
        return 0.0
    return passed_weight / total_weight


# ============================================================================
# Profile update
# ============================================================================

def update_stats(profile_name: str, success: bool):
    reg = load_registry()
    profile = reg.get("profiles", {}).get(profile_name)
    if not profile:
        print(f"Profile not found: {profile_name}", file=sys.stderr)
        return
    stats = profile.setdefault("stats", {})
    stats["encountered_count"] = stats.get("encountered_count", 0) + 1
    stats["last_seen"] = date.today().isoformat()
    # Exponential moving average, alpha=0.3
    prev = stats.get("success_rate", 1.0 if success else 0.0)
    new_rate = 0.3 * (1.0 if success else 0.0) + 0.7 * prev
    stats["success_rate"] = round(new_rate, 3)
    save_registry(reg)
    print(f"Updated {profile_name}: count={stats['encountered_count']}, "
          f"success_rate={stats['success_rate']}")


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("fingerprint")
    p1.add_argument("pdf")
    p1.add_argument("--match", action="store_true", help="Also match against registry")

    p2 = sub.add_parser("match")
    p2.add_argument("fingerprint_json")

    p3 = sub.add_parser("save")
    p3.add_argument("profile_json")

    p4 = sub.add_parser("update-stats")
    p4.add_argument("name")
    p4.add_argument("--success", choices=["true", "false"], required=True)

    p5 = sub.add_parser("list")

    args = parser.parse_args()

    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    if args.cmd == "fingerprint":
        fp = fingerprint(args.pdf)
        output = {"fingerprint": fp}
        if args.match:
            reg = load_registry()
            name, conf = match_profile(fp, reg)
            output["match"] = {"profile_name": name, "confidence": round(conf, 3)}
            if name and conf >= 0.8:
                output["profile"] = reg["profiles"][name]
        print(json.dumps(output, indent=2, ensure_ascii=False))

    elif args.cmd == "match":
        with open(args.fingerprint_json, "r", encoding="utf-8") as f:
            fp = json.load(f)
        reg = load_registry()
        name, conf = match_profile(fp, reg)
        result = {"profile_name": name, "confidence": round(conf, 3)}
        if name:
            result["profile"] = reg["profiles"][name]
        print(json.dumps(result, indent=2, ensure_ascii=False))

    elif args.cmd == "save":
        with open(args.profile_json, "r", encoding="utf-8") as f:
            profile = json.load(f)
        name = profile.get("name") or profile.get("display_name")
        if not name:
            print("Profile must have 'name' field", file=sys.stderr)
            sys.exit(1)
        reg = load_registry()
        reg.setdefault("profiles", {})[name] = profile
        save_registry(reg)
        print(f"Saved profile: {name}")

    elif args.cmd == "update-stats":
        update_stats(args.name, args.success == "true")

    elif args.cmd == "list":
        reg = load_registry()
        for name, prof in reg.get("profiles", {}).items():
            s = prof.get("stats", {})
            print(f"- {name}: count={s.get('encountered_count', 0)}, "
                  f"success={s.get('success_rate', '?')}, "
                  f"last={s.get('last_seen', '?')}")


if __name__ == "__main__":
    main()
