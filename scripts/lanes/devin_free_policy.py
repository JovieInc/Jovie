"""Read-only Free proof and bounded expiry for the existing Devin process guard.

This is a local conservative deadline, not a provider-confirmed promo timestamp.
No credentials are read; only supported CLI auth status and model inventory.
"""
from __future__ import annotations

import json
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS = frozenset(('swe-2-medium', 'swe-2-high', 'swe-2-max'))
PROOF_INTERVAL_S = 30
CLEANUP_MARGIN_S = 60


class FreeProofHeld(RuntimeError):
    pass


def policy():
    try:
        p = json.loads((HERE/'providers.json').read_text())['devin']['freeOnly']
        expires = datetime.fromisoformat(p['stopBefore'].replace('Z', '+00:00'))
        if expires.tzinfo is None or not p['email'] or not p['teamId']:
            raise ValueError('incomplete policy')
        return {**p, 'deadline': expires.timestamp()}
    except (KeyError, TypeError, ValueError, OSError) as error:
        raise FreeProofHeld('devin-free-policy-missing-or-invalid') from error


def admission_open(timeout, now=None):
    try:
        return (time.time() if now is None else now) + timeout + CLEANUP_MARGIN_S < policy()['deadline']
    except FreeProofHeld:
        return False


def supported_read(args):
    remaining = policy()['deadline'] - time.time() - CLEANUP_MARGIN_S
    if remaining <= 0:
        raise FreeProofHeld('devin-free-policy-expiring')
    result = subprocess.run(args, capture_output=True, text=True, timeout=min(10, remaining))
    if result.returncode:
        raise FreeProofHeld('devin-free-proof-read-failed')
    return result.stdout


def verify(model, cli='devin'):
    p = policy()
    if time.time() >= p['deadline']:
        raise FreeProofHeld('devin-free-policy-expired')
    if model not in MODELS:
        raise FreeProofHeld('devin-model-not-bare-swe2')
    try:
        status = supported_read([cli, 'auth', 'status'])
        fields = dict(re.findall(r'^\s*(Email|Team ID|Team membership):\s*(\S.*?)\s*$', status, re.M))
        if ('Logged in' not in status or fields.get('Email') != p['email']
                or fields.get('Team ID') != p['teamId'] or fields.get('Team membership') != 'Approved'):
            raise FreeProofHeld('devin-free-account-mismatch')
        inventory = json.loads(supported_read([cli, 'models', 'list', '--format', 'json']))
        if not isinstance(inventory, dict):
            raise FreeProofHeld('devin-free-model-inventory-unknown')
        families = inventory.get('families')
        if not isinstance(families, list):
            raise FreeProofHeld('devin-free-model-inventory-unknown')
        matches = [(family, variant) for family in families if isinstance(family, dict)
                   for variant in family.get('variants', []) if isinstance(variant, dict)
                   and variant.get('model_uid') == model]
        if len(matches) != 1 or matches[0][0].get('family_uid') != 'swe-2' or matches[0][1].get('cost_tier') != 'Free':
            raise FreeProofHeld('devin-current-free-proof-missing')
        if time.time() >= p['deadline']:
            raise FreeProofHeld('devin-free-policy-expired')
    except (OSError, subprocess.SubprocessError, ValueError, TypeError) as error:
        raise FreeProofHeld('devin-free-proof-unavailable') from error


def command_guard(cmd, timeout):
    """Compose with run_agent's existing ownership guard and cleanup callbacks."""
    if not cmd or Path(cmd[0]).name != 'devin':
        return None
    # Every native Devin inference command must explicitly select one bare model.
    if cmd.count('--model') != 1 or '-p' not in cmd:
        raise FreeProofHeld('devin-command-not-qualified')
    pos = cmd.index('--model') + 1
    if pos >= len(cmd) or cmd[pos] not in MODELS:
        raise FreeProofHeld('devin-model-not-bare-swe2')
    model = cmd[pos]
    first = True
    next_read = 0.0

    def guard():
        nonlocal first, next_read
        now = time.time()
        if now + CLEANUP_MARGIN_S >= policy()['deadline']:
            raise FreeProofHeld('devin-free-policy-expired')
        if first and not admission_open(timeout, now):
            raise FreeProofHeld('devin-free-run-would-cross-deadline')
        if now >= next_read:
            verify(model, cmd[0])
            next_read = time.time() + PROOF_INTERVAL_S
        first = False
    return guard


def health():
    try:
        if not admission_open(5400):
            raise FreeProofHeld('devin-free-admission-closed')
        verify(json.loads((HERE/'providers.json').read_text())['devin']['model'])
        print('available: true; bare SWE-2 currently Free; conservative expiry enforced')
        return 0
    except (FreeProofHeld, OSError, ValueError, KeyError) as error:
        print('available: false; ' + str(error))
        return 1


if __name__ == '__main__':
    raise SystemExit(health())
