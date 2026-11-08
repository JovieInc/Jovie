"""Fleet audit shim: classification, refusal gates, spool format and pass-through behaviour."""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "scripts/fleet-audit/audit.py"
SPEC = importlib.util.spec_from_file_location("fleet_audit", CORE)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


@pytest.mark.parametrize("argv,kind,action", [
    (["pr", "list"], "read", "pr.list"),
    (["pr", "view", "123", "--json", "state"], "read", "pr.view"),
    (["api", "repos/JovieInc/Jovie/actions/runs"], "read", "api.GET"),
    (["api", "graphql", "-f", "query={ viewer { login } }"], "read", "graphql.query"),
    (["run", "list", "-R", "JovieInc/Jovie"], "read", "run.list"),
    (["workflow", "list"], "read", "workflow.list"),
    (["pr", "merge", "123", "--squash", "--auto"], "mutating", "pr.merge"),
    (["pr", "close", "5"], "mutating", "pr.close"),
    (["pr", "comment", "5", "--body", "hi"], "mutating", "pr.comment"),
    (["workflow", "enable", "Lane Fix Relay"], "mutating", "workflow.enable"),
    (["workflow", "run", "ci.yml", "--ref", "main"], "mutating", "workflow.run"),
    (["secret", "set", "FOO", "--body", "x"], "mutating", "secret.set"),
    (["api", "-X", "POST", "repos/o/r/actions/runs/1/cancel"], "mutating", "api.POST"),
    (["api", "repos/o/r/issues/1/labels", "-f", "labels[]=x"], "mutating", "api.POST"),
    (["api", "graphql", "-f", "query=mutation { dequeuePullRequest(input:{id:\"PR_1\"}) { clientMutationId } }"],
     "mutating", "graphql.dequeuePullRequest"),
    (["workflow", "disable", "Lane Fix Relay", "-R", "JovieInc/Jovie"], "dangerous", "workflow.disable"),
    (["api", "-X", "PUT", "repos/o/r/actions/workflows/368087390/disable"], "dangerous", "workflow.disable"),
    (["api", "-X", "PUT", "repos/o/r/rulesets/24952446", "--input", "r.json"], "dangerous", "ruleset.edit"),
    (["api", "--method=DELETE", "repos/o/r/branches/main/protection"], "dangerous", "branch_protection.edit"),
    (["api", "-X", "DELETE", "repos/o/r/actions/secrets/FOO"], "dangerous", "secret.delete"),
    (["secret", "delete", "FOO"], "dangerous", "secret.delete"),
    (["pr", "merge", "1", "--admin"], "dangerous", "pr.merge_admin"),
    (["api", "graphql", "-f", "query=mutation { updateRepositoryRuleset(input:{}) { ruleset { id } } }"],
     "dangerous", "graphql.updateRepositoryRuleset"),
])
def test_classify_gh(argv, kind, action):
    got = audit.classify_gh(argv)
    assert (got["kind"], got["action"]) == (kind, action)


def test_api_repo_is_derived_from_path():
    got = audit.classify_gh(["api", "-X", "PUT", "repos/JovieInc/Jovie/actions/workflows/368087390/disable"])
    assert got["repo"] == "JovieInc/Jovie"
    assert got["target"] == "repos/JovieInc/Jovie/actions/workflows/368087390/disable"


@pytest.mark.parametrize("argv,kind,action", [
    (["origin", "feat/x"], "mutating", "git.push"),
    (["-u", "origin", "HEAD:refs/heads/feat/x"], "mutating", "git.push"),
    (["--force-with-lease", "origin", "feat/x"], "mutating", "git.push_force"),
    (["--force", "origin", "main"], "dangerous", "git.push_force"),
    (["origin", "+HEAD:main"], "dangerous", "git.push"),
    (["origin", "--delete", "main"], "dangerous", "git.push_delete"),
    (["origin", ":main"], "dangerous", "git.push"),
])
def test_classify_git_push(argv, kind, action):
    got = audit.classify_git_push(argv)
    assert (got["kind"], got["action"]) == (kind, action)


def test_audit_flags_are_stripped_and_env_fallback(monkeypatch):
    rest, reason, issue = audit.extract_audit_flags(
        ["workflow", "disable", "X", "--audit-reason", "flooding queue", "--audit-issue=JOV-1"])
    assert rest == ["workflow", "disable", "X"]
    assert (reason, issue) == ("flooding queue", "JOV-1")
    monkeypatch.setenv("JOVIE_AUDIT_REASON", "from env")
    assert audit.extract_audit_flags(["pr", "close", "1"])[1] == "from env"


