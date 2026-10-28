"""Whole-file state writes. A truncating `Path.write_text` leaves a window where a reader that does
not hold the writer's lock sees an empty file (JSONDecodeError in ClaimScanCacheTest, 8 of 150 loaded
runs; it refused a Gem release). Stage the content beside the target and swap it in atomically."""
import os
import uuid
from pathlib import Path


def atomic_write_text(path, text: str, encoding: str = "utf-8") -> None:
    # A symlinked state file must keep pointing at its target: replace the target, never the link.
    path = Path(os.path.realpath(path))
    staged = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp")
    try:
        staged.write_text(text, encoding=encoding)
        os.replace(staged, path)
    finally:
        staged.unlink(missing_ok=True)
