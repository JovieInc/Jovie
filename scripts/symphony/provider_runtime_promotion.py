#!/usr/bin/env python3
"""Atomic, launch-bound provider bundle publication; no service mutation."""
import fcntl
import hashlib
import json
import os
import pathlib
import shlex
import shutil
import subprocess
import sys
import tempfile

repo, home, state = (pathlib.Path(value).resolve() for value in sys.argv[1:4])
rollback, dry_run = map(int, sys.argv[4:6])
root = state / "provider-generations"
bin_dir = home / ".local/bin"
names = {
    "agent-router": ("symphony-agent-router", "symphony-agent-router"),
    "codex-router": ("symphony-codex-router", "symphony-codex-router-hotfix"),
    "codex-probe": ("codex-account-probe.sh", "codex-account-probe"),
    "cursor-adapter": ("cursor-appserver-adapter.py", "cursor-appserver-adapter"),
}
aliases = [bin_dir / "symphony-agent-router", bin_dir / "symphony-codex-entry"]
current = root / "current"

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def switch(target, destination):
    temporary = destination.with_name(destination.name + f".tmp.{os.getpid()}")
    try:
        temporary.symlink_to(target)
        os.replace(temporary, destination)
    finally:
        if temporary.is_symlink():
            temporary.unlink()

def verify(generation):
    if generation.parent != root or not generation.is_dir():
        raise ValueError("generation is outside the provider store")
    receipt = json.loads((generation / "manifest.json").read_text())
    for name in [*names, "entry"]:
        path = generation / name
        if path.is_symlink() or not os.access(path, os.X_OK) or digest(path) != receipt["sha256"][name]:
            raise ValueError(f"provider generation hash/mode mismatch: {name}")
    return receipt

def stage(sources, prefix):
    generation = pathlib.Path(tempfile.mkdtemp(prefix=prefix, dir=root))
    for name, source in sources.items():
        shutil.copyfile(source, generation / name)
        (generation / name).chmod(0o755)
    # Embed the immutable directory: resolving the moving current symlink at
    # launch time could otherwise combine an old entry with new dependencies.
    entry = "#!/usr/bin/env bash\nset -euo pipefail\n"
    for key, name in [("SYMPHONY_CODEX_ROUTER", "codex-router"),
                      ("SYMPHONY_CODEX_ACCOUNT_PROBE", "codex-probe"),
                      ("SYMPHONY_CURSOR_ADAPTER", "cursor-adapter")]:
        entry += f"export {key}={shlex.quote(str(generation / name))}\n"
    entry += f"exec {shlex.quote(str(generation / 'agent-router'))} \"$@\"\n"
    (generation / "entry").write_text(entry)
    (generation / "entry").chmod(0o755)
    receipt = {"schema": "symphony-provider-generation/v1", "sha256": {
        name: digest(generation / name) for name in [*names, "entry"]}}
    (generation / "manifest.json").write_text(json.dumps(receipt, sort_keys=True) + "\n")
    verify(generation)
    return generation

try:
    # Local source validation only. No Linear requests, idle inference, service
    # restart, workflow replacement or binary promotion belong to this mode.
    sources = {name: repo / "scripts/symphony" / paths[0] for name, paths in names.items()}
    if not rollback:
        for name, source in sources.items():
            if not source.is_file():
                raise ValueError(f"missing provider source: {name}")
            if name == "cursor-adapter":
                compile(source.read_bytes(), str(source), "exec")
            else:
                subprocess.run(["bash", "-n", str(source)], check=True)
    if dry_run:
        if rollback:
            target = (root / "previous").resolve(strict=True)
            print("PROVIDER_ROLLBACK_DRY_RUN " + json.dumps(verify(target), sort_keys=True))
        else:
            print("PROVIDER_DRY_RUN " + json.dumps({name: digest(path) for name, path in sources.items()}, sort_keys=True))
        raise SystemExit(0)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (root / "promotion.lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if rollback and not (root / "previous").is_symlink():
            raise ValueError("no provider rollback generation is available")
        if current.is_symlink():
            old = current.resolve(strict=True)
            verify(old)
            for alias in aliases:
                if not alias.is_symlink() or os.readlink(alias) != str(current / "entry"):
                    # Resume an interrupted first installation only when the
                    # remaining regular alias is the exact preserved launcher.
                    if alias.is_symlink() or digest(alias) != digest(old / "agent-router"):
                        raise ValueError(f"unowned provider alias: {alias.name}")
                    switch(current / "entry", alias)
        else:
            if current.exists() or any(alias.is_symlink() or not alias.is_file() for alias in aliases):
                raise ValueError("provider bootstrap requires two existing regular entry files")
            if digest(aliases[0]) != digest(aliases[1]):
                raise ValueError("provider entry aliases diverge; reconcile ownership first")
            legacy = {name: bin_dir / paths[1] for name, paths in names.items()}
            if any(not path.is_file() or not os.access(path, os.X_OK) for path in legacy.values()):
                raise ValueError("installed provider bundle is incomplete")
            old = stage(legacy, "legacy-")
            switch(old, current)
            for alias in aliases:
                switch(current / "entry", alias)
        if rollback:
            previous = root / "previous"
            target = previous.resolve(strict=True)
            verify(target)
        else:
            target = stage(sources, "source-")
        switch(old, root / "previous")
        try:
            switch(target, current)
            verify(current.resolve(strict=True))
            for alias in aliases:
                if alias.resolve(strict=True) != target / "entry":
                    raise ValueError("provider alias readback mismatch")
        except BaseException:
            switch(old, current)
            raise
        print("PROVIDER_PROMOTED " + str(target))
        print("PROVIDER_ROLLBACK " + str(old))
        print("PROVIDER_HASHES " + json.dumps(verify(target)["sha256"], sort_keys=True))
except (OSError, ValueError, KeyError, SyntaxError, subprocess.CalledProcessError) as exc:
    print(f"PROVIDER_RED {exc}", file=sys.stderr)
    raise SystemExit(10)
