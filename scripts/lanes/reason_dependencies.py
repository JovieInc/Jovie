"""Bind reason consumers to accepted release objects, without installing a provider CLI.

The lifecycle guard protects the accepted generation. Models are control data: each
child consumes a private snapshot, while mutable credential inputs remain external.
"""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
import hashlib
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile

import lifecycle
from atomic_state import atomic_write_text

HERE = Path(__file__).resolve().parent
OBJECTS = ("scripts/hyperagent/hyperagent.py", "scripts/hyperagent/models.json")
SCHEMA = "jovie.reason-dependencies/v1"
_capture = ContextVar("reason_dependency_capture", default=None)
ACTION = ("The reason-lane incumbent must qualify the normal accepted release and operative model "
          "mapping, then resume the existing job. Preserve any sealed output; do not rerun a produced result.")


class DependencyUnavailable(OSError):
    def __init__(self, reason="reason-dependency-unavailable"):
        super().__init__(reason)
        self.receipt = {"status": "blocked", "reason": reason, "owner": "reason-lane", "nextAction": ACTION}


def _manifest(here=None):
    here = HERE if here is None else here
    try:
        data, _ = lifecycle._read_regular(here / ".release.json", 65536)
        document = json.loads(data)
        if not isinstance(document, dict) or not all(name in document.get("objects", {}) for name in OBJECTS):
            raise DependencyUnavailable("reason-dependency-not-manifest-bound")
        return lifecycle.validate_release(here.parents[1], document)
    except DependencyUnavailable:
        raise
    except (OSError, ValueError, TypeError, KeyError, lifecycle.AdmissionHeld) as error:
        raise DependencyUnavailable() from error


def _model_bytes(path):
    try:
        # Preserve inherited relative-path/symlink semantics; snapshot the resolved bytes.
        canonical = path.resolve(strict=True)
        data, _ = lifecycle._read_regular(canonical, 1024 * 1024)
        return canonical, data
    except (OSError, ValueError, RuntimeError) as error:
        raise DependencyUnavailable("reason-model-mapping-unavailable") from error


class Binding:
    def __init__(self, argv, env):
        self.environment = dict(os.environ if env is None else env)
        self.here = HERE
        self.manifest = _manifest(self.here)
        root = self.here.parents[1]
        self.argv = [sys.executable, str(root / OBJECTS[0]), *argv[1:]]
        override = self.environment.get("HYPERAGENT_MODELS_FILE")
        self.mapping_path = Path(override) if override is not None else root / OBJECTS[1]
        self.canonical_mapping, self.mapping_bytes = _model_bytes(self.mapping_path)
        self.provenance = {
            "sourceCommit": self.manifest["sourceCommit"], "bundleDigest": self.manifest["bundleDigest"],
            "objects": {name: self.manifest["objects"][name] for name in OBJECTS},
            "mapping": {"kind": "external" if override is not None else "release",
                        "sha256": hashlib.sha256(self.mapping_bytes).hexdigest(),
                        "selectorDigest": hashlib.sha256(str(self.mapping_path.absolute()).encode()).hexdigest()},
            "externalInputs": {"credentials": "external-mutable-not-read-or-copied",
                "declaredOverrides": [key for key in ("HYPERAGENT_CONFIG_DIR", "HYPERAGENT_MCP_TOKEN_FILE",
                    "HYPERAGENT_MCP_TOKEN", "HYPERAGENT_MODELS_FILE") if key in self.environment],
                "pathSelectorDigests": {key: hashlib.sha256(self.environment[key].encode()).hexdigest()
                    for key in ("HOME", "HYPERAGENT_CONFIG_DIR", "HYPERAGENT_MCP_TOKEN_FILE")
                    if key in self.environment}},
        }
        # Reuse the accepted CLI's validator. Loading its definitions does not resolve a token or make a request.
        original_path = sys.path[:]
        try:
            managed = runpy.run_path(self.argv[1])
            with self.snapshot() as path:
                validator = managed["load_mappings"]
                validator.__globals__["mapping_path"] = lambda: path
                validator()
        except (OSError, ValueError, ImportError, KeyError, SyntaxError) as error:
            raise DependencyUnavailable("reason-model-mapping-invalid") from error
        finally:
            sys.path[:] = original_path
        self.verify()

    @contextmanager
    def snapshot(self):
        with tempfile.TemporaryDirectory(prefix="jovie-reason-models-") as directory:
            path = Path(directory) / "models.json"
            path.write_bytes(self.mapping_bytes)
            path.chmod(0o400)
            yield path

    def verify(self):
        if _manifest(self.here) != self.manifest:
            raise DependencyUnavailable("reason-dependency-generation-changed")
        canonical, data = _model_bytes(self.mapping_path)
        if canonical != self.canonical_mapping or data != self.mapping_bytes:
            raise DependencyUnavailable("reason-model-mapping-changed")
        return self


def qualify(argv, *, env=None):
    """Only the incumbent Hyperagent command is rebound; unrelated transports are untouched."""
    return Binding(argv, env) if argv and argv[0] == "hyperagent" else None


class Capture:
    def __init__(self, state=None):
        self.state, self.invocations, self.blocked = state, [], None

    def block(self, error):
        self.blocked = error.receipt
        if self.state is not None:
            try:
                _receipt(self.state, self.blocked)
            except OSError:
                self.blocked = {**self.blocked, "stateReceipt": "unavailable; retain in sealed result"}

    def accept(self, binding):
        source = binding.provenance
        for previous in self.invocations:
            release_changed = any(previous[key] != source[key] for key in ("sourceCommit", "bundleDigest", "objects"))
            mapping_changed = (previous["mapping"]["selectorDigest"] == source["mapping"]["selectorDigest"]
                               and previous["mapping"] != source["mapping"])
            if release_changed or mapping_changed:
                raise DependencyUnavailable("reason-dependency-input-changed-within-job")
        self.invocations.append(source)

    def provenance(self):
        return {"schema": SCHEMA, "status": "blocked" if self.blocked else "qualified",
                "invocations": self.invocations, **({"blocked": self.blocked} if self.blocked else {})}


