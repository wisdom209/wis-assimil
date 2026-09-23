#!/usr/bin/env python3
"""
fix_ocr_dialogues.py
Removes OCR artifacts from French dialogue text in lessons.json
- Removes embedded footnote numbers (1-9 as standalone tokens)
- Fixes missing spaces after accented characters
- Fixes common merged-word patterns
"""

import json
import re
import sys
from pathlib import Path


def remove_footnote_numbers(text: str) -> str:
    """
    Remove standalone single/double digit numbers that are footnote references.
    These appear as isolated numbers between French words.
    
    Pattern: a number (1-99) surrounded by spaces or at word boundaries,
    where it's NOT part of a compound number or a legitimate number.
    """
    if not isinstance(text, str):
        return text
    
    # Remove standalone digits that appear between words
    # e.g., "est-ce que 2vous" -> "est-ce que vous"
    # e.g., "pas 3de montre" -> "pas de montre"
    # e.g., "midi 5 dix" -> "midi dix"
    # But NOT: "B-52", "vingt-deux", "dix-sept heures"
    
    # First, protect legitimate numbers by temporarily replacing them
    # Protect compound numbers like "vingt-deux", "dix-sept", etc.
    protected = []
    
    def protect_number(match):
        protected.append(match.group(0))
        return f"__PROTECTED_{len(protected)-1}__"
    
    # Protect numbers that are part of hyphenated compounds
    text = re.sub(r'\b\d+[-–]\d+\b', protect_number, text)
    # Protect numbers after letters like "B-52", "A-65"
    text = re.sub(r'[A-Za-z][-–]\d+', protect_number, text)
    # Protect "dix", "vingt", etc. followed by numbers (time expressions)
    # These are already words, so they're fine
    
    # Now remove standalone footnote numbers (1-2 digits between spaces)
    # These are numbers that appear as isolated tokens
    text = re.sub(r'\s+(\d{1,2})\s+(?=[a-zàâäéèêëïîôöùûüçA-ZÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ])', ' ', text)
    # Also handle number attached to next word: "2vous" -> "vous"
    text = re.sub(r'\s+(\d{1,2})(?=[a-zàâäéèêëïîôöùûüç])', ' ', text)
    # Handle number at start: "3de" -> "de"  
    text = re.sub(r'^(\d{1,2})(?=[a-zàâäéèêëïîôöùûüç])', '', text)
    
    # Restore protected numbers
    for i, num in enumerate(protected):
        text = text.replace(f"__PROTECTED_{i}__", num)
    
    return text


