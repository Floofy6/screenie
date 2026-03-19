#!/usr/bin/env python3

from pathlib import Path
import sys


try:
    from PIL import Image
except Exception as exc:  # pragma: no cover - dependency failure path
    raise SystemExit(f"Pillow is required to build the Windows icon: {exc}") from exc


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = PROJECT_ROOT / "resources" / "icon.png"
TARGET_PATH = PROJECT_ROOT / "resources" / "icon.ico"
ICON_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def main() -> int:
    if not SOURCE_PATH.exists():
        print(f"Source icon not found: {SOURCE_PATH}", file=sys.stderr)
        return 1

    with Image.open(SOURCE_PATH) as image:
        rgba = image.convert("RGBA")
        rgba.save(TARGET_PATH, format="ICO", sizes=ICON_SIZES)

    print(f"Generated {TARGET_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
