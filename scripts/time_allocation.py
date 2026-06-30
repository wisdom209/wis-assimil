import json

# Load your existing writing_tasks.json
with open('writing_tasks.json', 'r', encoding='utf-8') as f:
    tasks = json.load(f)

# Add the time field based on lesson_id
for task in tasks:
    lesson_id = task['lesson_id']
    if 1 <= lesson_id <= 50:
        task['time_allocation_minutes'] = None
    elif 51 <= lesson_id <= 75:
        task['time_allocation_minutes'] = 20
    else:  # 76-100
        task['time_allocation_minutes'] = 25

# Save the updated file (you can overwrite the original or save a new one)
with open('writing_tasks_updated.json', 'w', encoding='utf-8') as f:
    json.dump(tasks, f, indent=2, ensure_ascii=False)

print("✅ Updated file saved as 'writing_tasks_updated.json'")