def fix_missing_spaces(text: str) -> str:
    """Fix common OCR spacing issues in French text."""
    if not isinstance(text, str):
        return text
    
    # Fix missing space after accented characters followed by lowercase
    # àmidi -> à midi
    # àcôté -> à côté
    text = re.sub(r'([àâäéèêëïîôöùûüçÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ])([a-zàâäéèêëïîôöùûüç])', r'\1 \2', text)
    
    # Fix common merged words (a + verb/noun)
    # atoujours -> a toujours
    # alastille -> à la Bastille (unlikely but possible)
    common_merges = {
        'atoujours': 'a toujours',
        'ala': 'à la',
        'ale': 'à le',  # rare, but possible
        'aun': 'à un',
        'aune': 'à une',
        'aqui': 'à qui',
        'aque': 'à que',
        'aquoi': 'à quoi',
        'ace': 'à ce',
        'acette': 'à cette',
        'aces': 'à ces',
        'amidi': 'à midi',
        'aminuit': 'à minuit',
        'agauche': 'à gauche',
        'adroite': 'à droite',
        'apied': 'à pied',
        'aparis': 'à Paris',
        'alondres': 'à Londres',
        'demain': 'de main',  # careful! "demain" is a word. Skip this.
        'dici': "d'ici",
        'dabord': "d'abord",
        'daccord': "d'accord",
        'dailleurs': "d'ailleurs",
        'daprès': "d'après",
        'dautant': "d'autant",
        'delle': "d'elle",
        'dentre': "d'entre",
        'dêtre': "d'être",
        'davoir': "d'avoir",
        'dun': "d'un",
        'dune': "d'une",
        'dune': "d'une",
        'jair': "j'ai",
        'jaime': "j'aime",
        'jai': "j'ai",
        'javais': "j'avais",
        'jaurais': "j'aurais",
        'jespère': "j'espère",
        'jarrive': "j'arrive",
        'jhabite': "j'habite",
        'jignore': "j'ignore",
        'jobtiens': "j'obtiens",
        'jy': "j'y",
        'jen': "j'en",
        'jelui': "je lui",
        'jela': "je la",
        'jele': "je le",
        'jeles': "je les",
        'jet': "j'et",  # unlikely
        'quavez': "qu'avez",
        'quest': "qu'est",
        'quil': "qu'il",
        'quelle': "qu'elle",
        'quon': "qu'on",
        'quun': "qu'un",
        'quune': "qu'une",
        'quelles': "qu'elles",
        'quils': "qu'ils",
        'quand': "qu'and",  # no, "quand" is a word. Skip.
        'sile': "s'il le",
        'sil': "s'il",
        'sils': "s'ils",
        'selle': "s'elle",  # unlikely
        'sest': "s'est",
        'sétait': "s'était",
        'sappeler': "s'appeler",
        'sappelle': "s'appelle",
        'sappelaient': "s'appelaient",
        'samuser': "s'amuser",
        'sarrêter': "s'arrêter",
        'sasseoir': "s'asseoir",
        'shabiller': "s'habiller",
        'soccuper': "s'occuper",
        'nont': "n'ont",
        'nest': "n'est",
        'nétait': "n'était",
        'na': "n'a",
        'navait': "n'avait",
        'navez': "n'avez",
        'navons': "n'avons",
        'nimporte': "n'importe",
        'nhésitez': "n'hésitez",
        'nhésitez': "n'hésitez",
        'lheure': "l'heure",
        'lhistoire': "l'histoire",
        'lhomme': "l'homme",
        'lhôtel': "l'hôtel",
        'lhabitude': "l'habitude",
        'lhiver': "l'hiver",
        'lété': "l'été",
        'lautomne': "l'automne",
        'lécole': "l'école",
        'léglise': "l'église",
        'lentrée': "l'entrée",
        'lentreprise': "l'entreprise",
        'lenfant': "l'enfant",
        'laffaire': "l'affaire",
        'lamie': "l'amie",
        'lautre': "l'autre",
        'larrivée': "l'arrivée",
        'lavenir': "l'avenir",
        'laccent': "l'accent",
        'laction': "l'action",
        'lactualité': "l'actualité",
        'laddition': "l'addition",
        'ladresse': "l'adresse",
        'lage': "l'âge",
        'laide': "l'aide",
        'lail': "l'ail",
        'lair': "l'air",
        'laisse': "l'aise",  # careful
        'lalimentation': "l'alimentation",
        'lalsace': "l'Alsace",
        'lamérique': "l'Amérique",
        'lamitié': "l'amitié",
        'lamour': "l'amour",
        'lan': "l'an",
        'langlais': "l'anglais",
        'langue': "l'angue",  # careful, "langue" is a word
        'lanimal': "l'animal",
        'lannée': "l'année",
        'lannonce': "l'annonce",
        'lappartement': "l'appartement",
        'lappel': "l'appel",
        'lapplication': "l'application",
        'laprès': "l'après",
        'lappartement': "l'appartement",
        'larrivée': "l'arrivée",
        'lart': "l'art",
        'lascenseur': "l'ascenseur",
        'laspect': "l'aspect",
        'lassassin': "l'assassin",
        'lassemblée': "l'assemblée",
        'lassurance': "l'assurance",
        'latelier': "l'atelier",
        'lattitude': "l'attitude",
        'laube': "l'aube",
        'lautorité': "l'autorité",
        'lautomne': "l'automne",
        'lautre': "l'autre",
        'lautorité': "l'autorité",
        'lavenue': "l'avenue",
        'lavenir': "l'avenir",
        'laverse': "l'averse",
        'lavion': "l'avion",
        'lavis': "l'avis",
        'lavocat': "l'avocat",
        'louverture': "l'ouverture",
    }
    
    # Only apply merges that don't break real words
    # Be very careful with this - only apply when the merged form isn't a real word
    # For safety, only apply the most obvious ones
    safe_merges = {
        'atoujours': 'a toujours',
        'amidi': 'à midi',
        'aminuit': 'à minuit',
        'agauche': 'à gauche',
        'adroite': 'à droite',
        'apied': 'à pied',
        'dici': "d'ici",
        'dabord': "d'abord",
        'daccord': "d'accord",
        'dailleurs': "d'ailleurs",
        'daprès': "d'après",
        'jarrive': "j'arrive",
        'jhabite': "j'habite",
        'jespère': "j'espère",
        'quil': "qu'il",
        'quelle': "qu'elle",
        'quon': "qu'on",
        'quun': "qu'un",
        'quune': "qu'une",
        'sil': "s'il",
        'sils': "s'ils",
        'sest': "s'est",
        'sétait': "s'était",
        'sappelle': "s'appelle",
        'nont': "n'ont",
        'nest': "n'est",
        'nétait': "n'était",
        'na': "n'a",
        'navez': "n'avez",
        'navons': "n'avons",
        'nimporte': "n'importe",
        'lheure': "l'heure",
        'lhistoire': "l'histoire",
        'lhomme': "l'homme",
        'lhabitude': "l'habitude",
        'lété': "l'été",
        'lautomne': "l'automne",
        'lautorité': "l'autorité",
        'lavenir': "l'avenir",
        'lautre': "l'autre",
        'lavion': "l'avion",
    }
    
    for wrong, right in safe_merges.items():
        # Only replace if it appears as a standalone word
        text = re.sub(r'\b' + re.escape(wrong) + r'\b', right, text)
    
    return text


