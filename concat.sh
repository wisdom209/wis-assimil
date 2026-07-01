#!/bin/bash
# concat_codebase.sh – bundle your entire codebase into one text file
# Usage: ./concat_codebase.sh [output_file]

set -euo pipefail

# Default output file
OUTPUT="${1:-codebase_concat.txt}"

# Directories to exclude (prune from find)
EXCLUDE_DIRS=(
    ".git"
    "node_modules"
    "__pycache__"
    "venv"
    "env"
    ".venv"
    ".env"
    "dist"
    "build"
    "target"
    "out"
    "bin"
    "obj"
    "logs"
    "tmp"
    "coverage"
    ".idea"
    ".vscode"
    ".vs"
)

# Build prune arguments for find
PRUNE_ARGS=()
for dir in "${EXCLUDE_DIRS[@]}"; do
    PRUNE_ARGS+=( -not -path "*/$dir/*" )
done

# Find all regular files, excluding hidden files/dirs and the exclude dirs
# Then for each file, check if it's text, and if so, print its path and content
find . -type f \
    -not -path '*/\.*' \
    "${PRUNE_ARGS[@]}" \
    -print0 | while IFS= read -r -d '' file; do

    # Skip if file is binary (using mime‑type)
    mime=$(file -b --mime-type "$file" 2>/dev/null || echo "")
    if [[ ! "$mime" =~ ^text/ ]] && [[ "$mime" != "application/json" ]] && [[ "$mime" != "application/xml" ]]; then
        continue
    fi

    # Print a clear separator with the relative path
    echo "===== FILE: $file ====="
    echo ""

    # Output the file content (with a final newline if missing)
    cat "$file"
    echo ""
done > "$OUTPUT"

echo "All text files have been concatenated into: $OUTPUT"
