#!/usr/bin/env python3
"""
clean_lessons.py - Cleaning script for lessons.json
Fixes: trailing spaces in keys/values, French typography issues,
       inconsistent formatting, speaker field types, etc.
"""

import json
import re
import sys
from pathlib import Path


def clean_key(key: str) -> str:
    """Remove leading/trailing whitespace from JSON keys."""
    return key.strip()


def clean_string_value(value: str) -> str:
    """Remove leading/trailing whitespace from string values."""
    return value.strip()


def fix_french_typography(text: str) -> str:
    """Fix common French typography issues in text."""
    if not isinstance(text, str):
        return text

    # Fix spaces around hyphens in French words
    # "allez- vous" → "allez-vous"
    # "est- ce" → "est-ce"
    # But preserve legitimate hyphenated compound words
    text = re.sub(r'(\w)-\s+(\w)', r'\1-\2', text)

    # Fix double spaces (but preserve intentional spacing)
    text = re.sub(r'  +', ' ', text)

    text = re.sub(r'_', ' ', text)

    # Fix space before opening quote
    text = re.sub(r'\s+"', ' "', text)

    # Fix space after opening quote (if followed by letter)
    # But be careful not to break intentional formatting
    text = re.sub(r'"\s+([A-Za-zÀ-ÿ])', r'"\1', text)

    # Fix space before closing quote
    text = re.sub(r'([a-zà-ÿ.,;:!?)])\s+"', r'\1"', text)

    # Fix "s tarts" type issues (space inside a word - likely OCR error)
    # This is tricky, so we handle known patterns
    text = re.sub(r'\b(\w)\s+(\w{2,})\b(?=\s)', lambda m: _maybe_join_word(m), text)

    return text


def _maybe_join_word(match):
    """Carefully join words that might be split by OCR errors."""
    full = match.group(0)
    # Only join if it looks like a single word was split
    # Common patterns: single letter followed by common word endings
    part1, part2 = match.group(1), match.group(2)
    # If first part is a single character and second starts with lowercase
    if len(part1) == 1 and part2[0].islower():
        return part1 + part2
    return full


def fix_speaker_value(value):
    """Convert speaker values from string to int if possible."""
    if isinstance(value, str):
        value = value.strip()
        try:
            return int(value)
        except ValueError:
            return value
    return value


def clean_lesson(lesson: dict) -> dict:
    """Clean a single lesson object."""
    cleaned = {}

    for key, value in lesson.items():
        key = clean_key(key)

        if key == "speaker":
            cleaned[key] = fix_speaker_value(value)
        elif key == "id":
            # Ensure id is an integer
            if isinstance(value, str):
                cleaned[key] = int(value.strip())
            else:
                cleaned[key] = value
        elif isinstance(value, str):
            cleaned_value = clean_string_value(value)
            cleaned_value = fix_french_typography(cleaned_value)
            cleaned[key] = cleaned_value
        elif isinstance(value, list):
            cleaned[key] = clean_list(value, key)
        elif isinstance(value, dict):
            cleaned[key] = clean_dict_recursive(value)
        else:
            cleaned[key] = value

    return cleaned


def clean_list(lst: list, parent_key: str = "") -> list:
    """Clean a list of items."""
    cleaned = []
    for item in lst:
        if isinstance(item, dict):
            cleaned.append(clean_dict_recursive(item, parent_key))
        elif isinstance(item, str):
            val = clean_string_value(item)
            val = fix_french_typography(val)
            cleaned.append(val)
        elif isinstance(item, list):
            cleaned.append(clean_list(item, parent_key))
        else:
            cleaned.append(item)
    return cleaned


