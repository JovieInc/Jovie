#!/usr/bin/env python3
"""Decode and verify a dated evidence index; never certify admission or runtime."""

import argparse
import hashlib
import json
from pathlib import Path


RECORDS = {
    "requirement": "requirements",
    "artifact": "artifacts",
    "blocker": "blockers",
    "change": "changes",
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def jsonl(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or any(not line.strip() for line in lines):
        raise ValueError(f"Empty JSONL record: {path}")
    values = [json.loads(line) for line in lines]
    if any(not isinstance(value, dict) for value in values):
        raise ValueError(f"JSONL records must be objects: {path}")
    return values


def load_index(path):
    records = jsonl(Path(path))
    if records[0].get("recordType") != "metadata":
        raise ValueError("First record must be metadata")
    index = dict(records[0]["value"])
    for name in RECORDS.values():
        if name in index:
            raise ValueError(f"Duplicate collection in metadata: {name}")
        index[name] = []
    for record in records[1:]:
        kind = record.get("recordType")
        if kind not in RECORDS or not isinstance(record.get("value"), dict):
            raise ValueError(f"Unsupported record: {kind}")
        index[RECORDS[kind]].append(record["value"])
    for name in ("requirements", "artifacts", "blockers"):
        ids = [row["id"] for row in index[name]]
        if len(ids) != len(set(ids)):
            raise ValueError(f"Duplicate IDs in {name}")
    return index


def artifact_path(root, artifact):
    path = (root / artifact["path"]).resolve()
    path.relative_to(root.resolve())
    return path


def source_bytes(root, artifact):
    path = artifact_path(root, artifact)
    if sha256(path.read_bytes()) != artifact["sha256"]:
        raise ValueError(f"Stored artifact digest mismatch: {artifact['id']}")
    if artifact.get("serialization") != "lossless-utf8-source-record":
        raise ValueError("Extraction requires a lossless source record")
    matches = [row for row in jsonl(path) if row.get("artifactId") == artifact["recordId"]]
    if len(matches) != 1:
        raise ValueError(f"Missing or duplicate source record: {artifact['id']}")
    row = matches[0]
    data = row["content"].encode("utf-8")
    if sha256(data) != row["sha256"] or sha256(data) != artifact["originalSha256"]:
        raise ValueError(f"Restored source digest mismatch: {artifact['id']}")
    return data


def verify(index_path, root):
    index = load_index(index_path)
    ids = {row["id"] for row in index["artifacts"]}
    unknown = []
    for artifact in index["artifacts"]:
        if "path" not in artifact:
            unknown.append(artifact["id"])
            continue
        path = artifact_path(root, artifact)
        if sha256(path.read_bytes()) != artifact["sha256"]:
            raise ValueError(f"Stored artifact digest mismatch: {artifact['id']}")
        if artifact.get("serialization") == "lossless-utf8-source-record":
            source_bytes(root, artifact)
        elif path.suffix == ".jsonl":
            jsonl(path)
    for row in index["requirements"]:
        missing = set(row["evidence"]) - ids
        if missing:
            raise ValueError(f"Unresolved evidence for {row['id']}: {sorted(missing)}")
    if index["missionStatus"] != "INCOMPLETE" or index["authority"]["certifiesAdmission"]:
        raise ValueError("This dated checkpoint must not certify admission")
    if index["authority"]["authorizedAdmissionCount"] != 0:
        raise ValueError("This checkpoint contains no admission authorization")
    return {
        "status": "INTEGRITY_PASS" if not unknown else "INTEGRITY_WITH_UNKNOWN_ARTIFACTS",
        "scope": "Stored bytes, source restoration and index references only; no readiness certification",
        "indexSha256": sha256(Path(index_path).read_bytes()),
        "requirements": len(index["requirements"]),
        "registeredArtifacts": len(index["artifacts"]),
        "unknownArtifacts": unknown,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("decode", "verify", "extract"))
    parser.add_argument("index", type=Path)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--artifact")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.action == "decode":
        print(json.dumps(load_index(args.index), indent=2))
    elif args.action == "verify":
        print(json.dumps(verify(args.index, args.root), indent=2))
    else:
        if not args.artifact or not args.output:
            parser.error("extract requires --artifact and --output")
        index = load_index(args.index)
        matches = [row for row in index["artifacts"] if row["id"] == args.artifact]
        if len(matches) != 1:
            raise ValueError("Artifact ID must match exactly one record")
        data = source_bytes(args.root, matches[0])
        with args.output.open("xb") as stream:
            stream.write(data)
        print(json.dumps({"path": str(args.output), "sha256": sha256(data)}))


if __name__ == "__main__":
    main()
