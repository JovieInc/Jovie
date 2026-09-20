"""Read-only proof that a pinned Burrito 1.5 Linux x86_64 payload matches disk.

Uses the upstream XZ/FOILZ format; never executes or extracts the package.
Package digest is an operator-selected, independently verified release input.
This proves installed bytes only, not serving-process identity or admission.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import re
import stat
import struct

MAX_PACKAGE = 64 * 1024 * 1024
MAX_PAYLOAD = 256 * 1024 * 1024
MAX_FILES = 20000
XZ = b"\xfd7zXZ\x00"
MAGIC = b"FOILZ"
SHA = re.compile(r"[a-f0-9]{64}\Z")


def regular_bytes(path: Path, maximum: int) -> bytes:
    # O_NOFOLLOW closes the final-component symlink race; compare stat before/after.
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > maximum:
            raise ValueError("untrusted or oversized file")
        value = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
    if len(value) > maximum or (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
        raise ValueError("file changed during read")
    return value


def payload_from_package(package: bytes) -> bytes:
    candidates = []
    offset = -1
    for _ in range(16):
        offset = package.find(XZ, offset + 1)
        if offset < 0:
            break
        # Official v0.0.3 uses a 64 MiB dictionary plus decoder overhead.
        decoder = lzma.LZMADecompressor(memlimit=128 * 1024 * 1024)
        try:
            payload = decoder.decompress(memoryview(package)[offset:], max_length=MAX_PAYLOAD + 1)
        except lzma.LZMAError:
            continue
        if payload.startswith(MAGIC):
            if not decoder.eof or len(payload) > MAX_PAYLOAD or not payload.endswith(MAGIC):
                raise ValueError("truncated or oversized Burrito payload")
            candidates.append(payload)
    else:
        raise ValueError("too many archive candidates")
    if len(candidates) != 1:
        raise ValueError("Burrito payload is missing or ambiguous")
    return candidates[0]


def payload_manifest(payload: bytes) -> dict[str, dict]:
    if not payload.startswith(MAGIC) or not payload.endswith(MAGIC):
        raise ValueError("invalid FOILZ envelope")
    cursor, end = 5, len(payload) - 5
    rows = {}

    def take(size: int) -> bytes:
        nonlocal cursor
        if size < 0 or cursor + size > end:
            raise ValueError("truncated FOILZ record")
        value = payload[cursor:cursor + size]
        cursor += size
        return value

    def integer() -> int:
        return struct.unpack("<Q", take(8))[0]

    while cursor < end:
        size = integer()
        if not 0 < size <= 4096:
            raise ValueError("invalid archive path length")
        name = take(size).decode("utf-8")
        parts = PurePosixPath(name).parts
        if (not parts or name.startswith("/") or "\\" in name or "\x00" in name
                or any(part in {".", ".."} for part in name.split("/"))
                or str(PurePosixPath(name)) != name or name in rows):
            raise ValueError("unsafe or duplicate archive path")
        content = take(integer())
        mode = integer()
        if not stat.S_ISREG(mode) or mode & 0o7000:
            raise ValueError("unsupported archive mode")
        rows[name] = {"sha256": hashlib.sha256(content).hexdigest(), "size": len(content), "mode": stat.S_IMODE(mode)}
        if len(rows) > MAX_FILES:
            raise ValueError("too many archive files")
    if not rows:
        raise ValueError("empty Burrito payload")
    return rows


def verify(package_path: Path, expected_digest: str, root: Path) -> dict:
    if not SHA.fullmatch(expected_digest):
        raise ValueError("invalid approved package digest")
    package = regular_bytes(package_path, MAX_PACKAGE)
    if hashlib.sha256(package).hexdigest() != expected_digest:
        raise ValueError("release package digest mismatch")
    manifest = payload_manifest(payload_from_package(package))
    if root.is_symlink() or not root.is_dir() or root.resolve() != root.absolute():
        raise ValueError("untrusted extracted root")
    seen = set()
    def reject_walk_error(error: OSError) -> None:
        raise error

    for directory, dirs, files in os.walk(root, followlinks=False, onerror=reject_walk_error):
        for name in dirs:
            if (Path(directory) / name).is_symlink():
                raise ValueError("symlinked extracted directory")
        for name in files:
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            # Burrito writes this nonexecutable metadata after extracting the payload.
            if relative == "_metadata.json" and relative not in manifest:
                regular_bytes(path, 65536)
                if path.stat().st_mode & 0o111:
                    raise ValueError("executable extraction metadata")
                continue
            expected = manifest.get(relative)
            if expected is None:
                raise ValueError("unexpected extracted file")
            content = regular_bytes(path, expected["size"])
            if (len(content) != expected["size"] or hashlib.sha256(content).hexdigest() != expected["sha256"]
                    or stat.S_IMODE(path.stat().st_mode) != expected["mode"]):
                raise ValueError("extracted file differs from approved package")
            seen.add(relative)
    if seen != set(manifest):
        raise ValueError("extracted files missing")
    return {"schema": "symphony-upstream-payload-verification/v1", "packageSha256": expected_digest,
            "payloadManifestSha256": hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest(),
            "verifiedFiles": len(manifest), "runtimeIdentity": "unverified", "admission": "unverified"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--extracted-root", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.package, args.sha256, args.extracted_root), sort_keys=True))
