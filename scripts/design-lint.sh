#!/usr/bin/env bash
# Fails on common AI-slop tells in the web UI source.
# Usage: bash scripts/design-lint.sh [apps/web]
set -u

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SRC="${1:-apps/web}"
fail=0

mapfile -t files < <(
  git ls-files --cached --others --exclude-standard -- "$SRC" \
    | grep -E '\.(ts|tsx|css)$' \
    | grep -vE '(\.test\.|/e2e/|/prisma/|/node_modules/|/\.next/)'
)

if [ "${#files[@]}" -eq 0 ]; then
  echo "design-lint: no source files found under $SRC" >&2
  exit 2
fi

scan () {
  local description="$1"
  local pattern="$2"
  local out
  out="$(grep -nE "$pattern" "${files[@]}" 2>/dev/null | head -5)"
  if [ -n "$out" ]; then
    echo "FAIL: $description"
    echo "$out"
    fail=1
  fi
}

scan_i () {
  local description="$1"
  local pattern="$2"
  local out
  out="$(grep -niE "$pattern" "${files[@]}" 2>/dev/null | head -5)"
  if [ -n "$out" ]; then
    echo "FAIL: $description"
    echo "$out"
    fail=1
  fi
}

scan "gradient decoration" 'bg-gradient|bg-linear|text-transparent.*bg-clip-text'
scan "glow or heavy shadow" 'shadow-2xl|drop-shadow-2xl|shadow-\[0_0'
scan "oversized radius" 'rounded-3xl|rounded-\[(2[4-9]|[3-9][0-9])px\]'
scan "glassmorphism" 'backdrop-blur'
scan_i "marketing copy" 'seamless|unlock|elevate|streamline|empower|supercharge|revolutioni[sz]e|effortless|oops'
scan_i "placeholder data" 'lorem|john doe|asdf|AA:BB:CC'
scan "arbitrary colour utility" '(bg|text|border)-\[#[0-9a-fA-F]{3,8}\]'

# Raw hex is allowed only in the token file and in files that must render
# without the app stylesheet or that require literal colour values.
hex_files=()
for file in "${files[@]}"; do
  case "$file" in
    */app/globals.css|*/app/global-error.tsx|*/app/manifest.ts) continue ;;
  esac
  hex_files+=("$file")
done
if [ "${#hex_files[@]}" -gt 0 ]; then
  hex_out="$(grep -nE '#[0-9a-fA-F]{6}\b' "${hex_files[@]}" 2>/dev/null | grep -v 'themeColor' | head -5)"
  if [ -n "${hex_out:-}" ]; then
    echo "FAIL: raw hex outside tokens"
    echo "$hex_out"
    fail=1
  fi
fi

# Emoji require a PCRE-capable grep; skip honestly when unavailable.
if grep -qP '' /dev/null 2>/dev/null; then
  emoji_out="$(grep -nP '[\x{1F300}-\x{1FAFF}]' "${files[@]}" 2>/dev/null | head -5)"
  if [ -n "${emoji_out:-}" ]; then
    echo "FAIL: emoji in UI source"
    echo "$emoji_out"
    fail=1
  fi
else
  echo "SKIP: emoji check (grep -P is unavailable)"
fi

if [ "$fail" -eq 0 ]; then
  echo "design-lint OK ($SRC, ${#files[@]} files)"
fi
exit "$fail"