def test_actor_prefers_explicit_then_claude(monkeypatch):
    for k in list(os.environ):
        if k.startswith(("CLAUDE", "CODEX_", "JOVIE_AGENT", "GITHUB_ACTIONS", "AI_AGENT")):
            monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("CLAUDE_CODE_SESSION_ID", "s-1")
    monkeypatch.setenv("CLAUDE_CODE_CHILD_SESSION", "1")
    assert audit.actor() == ("claude-subagent", "s-1")
    monkeypatch.setenv("JOVIE_AGENT_ID", "lane:fix-red")
    assert audit.actor() == ("lane:fix-red", "s-1")


# ---------------------------------------------------------------- end to end through the wrapper

@pytest.fixture()
def fake_gh(tmp_path):
    log = tmp_path / "calls.log"
    fake = tmp_path / "fake-gh"
    fake.write_text(
        "#!/usr/bin/env bash\n"
        f"echo \"$*\" >> {log}\n"
        "if [ \"$1 $2\" = 'workflow view' ]; then echo active; fi\n"
        "exit ${FAKE_RC:-0}\n")
    fake.chmod(0o755)
    return fake, log


def run_shim(tmp_path, fake, *argv, env=None):
    e = {k: v for k, v in os.environ.items() if not k.startswith(("JOVIE_AUDIT", "FLEET_AUDIT"))}
    e.update({"JOVIE_AUDIT_REAL_GH": str(fake), "JOVIE_AUDIT_STATE_DIR": str(tmp_path / "state"),
              "JOVIE_AUDIT_HOST": "testhost", "JOVIE_AGENT_ID": "pytest", "PATH": "/usr/bin:/bin"})
    e.update(env or {})
    return subprocess.run([sys.executable, "-I", str(CORE), "wrap", "gh", *argv], env=e,
                          capture_output=True, text=True, timeout=30)


def spool(tmp_path):
    p = tmp_path / "state/spool.jsonl"
    return [json.loads(ln) for ln in p.read_text().splitlines()] if p.exists() else []


def test_reads_pass_through_and_are_not_logged(tmp_path, fake_gh):
    fake, log = fake_gh
    r = run_shim(tmp_path, fake, "pr", "list")
    assert r.returncode == 0
    assert log.read_text().strip() == "pr list"
    assert spool(tmp_path) == []


def test_mutating_call_is_logged_with_outcome(tmp_path, fake_gh):
    fake, log = fake_gh
    r = run_shim(tmp_path, fake, "pr", "close", "7", "-R", "JovieInc/Jovie", "--audit-reason", "dup of #6")
    assert r.returncode == 0
    assert "--audit-reason" not in log.read_text()
    (ev,) = spool(tmp_path)
    assert ev["action"] == "pr.close" and ev["target"] == "7" and ev["repo"] == "JovieInc/Jovie"
    assert ev["actor_agent"] == "pytest" and ev["host"] == "testhost"
    assert ev["reason"] == "dup of #6" and ev["outcome"] == "ok" and ev["danger"] == 0
    assert len(json.dumps(ev)) < 700


def test_failed_command_records_exit_code(tmp_path, fake_gh):
    fake, _ = fake_gh
    r = run_shim(tmp_path, fake, "pr", "merge", "9", env={"FAKE_RC": "3"})
    assert r.returncode == 3
    assert spool(tmp_path)[0]["outcome"] == "exit:3"


def test_workflow_disable_refused_without_reason_or_issue(tmp_path, fake_gh):
    fake, log = fake_gh
    r = run_shim(tmp_path, fake, "workflow", "disable", "Lane Fix Relay")
    assert r.returncode == 64 and "needs a reason" in r.stderr
    r = run_shim(tmp_path, fake, "workflow", "disable", "Lane Fix Relay", "--audit-reason", "queue flood stopgap")
    assert r.returncode == 64 and "linked issue" in r.stderr
    assert not log.exists()
    assert spool(tmp_path) == []


