"""Trusted preflight for the exact checkout before qualification executes its code."""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys


class CheckoutHeld(RuntimeError):
    pass


@dataclass(frozen=True)
class SafetyPolicy:
    required_commit: str
    fixture_path: str
    fixture_sha256: str


def _checked_source(repo, expected_head, policy, *, current_checkout, run=subprocess.run):
    """Return exact source evidence or fail closed, with no test/module execution."""
    if not re.fullmatch(r"[0-9a-f]{40}", expected_head or ""):
        raise CheckoutHeld("invalid-expected-head")
    if not re.fullmatch(r"[0-9a-f]{40}", policy.required_commit or ""):
        raise CheckoutHeld("invalid-safety-floor")
    if not re.fullmatch(r"[0-9a-f]{64}", policy.fixture_sha256 or ""):
        raise CheckoutHeld("invalid-fixture-policy")
    rel = PurePosixPath(policy.fixture_path)
    if rel.is_absolute() or ".." in rel.parts or str(rel) != policy.fixture_path:
        raise CheckoutHeld("invalid-fixture-path")
    root = Path(repo).absolute()
    try:
        if root.resolve(strict=True) != root or not root.is_dir():
            raise CheckoutHeld("noncanonical-checkout")
    except OSError as error:
        raise CheckoutHeld("checkout-unreadable") from error
    # Observe this checkout, not an inherited alternate index/object/ref graph.
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    env.update({"GIT_OPTIONAL_LOCKS": "0", "GIT_NO_REPLACE_OBJECTS": "1",
                "GIT_GRAFT_FILE": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_SYSTEM": os.devnull,
                "GIT_TERMINAL_PROMPT": "0"})

    def git(*args):
        try:
            result = run(["git", "--no-optional-locks", "-c", "core.fsmonitor=false",
                          "-c", "core.hooksPath=" + os.devnull, "-C", str(root), *args],
                         capture_output=True, timeout=15, env=env)
        except (OSError, subprocess.SubprocessError) as error:
            raise CheckoutHeld("git-observation-unavailable") from error
        if result.returncode:
            raise CheckoutHeld("git-check-failed:" + args[0] + ":" + str(result.returncode))
        return result.stdout

    if Path(git("rev-parse", "--show-toplevel").decode().strip()) != root:
        raise CheckoutHeld("wrong-checkout-root")
    if current_checkout and git("rev-parse", "--verify", "HEAD^{commit}").decode().strip() != expected_head:
        raise CheckoutHeld("head-mismatch")
    git("cat-file", "-e", policy.required_commit + "^{commit}")
    git("merge-base", "--is-ancestor", policy.required_commit, expected_head)
    entry = git("ls-tree", "-z", expected_head, "--", policy.fixture_path)
    parts = entry.rstrip(b"\0").split(b"\t")
    if len(parts) != 2 or parts[1].decode() != policy.fixture_path:
        raise CheckoutHeld("fixture-not-in-head")
    mode, kind, blob = parts[0].decode().split()
    if mode != "100644" or kind != "blob":
        raise CheckoutHeld("fixture-not-regular")
    committed = git("cat-file", "blob", blob)
    if hashlib.sha256(committed).hexdigest() != policy.fixture_sha256:
        raise CheckoutHeld("fixture-not-reviewed")
    proof = {"head": expected_head, "safetyFloor": policy.required_commit,
             "fixturePath": policy.fixture_path, "fixtureBlob": blob,
             "fixtureSha256": policy.fixture_sha256}
    if not current_checkout:
        return proof
    index = git("ls-files", "--stage", "-z", "--", policy.fixture_path)
    if index != ("100644 " + blob + " 0\t" + policy.fixture_path + "\0").encode():
        raise CheckoutHeld("fixture-index-mismatch")
    fixture = root / policy.fixture_path
    try:
        if fixture.resolve(strict=True) != fixture or not stat.S_ISREG(fixture.lstat().st_mode):
            raise CheckoutHeld("fixture-path-unsafe")
        actual = fixture.read_bytes()
    except OSError as error:
        raise CheckoutHeld("fixture-unreadable") from error
    if actual != committed:
        raise CheckoutHeld("fixture-worktree-mismatch")
    if git("rev-parse", "--verify", "HEAD^{commit}").decode().strip() != expected_head:
        raise CheckoutHeld("head-changed-during-check")
    return proof


