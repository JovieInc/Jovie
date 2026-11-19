"""Source assertions for independent staging and exact canonical identity reads."""

from pathlib import Path


def assert_staging_controller_contract(repo_root: Path) -> None:
    staging = (repo_root / ".github/workflows/staging-controller.yml").read_text()
    production = (repo_root / ".github/workflows/production-controller.yml").read_text()
    identity_reader = (repo_root / ".github/scripts/staging-identity-read.sh").read_text()
    assert "workflows: [CI]" in staging
    assert "group: staging-mutation" in staging
    assert "outcome=not_applicable" in staging
    assert "product-lane-release-${candidate_sha}-${candidate_attempt}" in staging
    assert "release_mode: staging" in staging
    assert "fleet-promotion" not in staging
    assert "release_mode: production" in production
    assert 'staging_receipt_sha="$web_evidence_sha"' in production
    assert production.count("bash .github/scripts/staging-identity-read.sh") == 3
    assert (
        'url="${STAGING_IDENTITY_URL:-https://staging.jov.ie/api/health/build-info}"'
        in identity_reader
    )