def test_workflow_disable_with_reason_and_issue_records_before_after(tmp_path, fake_gh):
    fake, log = fake_gh
    r = run_shim(tmp_path, fake, "workflow", "disable", "Lane Fix Relay", "-R", "JovieInc/Jovie",
                 "--audit-reason", "queue flood stopgap", "--audit-issue", "JOV-1")
    assert r.returncode == 0
    (ev,) = spool(tmp_path)
    assert ev["danger"] == 1 and ev["action"] == "workflow.disable" and ev["issue"] == "JOV-1"
    assert ev["before"] == "active" and ev["after"] == "active"  # fake gh always says active
    assert "workflow disable Lane Fix Relay -R JovieInc/Jovie" in log.read_text()


def test_flush_posts_signed_batches(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "STATE_DIR", tmp_path)
    monkeypatch.setattr(audit, "SPOOL", tmp_path / "spool.jsonl")
    monkeypatch.setattr(audit, "FLUSH_STAMP", tmp_path / "last-flush")
    monkeypatch.setenv("FLEET_AUDIT_INGEST_SECRET", "s3cret")
    (tmp_path / "spool.jsonl").write_text('{"id":"a"}\n{"id":"b"}\n')
    sent = []

    def fake_post(path, body, secret, timeout=15):
        sent.append((path, json.loads(body), audit.sign(body, secret)))
        return 202, b"{}"

    monkeypatch.setattr(audit, "post_json", fake_post)
    assert audit.flush(force=True) == 2
    assert sent[0][0] == "/v1/events" and [r["id"] for r in sent[0][1]] == ["a", "b"]
    assert sent[0][2].startswith("sha256=")
    assert not list(tmp_path.glob("sending-*.jsonl"))


def test_flush_keeps_file_when_transport_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "STATE_DIR", tmp_path)
    monkeypatch.setattr(audit, "SPOOL", tmp_path / "spool.jsonl")
    monkeypatch.setattr(audit, "FLUSH_STAMP", tmp_path / "last-flush")
    monkeypatch.setenv("FLEET_AUDIT_INGEST_SECRET", "s3cret")
    (tmp_path / "spool.jsonl").write_text('{"id":"a"}\n')

    def boom(*a, **k):
        raise OSError("offline")

    monkeypatch.setattr(audit, "post_json", boom)
    assert audit.flush(force=True) == 0
    assert len(list(tmp_path.glob("sending-*.jsonl"))) == 1


# ---------------------------------------------------------------- doppler guard (2026-10-29 incident)

@pytest.mark.parametrize("argv,kind,action,target", [
    (["secrets", "delete", "CLERK_WEBHOOK_SECRET", "--project", "jovie-web", "--config", "prd", "--yes"],
     "mutating", "doppler.secrets.delete", "CLERK_WEBHOOK_SECRET"),
    (["secrets", "set", "A=supersecretvalue", "B=other", "-p", "jovie-web", "-c", "prd"],
     "mutating", "doppler.secrets.set", "A,B"),
    (["secrets", "set", "API_KEY", "VALUE_THAT_LOOKS_LIKE_A_NAME"], "mutating", "doppler.secrets.set", "API_KEY"),
    (["secrets", "-p", "jovie-web", "-c", "prd"], "refuse", "doppler.secrets.list", None),
    (["secrets", "download", "--no-file"], "refuse", "doppler.secrets.download", None),
    (["secrets", "get", "STRIPE_SECRET_KEY"], "refuse", "doppler.secrets.get", None),
    (["secrets", "--only-names", "-p", "jovie-web", "-c", "prd"], "read", "doppler.secrets.", None),
    (["secrets", "get", "X", "--plain"], "read", "doppler.secrets.get_plain", None),
    (["run", "--", "pnpm", "dev"], "read", "doppler.run", None),
])
def test_classify_doppler(argv, kind, action, target):
    got = audit.classify_doppler(argv)
    assert (got["kind"], got["action"]) == (kind, action)
    if target is not None:
        assert got["target"] == target
    assert "supersecretvalue" not in json.dumps(got) and "VALUE_THAT_LOOKS" not in json.dumps(got)


@pytest.fixture()
def fake_doppler(tmp_path):
    fake = tmp_path / "fake-doppler"
    fake.write_text("#!/usr/bin/env bash\necho 'NAME  VALUE'; echo 'STRIPE_SECRET_KEY  sk_live_LEAK'\n")
    fake.chmod(0o755)
    return fake