def checked_checkout(repo, expected_head, policy, *, run=subprocess.run):
    return _checked_source(repo, expected_head, policy, current_checkout=True, run=run)



HERE = Path(__file__).resolve().parent
DEFAULT_POLICY = SafetyPolicy(
    "5db1a60487c0a29dda45315d9aa5da14493d9409",
    "scripts/tests/test_disk_guard.py",
    "be680e72198db2174f6c0ac5fe05157a4a03f7bd791941c9254f13b21d0686fb",
)


def check(repo: Path, expected_head: str) -> dict:
    """No candidate-supplied policy or environment override is accepted."""
    try:
        return checked_checkout(repo, expected_head, DEFAULT_POLICY)
    except (OSError, ValueError) as error:
        raise CheckoutHeld("checkout-observation-unverifiable") from error



def prepare_checkout(repo: Path, expected_head: str) -> dict:
    """Prepare only a source-proven target, without checkout hooks or filters.

    The caller owns the worktree and exact-head lease. Fetching objects is the
    caller's responsibility; this helper never runs candidate code or installs.
    """
    try:
        _checked_source(repo, expected_head, DEFAULT_POLICY, current_checkout=False)
        env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
                    "GIT_CONFIG_SYSTEM": os.devnull, "GIT_TERMINAL_PROMPT": "0",
                    "GIT_NO_REPLACE_OBJECTS": "1", "GIT_GRAFT_FILE": os.devnull})
        git = ["git", "-c", "core.hooksPath=" + os.devnull, "-c", "core.fsmonitor=false",
               "-C", str(repo)]
        filters = subprocess.run([*git, "config", "--get-regexp", r"^filter\..*\.(clean|smudge|process)$"],
                                 capture_output=True, timeout=15, env=env)
        if filters.returncode not in (0, 1):
            raise CheckoutHeld("checkout-filter-observation-unavailable")
        if filters.stdout.strip():
            raise CheckoutHeld("checkout-filter-isolation-unverifiable")
        checkout = subprocess.run([*git, "checkout", "-q", "--detach", expected_head],
                                  capture_output=True, timeout=30, env=env)
        if checkout.returncode:
            raise CheckoutHeld("checkout-failed:" + str(checkout.returncode))
        return check(repo, expected_head)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise CheckoutHeld("checkout-preparation-unverifiable") from error


def _load_runner():
    # Resolve the trusted release alongside this module, never the candidate repo.
    spec = importlib.util.spec_from_file_location("qualification_lane_runner", HERE / "lane_runner.py")
    if spec is None or spec.loader is None:
        raise CheckoutHeld("trusted-runner-unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    sys.path.insert(0, str(HERE))
    try:
        spec.loader.exec_module(module)
    except Exception as error:
        if sys.modules.get(spec.name) is module:
            sys.modules.pop(spec.name)
        raise CheckoutHeld("trusted-runner-unavailable") from error
    return module


def load_checked_runner(repo: Path, expected_head: str):
    """Manual qualification entry: preflight before even the trusted runner import."""
    proof = check(repo, expected_head)
    return _load_runner(), proof


def main(argv=None) -> int:
    """Inspect only. Running this CLI cannot start tests or acquire native locks."""
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--head", required=True)
    args = parser.parse_args(argv)
    try:
        proof = check(args.repo, args.head)
    except (CheckoutHeld, OSError, ValueError) as error:
        print(json.dumps({"schema": "jovie.qualification-safety/v1", "safe": False,
                          "reason": str(error)}))
        return 2
    print(json.dumps({"schema": "jovie.qualification-safety/v1", "safe": True, **proof}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
