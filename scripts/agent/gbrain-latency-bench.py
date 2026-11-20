#!/usr/bin/env python3
"""Interleaved gbrain latency benchmark through the long-lived MCP stdio proxy.

usage: gbrain-latency-bench.py [--n 5] [--json]

Measures `query` with expansion forced on (the pre-2026-10-28 default), `query`
with no `expand` argument (what agents send; the proxy now defaults it off), and `search` on the
same prompts, interleaved so host load hits every arm equally. Reports p50/max
per arm. The proxy and daemon are the ones agents already use, so this is the
number an agent sees, not a cold-CLI number.
"""
import argparse, json, os, statistics, subprocess, sys, time

PROXY = os.path.expanduser("~/.gbrain/bin/gbrain-mcp-http-proxy.py")
PROMPTS = [
    "rate limit circuit breaker convention",
    "external api guard ratchet",
    "merge queue auto-merge policy",
    "lanes fetch cost",
    "credentials spend registry",
]
ARMS = {
    "query-expand-true (old default)": ("query", {"expand": True}),
    "query-default (proxy default)": ("query", {}),
    "search": ("search", {}),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=5)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    p = subprocess.Popen([sys.executable, PROXY], stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    seq = [0]

    def rpc(method, params):
        seq[0] += 1
        p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": seq[0], "method": method, "params": params}) + "\n")
        p.stdin.flush()
        while True:
            msg = json.loads(p.stdout.readline())
            if msg.get("id") == seq[0]:
                return msg

    rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {},
                       "clientInfo": {"name": "gbrain-latency-bench", "version": "1"}})
    times = {a: [] for a in ARMS}
    hits = {a: [] for a in ARMS}
    for i in range(args.n):
        for prompt in PROMPTS[: max(1, min(len(PROMPTS), args.n))]:
            q = f"{prompt} {i}" if i else prompt  # defeat the semantic cache after round 0
            for arm, (tool, extra) in ARMS.items():
                t = time.time()
                r = rpc("tools/call", {"name": tool, "arguments": {"query": q, "limit": 5, **extra}})
                times[arm].append(time.time() - t)
                text = json.dumps(r.get("result", r))
                hits[arm].append(0 if r.get("error") or "[]" == text else len(text))
    p.stdin.close()
    out = {a: {"n": len(v), "p50_s": round(statistics.median(v), 2), "max_s": round(max(v), 2)}
           for a, v in times.items()}
    print(json.dumps(out, indent=None if args.json else 2))


main()