def fix_liaison_markers(text: str) -> str:
    """
    Handle liaison markers. Replace ‿ with _ for consistency,
    or remove them if they're causing issues.
    """
    if not isinstance(text, str):
        return text
    
    # Replace Unicode undertie ‿ with underscore _ for consistency
    text = text.replace('‿', '_')
    
    return text


def clean_dialogue_text(text: str) -> str:
    """Apply all cleaning steps to dialogue text."""
    if not isinstance(text, str):
        return text
    
    text = remove_footnote_numbers(text)
    text = fix_missing_spaces(text)
    text = fix_liaison_markers(text)
    
    # Clean up any double spaces created by our fixes
    text = re.sub(r'  +', ' ', text)
    
    # Clean up space before punctuation (but keep French spacing rules)
    # In French, there IS a space before ? ! : ; — keep those
    # But remove space before . , 
    text = re.sub(r'\s+([.,])', r'\1', text)
    
    return text.strip()


def process_lesson(lesson: dict, changes_log: list) -> dict:
    """Process a single lesson, cleaning dialogue text."""
    lesson_id = lesson.get("id", "?")
    
    # Clean dialogue French and English text
    if "dialogue" in lesson:
        for i, line in enumerate(lesson["dialogue"]):
            if "french" in line:
                original = line["french"]
                cleaned = clean_dialogue_text(original)
                if cleaned != original:
                    changes_log.append(
                        f"Lesson {lesson_id}, dialogue line {i+1}: "
                        f"'{original[:60]}...' -> '{cleaned[:60]}...'"
                    )
                    line["french"] = cleaned
            
            if "english" in line:
                original = line["english"]
                cleaned = clean_dialogue_text(original)
                if cleaned != original:
                    line["english"] = cleaned
    
    # Clean notes content
    if "notes" in lesson:
        for i, note in enumerate(lesson["notes"]):
            if "content" in note:
                original = note["content"]
                cleaned = clean_dialogue_text(original)
                if cleaned != original:
                    changes_log.append(
                        f"Lesson {lesson_id}, note {i+1}: text cleaned"
                    )
                    note["content"] = cleaned
    
    # Clean new_words
    if "new_words" in lesson:
        for word_entry in lesson["new_words"]:
            if "french" in word_entry:
                word_entry["french"] = clean_dialogue_text(word_entry["french"])
            if "english" in word_entry:
                word_entry["english"] = clean_dialogue_text(word_entry["english"])
    
    # Clean exercises
    if "exercises" in lesson:
        for ex_type in ["translate", "fill"]:
            if ex_type in lesson["exercises"]:
                for ex in lesson["exercises"][ex_type]:
                    if "question" in ex:
                        ex["question"] = clean_dialogue_text(ex["question"])
                    if "full_answer" in ex:
                        ex["full_answer"] = clean_dialogue_text(ex["full_answer"])
    
    return lesson


def main():
    input_file = Path("lessons_cleaned.json")
    output_file = Path("lessons_ocr_fixed.json")
    log_file = Path("ocr_fix_log.txt")
    
    if not input_file.exists():
        print(f"Error: {input_file} not found.")
        print("Make sure you've run the first cleaning script first.")
        sys.exit(1)
    
    print(f"Reading {input_file}...")
    with open(input_file, "r", encoding="utf-8") as f:
        try:
            lessons = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON: {e}")
            sys.exit(1)
    
    print(f"Processing {len(lessons)} lessons for OCR artifacts...")
    
    changes_log = []
    fixed_lessons = []
    
    for lesson in lessons:
        fixed = process_lesson(lesson, changes_log)
        fixed_lessons.append(fixed)
    
    # Write output
    print(f"Writing fixed file to {output_file}...")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(fixed_lessons, f, ensure_ascii=False, indent=2)
    
    # Write log
    with open(log_file, "w", encoding="utf-8") as f:
        f.write(f"OCR Fix Log\n")
        f.write(f"{'='*60}\n\n")
        f.write(f"Total lessons processed: {len(lessons)}\n")
        f.write(f"Total changes made: {len(changes_log)}\n\n")
        
        if changes_log:
            f.write("Changes:\n")
            f.write("-"*60 + "\n")
            for change in changes_log:
                f.write(f"  • {change}\n")
        else:
            f.write("No OCR artifacts found.\n")
    
    print(f"\nDone!")
    print(f"  Fixed file: {output_file}")
    print(f"  Change log: {log_file}")
    print(f"  Total changes: {len(changes_log)}")
    
    if changes_log:
        print(f"\nSample changes:")
        for change in changes_log[:10]:
            print(f"  • {change}")
        if len(changes_log) > 10:
            print(f"  ... and {len(changes_log) - 10} more (see log)")


if __name__ == "__main__":
    main()
