#!/usr/bin/env bash
# Generate the five style concepts from docs/concepts/README.md in parallel.
# Usage: OPENAI_API_KEY=... scripts/concepts.sh [quality]   (default medium)
set -euo pipefail
cd "$(dirname "$0")/.."
Q="${1:-medium}"
SCENE=$(sed -n '/^> /{s/^> //;p;q}' docs/concepts/README.md)
names=(neon-pixel arcade-1989 toy-diorama flat-vector wasteland-comic)
i=0
sed -n '/^| 1 |/,/^| 5 |/p' docs/concepts/README.md | awk -F'|' '{print $4}' | sed 's/^ *//;s/ *$//' | while IFS= read -r suffix; do
  n=${names[$i]}; i=$((i+1))
  gpt-image -p "$SCENE $suffix" --size landscape --quality "$Q" -f "docs/concepts/style-0$i-$n.png" &
done
wait
ls -1 docs/concepts/*.png
