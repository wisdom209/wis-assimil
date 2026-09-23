import json

with open("lessons.json", "r", encoding="utf-8") as f:
    data = json.load(f)

def fix_liaisons(obj):
    if isinstance(obj, str):
        return obj.replace("_", "‿")  # Replace _ with proper liaison char
    elif isinstance(obj, dict):
        return {k: fix_liaisons(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [fix_liaisons(item) for item in obj]
    return obj

data = fix_liaisons(data)

with open("lessons.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
