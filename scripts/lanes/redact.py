"""Redact secret-named environment values from subprocess output.

Lanes jobs run with credentials in their environment. Anything captured from a
child (stdout, stderr, mock call reprs in test failures) must pass through
`redact` before it is logged, stored or raised. Names are matched, not values
guessed: a value is replaced only when its variable name looks like a secret.
"""
from __future__ import annotations

import os
import re

SECRET_NAME = re.compile(r"(TOKEN|SECRET|PASSW(OR)?D|API_?KEY|PRIVATE|CREDENTIAL|DOPPLER|AUTH|BEARER)", re.I)
MIN_LEN = 6  # shorter values are indistinguishable from ordinary words


def secret_values(env=None) -> dict[str, str]:
    env = os.environ if env is None else env
    return {k: v for k, v in env.items()
            if SECRET_NAME.search(k) and isinstance(v, str) and len(v) >= MIN_LEN}


def redact(text, env=None):
    if not isinstance(text, str):
        return text
    # Longest first so a value containing another is replaced whole.
    for name, value in sorted(secret_values(env).items(), key=lambda kv: -len(kv[1])):
        text = text.replace(value, f"[REDACTED:{name}]")
    return text