def run_doppler(tmp_path, fake, *argv, agent=True):
    e = {k: v for k, v in os.environ.items()
         if not k.startswith(("JOVIE_AUDIT", "FLEET_AUDIT", "CLAUDE", "CODEX_", "JOVIE_AGENT", "GITHUB_ACTIONS"))}
    e.update({"JOVIE_AUDIT_REAL_DOPPLER": str(fake), "JOVIE_AUDIT_STATE_DIR": str(tmp_path / "state"),
              "JOVIE_AUDIT_HOST": "testhost", "PATH": "/usr/bin:/bin"})
    if agent:
        e["JOVIE_AGENT_ID"] = "pytest"
    return subprocess.run([sys.executable, "-I", str(CORE), "wrap", "doppler", *argv], env=e,
                          capture_output=True, text=True, timeout=30)


def test_doppler_delete_output_is_suppressed_and_logged_by_name(tmp_path, fake_doppler):
    r = run_doppler(tmp_path, fake_doppler, "secrets", "delete", "CLERK_WEBHOOK_SECRET", "-p", "jovie-web",
                    "-c", "prd", "--yes")
    assert r.returncode == 0
    assert "sk_live_LEAK" not in r.stdout + r.stderr
    (ev,) = spool(tmp_path)
    assert ev["action"] == "doppler.secrets.delete" and ev["target"] == "CLERK_WEBHOOK_SECRET"
    assert ev["repo"] == "jovie-web/prd"
    assert "sk_live" not in json.dumps(ev)


def test_doppler_listing_refused_for_agents_allowed_for_humans(tmp_path, fake_doppler):
    r = run_doppler(tmp_path, fake_doppler, "secrets", "-p", "jovie-web", "-c", "prd")
    assert r.returncode == 64 and "sk_live_LEAK" not in r.stdout
    r = run_doppler(tmp_path, fake_doppler, "secrets", "-p", "jovie-web", "-c", "prd", agent=False)
    assert r.returncode == 0 and "STRIPE_SECRET_KEY" in r.stdout


HOOK = ROOT / "scripts/fleet-audit/hooks/block_secret_output.py"


@pytest.mark.parametrize("command,blocked", [
    ("doppler secrets delete CLERK_WEBHOOK_SECRET --project jovie-web --config prd --yes", True),
    ("doppler secrets delete X -p a -c b --yes >/dev/null", False),
    ("doppler secrets -p jovie-web -c prd", True),
    ("doppler secrets", True),
    ("doppler secrets --only-names -p jovie-web -c prd", False),
    ("doppler secrets download --no-file", True),
    ("doppler secrets get STRIPE_SECRET_KEY -p jovie-web -c prd", True),
    ("doppler secrets get STRIPE_SECRET_KEY --plain", True),
    ("doppler secrets get STRIPE_SECRET_KEY --plain | cat", True),
    ("doppler secrets get KEY --plain | wrangler secret put KEY", False),
    ("curl -H \"Authorization: Bearer $(doppler secrets get TOKEN --plain)\" https://x", False),
    ("doppler run -- printenv", True),
    ("doppler run -- pnpm test", False),
    ("env | grep -i claude", True),
    ("env | cut -d= -f1", False),
    ("printenv HOME", False),
    ("cat apps/web/.env.local", True),
    ("cat .env.example", False),
    ("gh pr list", False),
])
def test_hook(command, blocked):
    r = subprocess.run([sys.executable, "-I", str(HOOK)], input=json.dumps(
        {"tool_name": "Bash", "tool_input": {"command": command}}), capture_output=True, text=True, timeout=10)
    assert (r.returncode == 2) == blocked, (command, r.stderr)


def test_events_resolve_an_exact_repo_from_the_git_remote(tmp_path, monkeypatch):
    repo = tmp_path / "r"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "remote", "add", "origin", "git@github.com:JovieInc/Jovie.git"], check=True)
    monkeypatch.chdir(repo)
    monkeypatch.delenv("GH_REPO", raising=False)
    assert audit.resolve_repo({"repo": None}, "gh")["repo"] == "JovieInc/Jovie"
    assert audit.resolve_repo({"repo": "origin"}, "git")["repo"] == "JovieInc/Jovie"
    assert audit.resolve_repo({"repo": "JovieInc/gbrain"}, "gh")["repo"] == "JovieInc/gbrain"
