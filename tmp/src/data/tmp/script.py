import json
import os
import language_tool_python
from tqdm import tqdm   # optional, for progress bar (install with: pip install tqdm)

def correct_french(text: str, tool: language_tool_python.LanguageTool) -> str:
    """
    Correct a French sentence using LanguageTool.
    Returns the corrected text, or the original if an error occurs.
    """
    if not text or not isinstance(text, str):
        return text
    try:
        matches = tool.check(text)
        corrected = language_tool_python.utils.correct(text, matches)
        return corrected
    except Exception as e:
        print(f"Error correcting: {text}\n{e}")
        return text

def main(input_file: str, output_file: str):
    if not os.path.isfile(input_file):
        print(f"Error: Input file '{input_file}' not found.")
        return

    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if not isinstance(data, list):
        print("Error: Root JSON should be a list of lessons.")
        return

    # Initialize LanguageTool for French
    print("Loading LanguageTool for French...")
    tool = language_tool_python.LanguageTool('fr')
    print("LanguageTool ready.")

    total_dialogues = 0
    corrected_count = 0

    # Process each lesson
    for lesson in tqdm(data, desc="Processing lessons"):
        if 'dialogue' not in lesson or not isinstance(lesson['dialogue'], list):
            continue
        for entry in lesson['dialogue']:
            if 'french' in entry and isinstance(entry['french'], str):
                total_dialogues += 1
                original = entry['french']
                corrected = correct_french(original, tool)
                if corrected != original:
                    entry['french'] = corrected
                    corrected_count += 1

    # Write the corrected data
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Correction complete.")
    print(f"Total dialogues processed: {total_dialogues}")
    print(f"Dialogues corrected: {corrected_count}")
    print(f"Corrected JSON saved to '{output_file}'.")

if __name__ == '__main__':
    input_filename = 'lessons.json'
    output_filename = 'lessons_corrected.json'
    main(input_filename, output_filename)
