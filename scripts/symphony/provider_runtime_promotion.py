#!/usr/bin/env python3
"""Atomic, launch-bound provider bundle publication; no service mutation."""
import fcntl
import json
import os
import pathlib
import shlex
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import codex_cli_artifact as cli

repo, home, state = (pathlib.Path(value).resolve() for value in sys.argv[1:4])
rollback, dry_run = map(int, sys.argv[4:6])
stage_only = int(sys.argv[6]) if len(sys.argv) > 6 else 0
check_only = int(sys.argv[7]) if len(sys.argv) > 7 else 0
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
    return cli.sha256(path)

def launcher_text(generation, managed_cli=False):
    entry = "#!/usr/bin/env bash\nset -euo pipefail\n"
    for key, name in [("SYMPHONY_CODEX_ROUTER", "codex-router"),
                      ("SYMPHONY_CODEX_ACCOUNT_PROBE", "codex-probe"),
                      ("SYMPHONY_CURSOR_ADAPTER", "cursor-adapter")]:
        entry += f"export {key}={shlex.quote(str(generation / name))}\n"
    if managed_cli:
        for key, name in [("SYMPHONY_CODEX_ROTATE", "codex-rotate"), ("CODEX_REAL_BIN", "codex")]:
            entry += f"export {key}={shlex.quote(str(generation / name))}\n"
    return entry + f"exec {shlex.quote(str(generation / 'agent-router'))} \"$@\"\n"

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
    schema = receipt["schema"]
    if schema not in ["symphony-provider-generation/v1", "symphony-provider-generation/v2"]:
        raise ValueError("unknown provider generation schema")
    managed_cli = schema.endswith("/v2")
    bundled = [*names, "entry", *(["codex-rotate", "codex"] if managed_cli else [])]
    for name in bundled:
        path = generation / name
        if path.is_symlink() or not os.access(path, os.X_OK) or digest(path) != receipt["sha256"][name]:
            raise ValueError(f"provider generation hash/mode mismatch: {name}")
    if (generation / "entry").read_text() != launcher_text(generation, managed_cli):
        raise ValueError("provider generation launcher dependency mismatch")
    if managed_cli and (receipt["codex_cli"]["binary_sha256"] != receipt["sha256"]["codex"]
                        or receipt["codex_cli"]["qualification"] != "version-and-empty-home-initialize/v1"):
        raise ValueError("Codex qualification receipt mismatch")
    return receipt

def stage(sources, prefix, pin=None):
    generation = pathlib.Path(tempfile.mkdtemp(prefix=prefix, dir=root))
    try:
        for name, source in sources.items():
            shutil.copyfile(source, generation / name)
            (generation / name).chmod(0o755)
        artifact = None
        if pin:
            # A source-only update must not re-download an already verified pin.
            previous_artifact = verify(current.resolve(strict=True)).get("codex_cli") if current.is_symlink() else None
            if previous_artifact and previous_artifact["pin"] == pin:
                shutil.copyfile(current.resolve(strict=True) / "codex", generation / "codex")
                (generation / "codex").chmod(0o755)
                artifact = previous_artifact
            else:
                artifact = cli.qualify(repo / "scripts/symphony/codex-cli", generation / "codex", pin)
        # Embed the immutable directory, never a moving current/global path.
        (generation / "entry").write_text(launcher_text(generation, bool(pin)))
        (generation / "entry").chmod(0o755)
        receipt = {"schema": "symphony-provider-generation/v2" if pin else "symphony-provider-generation/v1",
                   "sha256": {name: digest(generation / name) for name in
                              [*sources, "entry", *(["codex"] if pin else [])]}}
        if artifact:
            receipt["codex_cli"] = artifact
        (generation / "manifest.json").write_text(json.dumps(receipt, sort_keys=True) + "\n")
        verify(generation)
        return generation
    except BaseException:
        shutil.rmtree(generation)
        raise

owned_target = None
try:
    if stage_only and rollback:
        raise ValueError("staging and rollback are separate operations")
    # Source/lock validation precedes all writes. Provider mode qualifies only
    # its private CLI; no Linear requests, service or global binary mutation.
    sources = {name: repo / "scripts/symphony" / paths[0] for name, paths in names.items()}
    pin = None
    if not rollback:
        pin = cli.read_pin(repo / "scripts/symphony/codex-cli")
        sources["codex-rotate"] = repo / "scripts/symphony/codex-rotate"
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
        if check_only:
            if not current.is_symlink():
                raise ValueError("managed provider generation is not installed")
            target = current.resolve(strict=True)
            receipt = verify(target)
            if receipt.get("codex_cli", {}).get("pin") != pin:
                raise ValueError("provider generation Codex pin mismatch")
            for name, source in sources.items():
                if digest(source) != receipt["sha256"][name]:
                    raise ValueError(f"provider generation source mismatch: {name}")
            for alias in aliases:
                if not alias.is_symlink() or alias.resolve(strict=True) != target / "entry":
                    raise ValueError(f"provider alias readback mismatch: {alias.name}")
            print("PROVIDER_OK " + json.dumps(receipt["sha256"], sort_keys=True))
            raise SystemExit(0)
        if stage_only:
            target = stage(sources, "source-", pin)
            print("PROVIDER_STAGED " + str(target))
            print("PROVIDER_HASHES " + json.dumps(verify(target)["sha256"], sort_keys=True))
            raise SystemExit(0)
        if rollback and not (root / "previous").is_symlink():
            raise ValueError("no provider rollback generation is available")
        # An installer/compatibility failure must leave even first-install aliases intact.
        if not rollback:
            target = owned_target = stage(sources, "source-", pin)
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
except (OSError, ValueError, KeyError, SyntaxError, subprocess.SubprocessError) as exc:
    if owned_target and not any(link.is_symlink() and link.resolve() == owned_target
                                for link in [current, root / "previous"]):
        shutil.rmtree(owned_target)
    print(f"PROVIDER_RED {exc}", file=sys.stderr)
    raise SystemExit(10)
