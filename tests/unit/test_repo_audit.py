from scripts.ops_repo_audit import check


def test_repo_audit_detects_tracked_secrets():
    assert len(check([".env", "frontend/.env.local", "ops/private.key", "id_rsa"])) == 4


def test_repo_audit_allows_documented_templates():
    assert check([".env.example", "frontend/.env.example", ".env.docker.example"]) == []
