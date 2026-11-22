#!/usr/bin/env bash
# Firmware gate for the LifeLink tracker.
# Run from anywhere: bash scripts/verify.sh
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v pio >/dev/null 2>&1; then
  echo "verify: PlatformIO (pio) not found." >&2
  echo "verify: install it with: python -m pip install platformio" >&2
  exit 127
fi

echo "==> firmware build (esp32dev)"
pio run -d firmware

echo "==> native unit tests"
pio test -d firmware -e native

echo "==> static analysis"
pio check -d firmware --fail-on-defect high

CLANG_FORMAT="${CLANG_FORMAT:-clang-format}"
if ! command -v "$CLANG_FORMAT" >/dev/null 2>&1; then
  echo "verify: clang-format not found." >&2
  echo "verify: install it with: python -m pip install clang-format" >&2
  exit 127
fi
if ! "$CLANG_FORMAT" --version >/dev/null 2>&1; then
  echo "verify: $CLANG_FORMAT exists but cannot execute." >&2
  echo "verify: an OS application-control policy may be blocking it." >&2
  exit 127
fi

sources=()
while IFS= read -r file; do
  sources+=("$file")
done < <(git ls-files --cached --others --exclude-standard \
  'firmware/main/*.cpp' \
  'firmware/main/*.h' \
  'firmware/main/*.ino' \
  'firmware/include/*.h')

if [ "${#sources[@]}" -eq 0 ]; then
  echo "verify: no firmware sources found" >&2
  exit 1
fi

echo "==> clang-format check"
"$CLANG_FORMAT" --dry-run --Werror "${sources[@]}"

echo "VERIFY OK"
