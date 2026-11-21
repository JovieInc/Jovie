"""Read-only swarm operator commands, split out so pr_remediation_swarm.py stays inside the size ratchet.

Helpers are resolved at call time from pr_remediation_swarm so existing tests can still patch
swarm.gh_json, swarm.fetch_job_log, swarm.gh_version, and swarm.cmd_smoke on that module.
"""
# api-budget: github-app-core 200/hr - moved with cmd_smoke/cmd_diagnose from pr_remediation_swarm.py; smoke uses at most 2 run lists, 40 job reads and 6 log fetches per run (App token, not GITHUB_TOKEN); diagnose is an occasional local replay

from __future__ import annotations

import json
import re


def _s():
    import pr_remediation_swarm as swarm
    return swarm


def gh_version() -> str:
    s = _s()
    run_gh = s.run_gh
    try:
        first = run_gh(["--version"])["stdout"].splitlines()[0]
        return first.split()[2] if first.startswith("gh version") else first
    except (OSError, IndexError):
        return "unknown"


def cmd_smoke(a) -> int:
    """Prove the production log-read path before fanout; absent evidence fails closed.

    Conclusion-filtered lists avoid skipped/cancelled firehose starvation. Bound
    collection to two lists, forty job reads and six actual log attempts.
    """
    s = _s()
    gh_version = s.gh_version
    out_var = s.out_var
    MIN_GH = s.MIN_GH
    gh_json = s.gh_json
    REPO = s.REPO
    fetch_job_log = s.fetch_job_log
    version = gh_version()
    parts = tuple(int(x) for x in re.findall(r"\d+", version)[:3]) or (0,)
    print(f"gh version {version} (minimum {'.'.join(map(str, MIN_GH))})")
    out_var("gh_version", version)
    if parts < MIN_GH:
        print(f"::error title=swarm smoke::gh {version} is older than the supported minimum")
        return 1
    conclusions: dict[str, int] = {}
    scanned = eligible_runs = eligible_jobs = tried = 0
    seen_runs = set()
    for status in ("failure", "success"):
        runs = gh_json(["api", f"repos/{REPO}/actions/runs?status={status}&per_page=20"], priority="report")["workflow_runs"]
        for run in runs[:20]:
            if run["id"] in seen_runs:
                continue
            seen_runs.add(run["id"])
            conc = run.get("conclusion") or "none"
            conclusions[conc] = conclusions.get(conc, 0) + 1
            scanned += 1
            if conc not in {"success", "failure"}:
                continue
            jobs = gh_json(["api", f"repos/{REPO}/actions/runs/{run['id']}/jobs?per_page=100"], priority="report")["jobs"]
            eligible = [j for j in jobs[:100] if j.get("conclusion") in {"success", "failure"} and j.get("started_at")]
            if eligible:
                eligible_runs += 1
            for job in eligible:
                eligible_jobs += 1
                log = fetch_job_log(job["id"])
                size = len(log.stdout or "")
                tried += 1
                print(f"smoke job {job['id']} ({job['name']}): rc={log.returncode} bytes={size} err={(log.stderr or '')[:100]!r}")
                if log.returncode == 0 and size > 0:
                    return 0
                if "escape" in (log.stderr or "") or tried >= 6:
                    print(f"::error title=swarm smoke::job log fetch returned rc={log.returncode} bytes={size}; gh {version} cannot read job logs")
                    return 1
    print(f"::error title=swarm smoke::no readable completed job log to smoke-test the log fetch "
          f"(scanned {scanned} runs, conclusions={json.dumps(conclusions, sort_keys=True)}, "
          f"eligible_runs={eligible_runs}, eligible_jobs={eligible_jobs}, log_attempts={tried}); log path unverified")
    return 1


def cmd_diagnose(a) -> int:
    """Local, read-only replay of the runner's gate for PRs: the same API calls, job selection and
    extraction as prepare_red, with whatever token `gh` holds. Posts nothing, claims nothing."""
    s = _s()
    gh_json = s.gh_json
    REPO = s.REPO
    latest_failures = s.latest_failures
    fetch_job_log = s.fetch_job_log
    extract_failure = s.extract_failure
    concrete_error = s.concrete_error
    classes = s.classes
    for n in (int(x) for x in a.prs.split(",") if x.strip()):
        pr = gh_json(["api", f"repos/{REPO}/pulls/{n}"])
        sha = pr["head"]["sha"]
        runs = gh_json(["api", f"repos/{REPO}/commits/{sha}/check-runs?per_page=100"])["check_runs"]
        latest: dict[str, dict] = {}
        for r in runs:
            if r["name"] not in latest or r["id"] > latest[r["name"]]["id"]:
                latest[r["name"]] = r
        print(f"== #{n} {sha[:9]} state={pr['mergeable_state']} check-runs={len(runs)} distinct={len(latest)}")
        failures, pending = latest_failures(sha)
        print(f"   failing={[r['name'] for r in failures]} pending={pending}")
        for r in failures[:4]:
            app = (r.get("app") or {}).get("slug")
            m = re.search(r"/runs/(\d+)/job/(\d+)", r.get("details_url") or "")
            out = fetch_job_log(r["id"])
            attempt = ""
            if m:
                job = gh_json(["api", f"repos/{REPO}/actions/jobs/{m.group(2)}"])
                attempt = f" run_attempt={job.get('run_attempt')} job_conclusion={job.get('conclusion')} id_match={str(job['id']) == str(r['id'])}"
            text = extract_failure(out.stdout) if out.returncode == 0 else ""
            print(f"   - {r['name']!r} id={r['id']} app={app} conclusion={r['conclusion']} details={'job' if m else 'NO-JOB-URL'}"
                  f" logs rc={out.returncode} bytes={len(out.stdout or '')} err={(out.stderr or '')[:80]!r}{attempt}")
            print(f"     extract_lines={len(text.splitlines())} concrete={concrete_error(text)} classify={classes.classify({'mergeStateStatus': 'BLOCKED', 'statusCheckRollup': [{'name': r['name'], 'conclusion': r['conclusion'].upper()}]}, {r['name']: text})['cls']}")
            if a.show:
                print("     " + text.split("--- tail ---")[0][-600:].replace("\n", "\n     "))
    return 0
