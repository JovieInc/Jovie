"""Linux worker cgroups, with an observed startup receipt before dispatch counts them.

Compose systemd's existing scope mechanism; do not add an executor or scheduler.
Scope mode preserves the CLI authentication environment and inherited lifecycle
lock descriptors. Failure never retries the worker outside its resource scope.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import select
import subprocess
import sys
import time
import uuid

SCHEMA = "jovie-worker-resources/v1"
GIB = 1024 ** 3
# Web checks permit two 8-GiB V8 forks. Leave room for their coordinator/native
# allocations; the host user slice and existing gate seats bound aggregate use.
DEFAULT_LIMITS = {"memoryHigh": 12 * GIB, "memoryMax": 20 * GIB,
                  "memorySwapMax": 0, "tasksMax": 512, "cpuPercent": 200}
START_TIMEOUT = 10


class ResourceHeld(RuntimeError):
    pass


def limits_from_env(env: dict) -> dict:
    limits = dict(DEFAULT_LIMITS)
    for key, suffix in (("memoryHigh", "MEMORY_HIGH_BYTES"), ("memoryMax", "MEMORY_MAX_BYTES"),
                        ("tasksMax", "TASKS_MAX"), ("cpuPercent", "CPU_PERCENT")):
        raw = env.get("LANES_WORKER_" + suffix)
        if raw is not None:
            if not str(raw).isdecimal() or int(raw) <= 0:
                raise ResourceHeld("worker-resource-invalid-" + suffix.lower())
            limits[key] = int(raw)
    if limits["memoryHigh"] > limits["memoryMax"]:
        raise ResourceHeld("worker-resource-memory-high-exceeds-max")
    return limits


def observed_limits(unit: str, limits: dict, *, proc_cgroup=Path("/proc/self/cgroup"),
                    cgroup_root=Path("/sys/fs/cgroup")) -> dict:
    if not re.fullmatch(r"jovie-lane-[a-z0-9-]+-[0-9a-f]{32}\.scope", unit):
        raise ResourceHeld("worker-resource-unit-invalid")
    lines = proc_cgroup.read_text().splitlines()
    unified = [line[3:] for line in lines if line.startswith("0::")]
    if len(unified) != 1:
        raise ResourceHeld("worker-resource-cgroup-v2-unavailable")
    relative = Path(unified[0])
    if not relative.is_absolute() or ".." in relative.parts or relative.name != unit:
        raise ResourceHeld("worker-resource-scope-mismatch")
    group = cgroup_root / str(relative).lstrip("/")
    measured = {}
    for key, file in (("memoryHigh", "memory.high"), ("memoryMax", "memory.max"),
                      ("memorySwapMax", "memory.swap.max"), ("tasksMax", "pids.max")):
        value = (group / file).read_text().strip()
        if not value.isdecimal() or int(value) != limits[key]:
            raise ResourceHeld("worker-resource-limit-mismatch:" + file)
        measured[key] = int(value)
    cpu = (group / "cpu.max").read_text().split()
    if (len(cpu) != 2 or not all(value.isdecimal() for value in cpu)
            or int(cpu[1]) <= 0 or int(cpu[0]) * 100 != limits["cpuPercent"] * int(cpu[1])):
        raise ResourceHeld("worker-resource-limit-mismatch:cpu.max")
    measured["cpuPercent"] = limits["cpuPercent"]
    return {"schema": SCHEMA, "ok": True, "unit": unit, "cgroup": str(relative),
            "workerPid": os.getpid(), "limits": measured, "verifiedAt": time.time()}


def receive_receipt(fd: int, *, timeout=START_TIMEOUT) -> dict:
    deadline, payload = time.monotonic() + timeout, b""
    while b"\n" not in payload:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([fd], [], [], max(0, remaining))[0]:
            raise ResourceHeld("worker-resource-start-timeout")
        part = os.read(fd, 4096)
        if not part:
            raise ResourceHeld("worker-resource-start-exited")
        payload += part
        if len(payload) > 4096:
            raise ResourceHeld("worker-resource-receipt-oversized")
    try:
        receipt = json.loads(payload.split(b"\n", 1)[0])
    except (ValueError, UnicodeError) as error:
        raise ResourceHeld("worker-resource-receipt-invalid") from error
    if not isinstance(receipt, dict) or receipt.get("schema") != SCHEMA or receipt.get("ok") is not True:
        raise ResourceHeld("worker-resource-verification-failed")
    return receipt


def spawn(command: list[str], *, provider: str, **kwargs) -> dict:
    env = dict(kwargs.pop("env", os.environ))
    # Existing hermetic local-test dispatch fixtures use synthetic processes.
    # This is a test backend, never a production fallback on a scope failure.
    if env.get("LANES_EXECUTION_BACKEND") == "local-test" or sys.platform != "linux":
        subprocess.Popen(command, env=env, **kwargs)
        return {"schema": SCHEMA, "mode": "local-test" if sys.platform == "linux" else "non-linux"}
    if not re.fullmatch(r"[a-z0-9-]+", provider):
        raise ResourceHeld("worker-resource-provider-invalid")
    limits = limits_from_env(env)
    unit = f"jovie-lane-{provider}-{uuid.uuid4().hex}.scope"
    read_fd, write_fd = os.pipe()
    properties = {"MemoryHigh": limits["memoryHigh"], "MemoryMax": limits["memoryMax"],
                  "MemorySwapMax": limits["memorySwapMax"], "TasksMax": limits["tasksMax"],
                  "CPUQuota": str(limits["cpuPercent"]) + "%"}
    scoped = ["systemd-run", "--user", "--scope", "--quiet", "--collect", "--no-ask-password",
              "--expand-environment=no", "--unit=" + unit,
              *(f"--property={key}={value}" for key, value in properties.items()), "--",
              sys.executable, str(Path(__file__).resolve()), "--unit", unit,
              "--receipt-fd", str(write_fd), "--limits", json.dumps(limits), "--", *command]
    descriptors = tuple(dict.fromkeys((*kwargs.pop("pass_fds", ()), write_fd)))
    started = False
    try:
        subprocess.Popen(scoped, env=env, pass_fds=descriptors, **kwargs)
        started = True
        os.close(write_fd)
        write_fd = None
        receipt = receive_receipt(read_fd)
        if receipt.get("unit") != unit or receipt.get("limits") != limits:
            raise ResourceHeld("worker-resource-receipt-mismatch")
        return receipt
    except (OSError, ResourceHeld) as error:
        # The exact UUID-named scope belongs to this attempted launch only.
        # Stopping it cannot touch an existing worker or the shared lanes unit.
        cleanup = "not-started"
        if started:
            try:
                result = subprocess.run(["systemctl", "--user", "stop", unit],
                                        capture_output=True, timeout=10, check=False)
                cleanup = "requested" if result.returncode == 0 else "unproven"
            except (OSError, subprocess.TimeoutExpired):
                cleanup = "unproven"
        raise ResourceHeld(f"worker-resource-held:{type(error).__name__}:{error};cleanup={cleanup}") from error
    finally:
        os.close(read_fd)
        if write_fd is not None:
            os.close(write_fd)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--unit", required=True)
    parser.add_argument("--receipt-fd", type=int, required=True)
    parser.add_argument("--limits", required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    try:
        if args.receipt_fd < 3 or not command:
            raise ResourceHeld("worker-resource-command-invalid")
        receipt = observed_limits(args.unit, json.loads(args.limits))
        os.write(args.receipt_fd, (json.dumps(receipt) + "\n").encode())
        os.close(args.receipt_fd)
        os.execvpe(command[0], command, os.environ)
    except (OSError, ValueError, ResourceHeld) as error:
        # Never print environment/arguments/auth data to the shared logs.
        print(f"worker-resource-refused:{type(error).__name__}", file=sys.stderr)
        return 78
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
