#!/usr/bin/env python3
"""
merge_all.py
Merges corrected dialogues, writing tasks, and speaking tasks
into the main lessons.json file.

Usage:
    python3 merge_all.py

Expected file structure in the same directory:
    lessons.json              (original or cleaned)
    dialogues_1_10.json
    dialogues_11_20.json
    dialogues_21_40.json
    dialogues_41_60.json
    dialogues_61_80.json
    dialogues_81_100.json
    writing.json
    speaking.json

Output:
    lessons_final.json
    merge_report.txt
"""

import json
import sys
from pathlib import Path
from collections import OrderedDict


# ──────────────────────────────────────────────
# 1. STRUCTURAL CLEANING (keys, types, spacing)
# ──────────────────────────────────────────────

def clean_key(key: str) -> str:
    """Strip whitespace from JSON keys."""
    return key.strip()


def clean_value(value):
    """Recursively clean string values (strip whitespace)."""
    if isinstance(value, str):
        return value.strip()
    elif isinstance(value, dict):
        return {clean_key(k): clean_value(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [clean_value(item) for item in value]
    return value


def fix_speaker(value):
    """Convert speaker from string to int if possible."""
    if isinstance(value, str):
        value = value.strip()
        try:
            return int(value)
        except ValueError:
            return value
    return value


def fix_id(value):
    """Ensure lesson id is an integer."""
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return value
    return value


def structural_clean(obj):
    """
    Recursively clean an entire JSON structure:
    - Strip keys and string values
    - Convert speaker to int
    - Convert id/position to int
    """
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            k = clean_key(k)
            if k == "speaker":
                cleaned[k] = fix_speaker(v)
            elif k in ("id", "lesson_id", "position"):
                cleaned[k] = fix_id(v)
            else:
                cleaned[k] = structural_clean(v)
        return cleaned
    elif isinstance(obj, list):
        return [structural_clean(item) for item in obj]
    elif isinstance(obj, str):
        return obj.strip()
    return obj


# ──────────────────────────────────────────────
# 2. LOAD HELPERS
# ──────────────────────────────────────────────

def load_json(path: Path, label: str):
    """Load a JSON file with error handling."""
    if not path.exists():
        print(f"  ⚠  {label}: {path} not found — skipping.")
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"  ✓  {label}: loaded {path.name}")
        return data
    except json.JSONDecodeError as e:
        print(f"  ✗  {label}: JSON error in {path.name}: {e}")
        return None


def load_dialogue_chunks(directory: Path):
    """Load all dialogue chunk files and merge into one dict keyed by lesson_id."""
    chunk_files = sorted(directory.glob("dialogues_*.json"))
    all_dialogues = {}

    for chunk_path in chunk_files:
        data = load_json(chunk_path, f"Dialogue chunk")
        if data is None:
            continue
        for entry in data:
            lid = entry.get("lesson_id")
            if lid is not None:
                all_dialogues[int(lid)] = entry.get("dialogue", [])

    print(f"  ✓  Total corrected dialogues loaded: {len(all_dialogues)}")
    return all_dialogues


# ──────────────────────────────────────────────
# 3. MERGE LOGIC
# ──────────────────────────────────────────────

def merge_everything(lessons, dialogues_map, writing_map, speaking_map):
    """
    Merge corrected dialogues, writing tasks, and speaking tasks
    into the lessons list.
    """
    stats = {
        "dialogues_replaced": 0,
        "writing_added": 0,
        "speaking_added": 0,
        "lessons_processed": 0,
        "warnings": [],
    }

    merged = []

    for lesson in lessons:
        lesson = structural_clean(lesson)
        lid = lesson.get("id")

        if lid is None:
            stats["warnings"].append(f"Lesson at index has no 'id' — skipped.")
            merged.append(lesson)
            continue

        stats["lessons_processed"] += 1

        # ── Replace dialogue ──
        if lid in dialogues_map:
            lesson["dialogue"] = dialogues_map[lid]
            stats["dialogues_replaced"] += 1

        # ── Add writing task ──
        if lid in writing_map:
            lesson["writing_task"] = writing_map[lid]
            stats["writing_added"] += 1

        # ── Add speaking task ──
        if lid in speaking_map:
            lesson["speaking_task"] = speaking_map[lid]
            stats["speaking_added"] += 1

        merged.append(lesson)

    return merged, stats


# ──────────────────────────────────────────────
# 4. VALIDATION
# ──────────────────────────────────────────────

def validate_merged(lessons):
    """Run basic validation on the merged output."""
    issues = []

    for i, lesson in enumerate(lessons):
        lid = lesson.get("id", f"index {i}")

        # Check required fields
        for field in ["id", "title", "type", "dialogue"]:
            if field not in lesson:
                issues.append(f"Lesson {lid}: missing '{field}'")

        # Check dialogue structure
        dialogue = lesson.get("dialogue", [])
        for j, line in enumerate(dialogue):
            if not isinstance(line, dict):
                issues.append(f"Lesson {lid}, dialogue line {j}: not a dict")
                continue
            for req in ["speaker", "french", "english"]:
                if req not in line:
                    issues.append(f"Lesson {lid}, dialogue line {j}: missing '{req}'")
            if "speaker" in line and not isinstance(line["speaker"], int):
                issues.append(f"Lesson {lid}, dialogue line {j}: speaker is not int")

        # Check writing task if present
        wt = lesson.get("writing_task")
        if wt:
            for req in ["lesson_id", "title", "phase", "writing_task_type",
                        "grammar_focus", "word_count_target", "task_description"]:
                if req not in wt:
                    issues.append(f"Lesson {lid}: writing_task missing '{req}'")

        # Check speaking task if present
        st = lesson.get("speaking_task")
        if st:
            for req in ["type", "description", "duration_minutes",
                        "recording_required", "instructions", "focus_points"]:
                if req not in st:
                    issues.append(f"Lesson {lid}: speaking_task missing '{req}'")

    return issues


# ──────────────────────────────────────────────
# 5. MAIN
# ──────────────────────────────────────────────

def main():
    base_dir = Path(".")

    # Determine source file
    source_candidates = ["lessons_cleaned.json", "lessons.json"]
    source_path = None
    for name in source_candidates:
        p = base_dir / name
        if p.exists():
            source_path = p
            break

    if source_path is None:
        print("✗  No lessons.json or lessons_cleaned.json found.")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  MERGE SCRIPT")
    print(f"{'='*60}\n")

    # ── Load everything ──
    print("Loading files...\n")

    lessons_raw = load_json(source_path, "Lessons (source)")
    if lessons_raw is None:
        sys.exit(1)

    dialogues_map = load_dialogue_chunks(base_dir)

    writing_raw = load_json(base_dir / "writing.json", "Writing tasks")
    speaking_raw = load_json(base_dir / "speaking.json", "Speaking tasks")

    # Build lookup maps for writing and speaking
    writing_map = {}
    if writing_raw:
        for entry in writing_raw:
            lid = entry.get("lesson_id")
            if lid is not None:
                writing_map[int(lid)] = structural_clean(entry)

    speaking_map = {}
    if speaking_raw:
        for entry in speaking_raw:
            lid = entry.get("lesson_id")
            if lid is not None:
                speaking_map[int(lid)] = structural_clean(entry.get("speaking_task", entry))

    print(f"\n  Writing tasks loaded: {len(writing_map)}")
    print(f"  Speaking tasks loaded: {len(speaking_map)}")

    # ── Structural clean on source lessons ──
    print("\nStructural cleaning...\n")
    lessons = structural_clean(lessons_raw)
    print(f"  ✓  Cleaned {len(lessons)} lessons structurally.")

    # ── Merge ──
    print("\nMerging...\n")
    merged, stats = merge_everything(lessons, dialogues_map, writing_map, speaking_map)

    print(f"  Lessons processed:      {stats['lessons_processed']}")
    print(f"  Dialogues replaced:     {stats['dialogues_replaced']}")
    print(f"  Writing tasks added:    {stats['writing_added']}")
    print(f"  Speaking tasks added:   {stats['speaking_added']}")

    # ── Validate ──
    print("\nValidating...\n")
    issues = validate_merged(merged)

    if issues:
        print(f"  ⚠  {len(issues)} validation issue(s) found:")
        for issue in issues[:20]:
            print(f"    • {issue}")
        if len(issues) > 20:
            print(f"    ... and {len(issues) - 20} more.")
    else:
        print("  ✓  No validation issues found.")

    # ── Write output ──
    output_path = base_dir / "lessons_final.json"
    print(f"\nWriting output to {output_path}...\n")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    # ── Write report ──
    report_path = base_dir / "merge_report.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(f"Merge Report\n")
        f.write(f"{'='*60}\n\n")
        f.write(f"Source file:            {source_path.name}\n")
        f.write(f"Lessons processed:      {stats['lessons_processed']}\n")
        f.write(f"Dialogues replaced:     {stats['dialogues_replaced']}\n")
        f.write(f"Writing tasks added:    {stats['writing_added']}\n")
        f.write(f"Speaking tasks added:   {stats['speaking_added']}\n\n")

        if stats["warnings"]:
            f.write(f"Warnings:\n")
            for w in stats["warnings"]:
                f.write(f"  • {w}\n")
            f.write("\n")

        if issues:
            f.write(f"Validation Issues ({len(issues)}):\n")
            for issue in issues:
                f.write(f"  • {issue}\n")
        else:
            f.write("No validation issues.\n")

        f.write(f"\nOutput: {output_path.name}\n")

    print(f"  ✓  Output:  {output_path}")
    print(f"  ✓  Report:  {report_path}")
    print(f"\n{'='*60}")
    print(f"  DONE")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()