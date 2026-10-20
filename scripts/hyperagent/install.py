#!/usr/bin/env python3
"""Install the managed CLI and mappings without opening OAuth configuration."""
import argparse
import os
from pathlib import Path
import runpy
import tempfile


def install(prefix: Path) -> Path:
    source = Path(__file__).resolve().parent
    # Validate the bundled configuration, even if the caller has a runtime override.
    previous = os.environ.pop("HYPERAGENT_MODELS_FILE", None)
    try:
        runpy.run_path(str(source / "hyperagent.py"))["load_mappings"]()
    finally:
        if previous is not None:
            os.environ["HYPERAGENT_MODELS_FILE"] = previous
    library = prefix / "lib" / "jovie-hyperagent"
    library.mkdir(parents=True, exist_ok=True)
    for name in ("models.json", "hyperagent.py"):
        with tempfile.NamedTemporaryFile(dir=library, delete=False) as temp:
            staging = Path(temp.name)
            try:
                temp.write((source / name).read_bytes())
                temp.flush()
                staging.chmod(0o755 if name.endswith(".py") else 0o644)
                staging.replace(library / name)
            finally:
                staging.unlink(missing_ok=True)
    binary = prefix / "bin" / "hyperagent"
    binary.parent.mkdir(parents=True, exist_ok=True)
    # Replace a legacy executable or symlink atomically, without following it.
    with tempfile.TemporaryDirectory(dir=binary.parent) as staging_dir:
        link = Path(staging_dir) / "hyperagent"
        link.symlink_to(library.resolve() / "hyperagent.py")
        link.replace(binary)
    return binary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prefix", type=Path, default=Path.home() / ".local")
    args = parser.parse_args()
    print(install(args.prefix))


if __name__ == "__main__":
    main()