def clean_dict_recursive(d: dict, parent_key: str = "") -> dict:
    """Recursively clean a dictionary."""
    cleaned = {}
    for key, value in d.items():
        key = clean_key(key)

        if key == "speaker":
            cleaned[key] = fix_speaker_value(value)
        elif key == "id":
            if isinstance(value, str):
                try:
                    cleaned[key] = int(value.strip())
                except ValueError:
                    cleaned[key] = value.strip()
            else:
                cleaned[key] = value
        elif key == "position":
            # Ensure position is an integer
            if isinstance(value, str):
                try:
                    cleaned[key] = int(value.strip())
                except ValueError:
                    cleaned[key] = value.strip()
            else:
                cleaned[key] = value
        elif isinstance(value, str):
            cleaned_value = clean_string_value(value)
            cleaned_value = fix_french_typography(cleaned_value)
            cleaned[key] = cleaned_value
        elif isinstance(value, list):
            cleaned[key] = clean_list(value, key)
        elif isinstance(value, dict):
            cleaned[key] = clean_dict_recursive(value, key)
        else:
            cleaned[key] = value

    return cleaned


def validate_lesson(lesson: dict, index: int) -> list:
    """Validate a lesson and return list of warnings."""
    warnings = []
    lesson_id = lesson.get("id", index + 1)

    required_fields = ["id", "title", "type", "audio_file", "dialogue"]
    for field in required_fields:
        if field not in lesson:
            warnings.append(f"Lesson {lesson_id}: Missing required field '{field}'")

    # Validate dialogue
    if "dialogue" in lesson:
        for i, line in enumerate(lesson["dialogue"]):
            if not isinstance(line, dict):
                warnings.append(f"Lesson {lesson_id}, dialogue line {i}: Not a dict")
                continue
            for req in ["speaker", "french", "english"]:
                if req not in line:
                    warnings.append(f"Lesson {lesson_id}, dialogue line {i}: Missing '{req}'")

    # Validate exercises structure
    if "exercises" in lesson:
        exercises = lesson["exercises"]
        if "translate" in exercises:
            for i, ex in enumerate(exercises["translate"]):
                if "question" not in ex:
                    warnings.append(f"Lesson {lesson_id}, translate exercise {i}: Missing 'question'")
                if "answers" not in ex:
                    warnings.append(f"Lesson {lesson_id}, translate exercise {i}: Missing 'answers'")
        if "fill" in exercises:
            for i, ex in enumerate(exercises["fill"]):
                if "question" not in ex:
                    warnings.append(f"Lesson {lesson_id}, fill exercise {i}: Missing 'question'")
                if "blanks" not in ex:
                    warnings.append(f"Lesson {lesson_id}, fill exercise {i}: Missing 'blanks'")

    return warnings


def main():
    input_file = Path("lessons.json")
    output_file = Path("lessons_cleaned.json")
    report_file = Path("cleaning_report.txt")

    if not input_file.exists():
        print(f"Error: {input_file} not found.")
        sys.exit(1)

    print(f"Reading {input_file}...")
    with open(input_file, "r", encoding="utf-8") as f:
        try:
            lessons = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON: {e}")
            sys.exit(1)

    if not isinstance(lessons, list):
        print("Error: Expected a JSON array at the top level.")
        sys.exit(1)

    print(f"Found {len(lessons)} lessons. Cleaning...")

    all_warnings = []
    cleaned_lessons = []

    for i, lesson in enumerate(lessons):
        # Validate before cleaning
        warnings = validate_lesson(lesson, i)
        all_warnings.extend(warnings)

        # Clean the lesson
        cleaned = clean_lesson(lesson)
        cleaned_lessons.append(cleaned)

    # Write cleaned JSON
    print(f"Writing cleaned file to {output_file}...")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(cleaned_lessons, f, ensure_ascii=False, indent=2)

    # Write report
    with open(report_file, "w", encoding="utf-8") as f:
        f.write(f"Cleaning Report for {input_file}\n")
        f.write(f"{'=' * 50}\n\n")
        f.write(f"Total lessons processed: {len(lessons)}\n\n")

        if all_warnings:
            f.write(f"Warnings ({len(all_warnings)}):\n")
            f.write("-" * 30 + "\n")
            for w in all_warnings:
                f.write(f"  • {w}\n")
        else:
            f.write("No structural warnings found.\n")

        f.write(f"\nCleaned file written to: {output_file}\n")

    print(f"\nDone!")
    print(f"  Cleaned file: {output_file}")
    print(f"  Report:       {report_file}")
    if all_warnings:
        print(f"  Warnings:     {len(all_warnings)} (see report)")
    else:
        print(f"  No warnings.")


if __name__ == "__main__":
    main()