@contextmanager
def capture(state=None):
    observed = Capture(state)
    token = _capture.set(observed)
    try:
        yield observed
    finally:
        _capture.reset(token)


def invoke(argv, *, runner, probe=False, **kwargs):
    observed = None if probe else _capture.get()
    binding, result = None, None
    try:
        if observed is not None and observed.blocked:
            raise DependencyUnavailable(observed.blocked["reason"])
        binding = qualify(argv, env=kwargs.get("env"))
        if binding is None:
            return runner(argv, **kwargs)
        if observed is not None:
            observed.accept(binding)
        with binding.snapshot() as path:
            environment = {**binding.environment, "HYPERAGENT_MODELS_FILE": str(path)}
            result = runner(binding.argv, **{**kwargs, "env": environment})
            try:
                if _model_bytes(path)[1] != binding.mapping_bytes:
                    raise DependencyUnavailable("reason-operative-model-snapshot-changed")
                binding.verify()
            except DependencyUnavailable as error:
                if observed is None:
                    raise
                observed.block(error)
        return result  # Never discard already-produced bytes because control data changed.
    except OSError as failure:
        if binding is None and not isinstance(failure, DependencyUnavailable):
            raise  # Preserve unrelated transport semantics.
        error = failure if isinstance(failure, DependencyUnavailable) else DependencyUnavailable("reason-bound-command-io-unavailable")
        if observed is not None:
            observed.block(error)
            if result is not None:
                return result  # Cleanup failure cannot erase output already returned by the child.
        if error is failure:
            raise
        raise error from failure


def _receipt(state, value):
    path = Path(state) / "reason-dependencies.json"
    directory = path.parent
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.is_symlink() or path.is_symlink() or directory.stat().st_uid != os.getuid():
        raise DependencyUnavailable("reason-dependency-state-unsafe")
    previous = os.umask(0o077)
    try:
        atomic_write_text(path, json.dumps({"schema": SCHEMA, **value}))
    finally:
        os.umask(previous)
    path.chmod(0o600)
    with path.open("rb") as handle:
        os.fsync(handle.fileno())
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def readiness(config, state, issue=None, *, env_loader=lambda _: {}, job=None):
    """Local source/control qualification before queue admission, never an auth/capacity claim."""
    if issue is not None:
        from reason_publication import pending_publication
        if pending_publication(state, issue):
            return None  # Existing sealed results recover without any backend dependency.
    try:
        specs = [value for value in config.values() if isinstance(value, dict) and "cmd" in value]
        specs += config.get("reviewers", [])
        managed = any(argv and argv[0] == "hyperagent" for spec in specs
                      for argv in (spec.get("health", []), spec.get("cmd", [])))
        sources = []
        if managed:
            manifest = _manifest()
            sources.append({key: manifest[key] for key in ("sourceCommit", "bundleDigest", "objects")})
        if job is not None:
            # Optional reviewers/escalation cannot hold an unrelated eligible route.
            research = job.get("decisionType") == "research"
            name = "research" if research else "judgmentProposer" if job.get("escalation") else "proposer"
            spec = config[name]
            environment = None if research else {**os.environ, **env_loader(spec.get("env"))}
            binding = qualify(spec.get("cmd", []), env=environment)
            if binding is not None:
                sources.append(binding.provenance)
        if sources:
            try:
                _receipt(state, {"status": "qualified-local", "scope": "required-job-route" if job else "shared-release",
                    "invocations": sources, "owner": "reason-lane",
                    "nextAction": "Run normal health/admission checks; this proves local controls, not remote auth or capacity."})
            except OSError as error:
                raise DependencyUnavailable("reason-dependency-state-unavailable") from error
        return None
    except DependencyUnavailable as error:
        receipt = error.receipt
        try:
            _receipt(state, receipt)
        except OSError:
            receipt = {**receipt, "stateReceipt": "unavailable"}
        return {**receipt, "publication": receipt, "confidence": "failed"}


def health(config, state, checker, *, run, env_loader=lambda _: {}, held=None):
    ready, failures = {}, {}
    for kind, name in (("decision", "proposer"), ("research", "research")):
        try:
            spec = config[name]
            if not held:
                qualify(spec.get("health", []), env={**os.environ, **env_loader(spec.get("env"))})
            ready[kind] = not held and checker(spec, run=run)
        except DependencyUnavailable as error:
            ready[kind], failures[kind] = False, {**error.receipt, "scope": "route-local", "route": kind}
            try:
                _receipt(state, failures[kind])
            except OSError:
                failures[kind] = {**failures[kind], "stateReceipt": "unavailable"}
    if not any(ready.values()) and failures:
        held = {"status": "blocked", "reason": "reason-required-backend-unavailable", "routes": failures,
                "owner": "reason-lane", "nextAction": ACTION}
    return ready, held


def execute(executor, job, config, context, state, **kwargs):
    with capture(state) as observed:
        outcome = executor(job, config, context, state, **kwargs)
    outcome["backendSource"] = observed.provenance()
    if observed.blocked:
        outcome["retry"] = False
    return outcome


def dispatch_tick(dispatcher, host, lane, linear_factory, config, *, env_loader, **kwargs):
    held = readiness(config, host.state, env_loader=env_loader)
    if held and not (host.state / "reason-results").exists():
        return held
    # Only the drain can start model work. Retained publications must still reach it.
    return dispatcher(host, lane, linear_factory, config, **kwargs)
