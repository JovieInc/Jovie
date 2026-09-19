"""Source-bound admission projection; no dispatch or policy mutation."""
import hashlib
import json
from datetime import datetime

MAX_CLOCK_SKEW_SECONDS = 60
EVIDENCE_MAX_AGE_SECONDS = 600
RUNTIME_URL = "http://127.0.0.1:4041/api/v1/state"


def parse_time(value, label):
    if not isinstance(value, str):
        raise TypeError(label)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(label)
    return parsed


def semantic_identity(value):
    if isinstance(value, list):
        return [semantic_identity(child) for child in value]
    if isinstance(value, dict):
        return {key: semantic_identity(child) for key, child in value.items() if key != 'observedAt'}
    return value


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def admission_projection(fleet, concurrency, now, main_revision, runtime_revision, attestation):
    """Project existing class decisions; never authorize an issue or infer from seats."""
    def recent(value):
        try:
            age = (now - parse_time(value, "admission authority")).total_seconds()
            return -MAX_CLOCK_SKEW_SECONDS <= age <= EVIDENCE_MAX_AGE_SECONDS
        except (ValueError, TypeError):
            return False

    def conjunction(*values):
        if any(value is False for value in values):
            return False
        return True if all(value is True for value in values) else None

    def object_or_empty(value):
        return value if isinstance(value, dict) else {}

    def row(value, source, revision, valid, schema, reason):
        state = 'ALLOWED' if value is True else 'HELD' if value is False else 'UNKNOWN'
        if not valid:
            state = 'UNKNOWN'
        return {"state": state, "sourceSchema": schema,
                "observedAt": source.get("observedAt") if valid else None,
                "sourceRevision": revision if valid else None,
                "sourceDigest": digest(semantic_identity(source)) if valid else None,
                "reason": reason if state != 'UNKNOWN' else 'source-evidence-unavailable'}

    work = object_or_empty(fleet.get("workAdmission"))
    closure = object_or_empty(fleet.get("closureAdmission"))
    repair = object_or_empty(fleet.get("remediationAdmission"))
    fleet_valid = (recent(fleet.get("observedAt")) and
                   fleet.get("signals", {}).get("queue", {}).get("repository") == 'JovieInc/Jovie')
    new_work = conjunction(work.get("allowed"), work.get("newImplementationAllowed"),
                           work.get("newIssueLeaseAllowed"), closure.get("newImplementationAllowed"),
                           closure.get("newIssueIntakeAllowed"))
    local_repair = conjunction(repair.get("allowed"), repair.get("localAllowed"),
                               closure.get("remediationContinues"),
                               True if repair.get("authority") == 'single-pr-writer-exact-head' else None)
    report = object_or_empty(concurrency)
    scope = object_or_empty(report.get("resourceScope"))
    runtime = object_or_empty(object_or_empty(attestation).get("runtime"))
    provenance = object_or_empty(report.get("provenance"))
    report_valid = (report.get("schema") == 'symphony-concurrency/v1' and
                    recent(report.get("observedAt")) and recent(provenance.get("observedAt")) and
                    runtime_revision is not None and report.get("sourceRevision") == runtime_revision and
                    provenance.get("sourceRevision") == runtime_revision and
                    scope.get("repository") == 'JovieInc/Jovie' and
                    scope.get("runtimeUrl") == RUNTIME_URL and
                    isinstance(runtime.get("workflowPath"), str) and
                    scope.get("workflow") == runtime["workflowPath"])
    provider = object_or_empty(report.get("provider"))
    downstream = object_or_empty(report.get("downstream"))
    return {
        "schema": 'jovie.eve.summer-admissions-projection/v1',
        "repository": 'JovieInc/Jovie',
        "authorityScope": 'observed-class-admission-task-acceptance-required',
        "newImplementation": row(new_work, fleet, main_revision, fleet_valid,
            'jovie-fleet-gate/v1', 'new-implementation-gate'),
        "ownedRemediation": row(local_repair, fleet, main_revision, fleet_valid,
            'jovie-fleet-gate/v1', 'single-pr-writer-exact-head-required'),
        "push": row(repair.get("pushAllowed"), fleet, main_revision, fleet_valid,
            'jovie-fleet-gate/v1', 'independent-push-gate'),
        "providerEligibility": row(provider.get("eligible"), report, runtime_revision,
            report_valid and provider.get("source") == 'active-issue-authenticated-routes',
            'symphony-concurrency/v1', 'authenticated-provider-route-gate'),
        "downstreamHealth": row(downstream.get("healthy"), report, runtime_revision,
            report_valid and downstream.get("repository") == 'JovieInc/Jovie',
            'symphony-concurrency/v1', 'downstream-health-observation'),
    }


