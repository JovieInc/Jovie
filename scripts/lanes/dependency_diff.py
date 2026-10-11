"""Prove an exact dependency-version chore; never waive qualification or ownership."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess

SECTIONS = ('dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies')
MANIFEST = re.compile(r'(?:package\.json|(?:apps|packages)/[^/]+/package\.json)\Z')
VERSION = re.compile(r'[~^]?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?\Z')
SHA = re.compile(r'[0-9a-f]{40}\Z')
CHORE = re.compile(r'^(?:deps(?:\([^)]*\))?|(?:chore|build)\(deps(?:-[^)]*)?\)):\s*\S', re.I)


def metadata_digest(pr: dict) -> str | None:
    fields = {key: pr.get(key) for key in ('title', 'body', 'headRefName')}
    if not all(isinstance(value, str) for value in fields.values()):
        return None
    digest = hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()
    # The target reader may retain unrelated cached display fields. Only fields
    # actually returned together by its live snapshot can justify this rule.
    if 'dependencyMetadataDigest' in pr and pr['dependencyMetadataDigest'] != digest:
        return None
    return digest


def _object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('duplicate JSON key')
        value[key] = item
    return value


def _reject_constant(value):
    raise ValueError('non-JSON number')


def _manifest(raw: str) -> dict:
    if len(raw) > 1024 * 1024:
        raise ValueError('oversized manifest')
    value = json.loads(raw, object_pairs_hook=_object, parse_constant=_reject_constant)
    if not isinstance(value, dict):
        raise ValueError('manifest must be an object')
    return value


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(['git', *args], cwd=repo, check=True, capture_output=True,
                          text=True, timeout=30).stdout


def classify(repo: Path, head: str, paths: list[str], pr: dict) -> dict | None:
    """Fail closed unless tracked immutable blobs prove a non-bugfix version-only diff.

    The conservative chore check is additional to the canonical Bug-to-Test rule,
    which still runs with all other qualification commands. No caller allow flag,
    working-tree JSON, CI colour or agent claim grants this classification.
    """
    if not isinstance(head, str) or not SHA.fullmatch(head) or metadata_digest(pr) is None:
        return None
    if (not CHORE.match(pr['title'].strip()) or re.match(r'^(fix/|.*/fix-)', pr['headRefName'], re.I)
            or re.search(r'- \[[xX]\] Bug fix \(non-breaking change which fixes an issue\)', pr['body'])):
        return None
    try:
        if _git(repo, 'rev-parse', '--verify', 'HEAD^{commit}').strip() != head:
            return None
        base = _git(repo, 'merge-base', 'origin/main', head).strip()
        if not SHA.fullmatch(base):
            return None
        subjects = _git(repo, 'log', '--format=%s', f'{base}..{head}').splitlines()
        if not subjects or any(re.match(r'^fix[(:]', subject.strip(), re.I) for subject in subjects):
            return None
        raw = _git(repo, 'diff', '--raw', '--no-renames', '--abbrev=40', '-z', base, head, '--')
        parts = raw.split('\0')
        if parts[-1] != '' or (len(parts) - 1) % 2:
            return None
        records = {}
        for info, path in zip(parts[:-1:2], parts[1:-1:2]):
            mode_before, mode_after, old, new, status = info.removeprefix(':').split()
            if (not info.startswith(':') or mode_before != '100644' or mode_after != '100644'
                    or status != 'M' or not SHA.fullmatch(old) or not SHA.fullmatch(new)
                    or path in records or not (MANIFEST.fullmatch(path) or path == 'pnpm-lock.yaml')):
                return None
            records[path] = (old, new)
        if not records or len(paths) != len(set(paths)) or set(paths) != set(records):
            return None
        manifests = []
        for path in records:
            if path == 'pnpm-lock.yaml':
                continue
            before = _manifest(_git(repo, 'show', f'{base}:{path}'))
            after = _manifest(_git(repo, 'show', f'{head}:{path}'))
            if (json.dumps({k: v for k, v in before.items() if k not in SECTIONS}, sort_keys=True)
                    != json.dumps({k: v for k, v in after.items() if k not in SECTIONS}, sort_keys=True)):
                return None
            updates = []
            for section in SECTIONS:
                if (section in before) != (section in after):
                    return None
                if section not in before:
                    continue
                old, new = before[section], after[section]
                if (not isinstance(old, dict) or not isinstance(new, dict) or set(old) != set(new)
                        or not all(isinstance(v, str) and v for v in [*old.values(), *new.values()])):
                    return None
                for package in old:
                    if old[package] != new[package]:
                        if not VERSION.fullmatch(old[package]) or not VERSION.fullmatch(new[package]):
                            return None
                        updates.append({'section': section, 'package': package,
                                        'before': old[package], 'after': new[package]})
            if not updates:
                return None
            manifests.append({'path': path, 'beforeBlob': records[path][0],
                              'afterBlob': records[path][1], 'updates': updates})
        if not manifests:
            return None
        return {'schema': 'jovie-dependency-version-diff/v1', 'baseSha': base, 'headSha': head,
                'metadataDigest': metadata_digest(pr), 'manifests': manifests}
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError, subprocess.SubprocessError):
        return None
