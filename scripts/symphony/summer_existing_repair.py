"""Read-only projection of an existing qualified host repair assignment.

The existing host package owns validation. This module cannot create, renew,
claim, or execute an assignment and never publishes the private provider grant.
"""
from __future__ import annotations

import importlib.util
import hashlib
import json
import os
import pathlib
import stat
import re
import subprocess
import sys
from datetime import datetime, timezone


def load_repair_validator():
    """Load the existing installed controller package, never a caller-supplied module."""
    home = pathlib.Path.home()
    manifest_path = home / "gem-workspace/config/existing-repair-controller-manifest.json"
    expected = {
        "schema": "symphony-existing-repair-controller-package/v1",
        "packageId": "symphony-codex-auth-fallback",
        "command": "symphony-codex-exhausted.py",
        "arguments": ["owned-repair"],
        "launcherRelativePath": ".local/bin/symphony-codex-exhausted.py",
        "releaseControllerRelativePath": ".local/bin/.symphony-codex-auth-fallback/current/symphony-codex-exhausted.py",
        "releaseValidatorRelativePath": ".local/bin/.symphony-codex-auth-fallback/current/existing_pr_repair.py",
        "installer": "scripts/symphony/symphony-codex-exhausted.py install",
    }
    observed_manifest = json.loads(manifest_path.read_text())
    resolver_key = "releaseResolverRelativePath"
    if isinstance(observed_manifest, dict) and resolver_key in observed_manifest:
        expected[resolver_key] = ".local/bin/.symphony-codex-auth-fallback/current/symphony-existing-repair-resolv.conf"
    if observed_manifest != expected:
        raise ValueError("existing-repair-package-manifest-invalid")
    paths = [manifest_path, *(home / expected[key] for key in
             ("launcherRelativePath", "releaseControllerRelativePath", "releaseValidatorRelativePath"))]
    if resolver_key in expected:
        paths.append(home / expected[resolver_key])
    for path in paths:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o022:
            raise ValueError("existing-repair-package-file-untrusted")
    controller, validator = paths[2].resolve(), paths[3].resolve()
    releases = home / ".local/bin/.symphony-codex-auth-fallback/releases"
    if controller.parent != validator.parent or controller.parent.parent != releases.resolve():
        raise ValueError("existing-repair-package-release-mismatch")
    # Reuse the observer's operator-selected immutable configuration source.
    # Verify code before import; a package path or later self-reported hash is insufficient.
    source_root = os.environ.get("JOVIE_CONFIGURATION_SOURCE_ROOT", "")
    revision = os.environ.get("JOVIE_CONFIGURATION_SOURCE_REVISION", "")
    if not pathlib.Path(source_root).is_absolute() or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("existing-repair-package-source-unavailable")
    def git_value(*arguments):
        return subprocess.check_output(["git", "-C", source_root, *arguments], stderr=subprocess.DEVNULL, timeout=10)
    if git_value("rev-parse", f"{revision}^{{commit}}").decode().strip() != revision:
        raise ValueError("existing-repair-package-source-invalid")
    resolver = paths[4].resolve() if len(paths) == 5 else None
    if resolver is not None and resolver.parent != controller.parent:
        raise ValueError("existing-repair-package-release-mismatch")
    verified = {}
    for installed in (controller, validator, *((resolver,) if resolver is not None else ())):
        info = installed.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o022:
            raise ValueError("existing-repair-package-file-untrusted")
        observed_bytes = installed.read_bytes()
        expected_bytes = git_value("show", f"{revision}:scripts/symphony/{installed.name}")
        if hashlib.sha256(observed_bytes).digest() != hashlib.sha256(expected_bytes).digest():
            raise ValueError("existing-repair-package-source-mismatch")
        verified[installed] = observed_bytes
    spec = importlib.util.spec_from_file_location("summer_existing_repair_validator", validator)
    if spec is None or spec.loader is None:
        raise ValueError("existing-repair-package-loader-unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        exec(compile(verified[validator], str(validator), "exec"), module.__dict__)
    except BaseException:
        sys.modules.pop(spec.name, None)
        raise
    return module, controller


def load_existing_repair_reference():
    """Observe a single qualified assignment using the canonical host validator.

    No claim, execution, provider selection, grant renewal, or file write occurs.
    Ambiguous candidates remain held rather than taking another owner's work.
    """
    try:
        validator, controller = load_repair_validator()
        references = []
        for candidate in validator.candidates(controller):
            if candidate.get("executionMode") != "isolated-cli" or candidate.get("repository") != "JovieInc/Jovie":
                continue
            try:
                payload = validator.load_validated_candidate(candidate["identifier"], controller)
            except (OSError, ValueError, KeyError, TypeError):
                continue
            reference = {key: payload[key] for key in (
                "identifier", "issueId", "ownerId", "issueRevision", "repository", "pr", "head", "workspace", "writerUnit")}
            reference.update(mode="isolated-cli", assignmentDigest=validator.assignment_digest(payload),
                             expiresAt=datetime.fromtimestamp(payload["expiresAt"], timezone.utc).isoformat().replace("+00:00", "Z"))
            references.append(reference)
        return references[0] if len(references) == 1 else None
    except (OSError, ValueError, OverflowError, KeyError, TypeError, AttributeError, ImportError, SyntaxError, subprocess.SubprocessError):
        # Missing or incompatible deployment is absence of authority, not a grant.
        return None


def task_admissions_match(observation, reference, audit, source_revision, runtime):
    """Match an observation to the exact snapshot; never repair crossed bindings."""
    if not all(isinstance(value, dict) for value in (observation, reference, audit, runtime)):
        return False
    classes = audit.get("classes")
    return (
        observation.get("schema") == "jovie.eve.summer-task-admissions/v1"
        and isinstance(classes, list)
        and any(isinstance(item, dict) and item.get("state") in {"open", "partial"}
                and item.get("id") == observation.get("selectedId") for item in classes)
        and observation.get("assignmentDigest") == reference.get("assignmentDigest")
        and observation.get("sourceRevision") == source_revision == audit.get("sourceRevision")
        and all(isinstance(runtime.get(key), str) and observation.get(key) == runtime[key]
                for key in ("runtimeRevision", "runtimeGeneration", "runtimeInvocationId"))
    )


def load_existing_repair_task_admissions(reference, audit, source_revision, runtime):
    """Observe bounded audit classes without choosing work or granting authority.

    Summer still ranks the candidates. Only one unambiguous authenticated
    target match is attached; absent, incompatible or ambiguous evidence stays
    unknown. The existing host validator performs all authenticated reads.
    """
    if not all(isinstance(value, dict) for value in (reference, audit, runtime)):
        return None
    classes = audit.get("classes")
    if (not isinstance(classes, list) or not 0 < len(classes) <= 6
            or audit.get("sourceRevision") != source_revision
            or not all(isinstance(runtime.get(key), str) for key in
                       ("runtimeRevision", "runtimeGeneration", "runtimeInvocationId"))):
        return None
    try:
        validator, controller = load_repair_validator()
        observe = getattr(validator, "observe_task_admissions", None)
        if not callable(observe):
            return None
        observations = []
        for item in classes:
            if not isinstance(item, dict) or item.get("state") not in {"open", "partial"}:
                continue
            observed = observe(reference["identifier"], str(controller),
                               selected_id=item["id"], selected_handle=item["handle"],
                               source_revision=source_revision)
            if observed is None:
                continue
            if not task_admissions_match(observed, reference, audit, source_revision, runtime):
                return None
            if (observed.get("selectedId") != item["id"]
                    or not isinstance(observed.get("downstreamHealth"), dict)):
                return None
            if observed["downstreamHealth"].get("state") == "ALLOWED":
                observations.append(observed)
        return observations[0] if len(observations) == 1 else None
    except (OSError, ValueError, OverflowError, KeyError, TypeError, AttributeError,
            ImportError, SyntaxError, subprocess.SubprocessError):
        return None
