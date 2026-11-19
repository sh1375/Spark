from __future__ import annotations

from config.models import EnvironmentConfig
from roles.environment.health import inspect_environment
from .models import RemoteOperation, RemoteResult


def _node_status(results: tuple[RemoteResult, ...], role: str, index: int = 1) -> str:
    node_ids: list[str] = []
    for item in results:
        if item.node.role == role and item.node.id not in node_ids:
            node_ids.append(item.node.id)
    if len(node_ids) < index:
        return "NOT_RUN"
    target = node_ids[index - 1]
    matched = [item for item in results if item.node.id == target and item.operation not in {RemoteOperation.REVISION, RemoteOperation.NETWORK}]
    if not matched:
        return "NOT_RUN"
    latest = matched[-1]
    return "PASS" if latest.ok else latest.status.value


def _remote_health(results: tuple[RemoteResult, ...]) -> dict[str, str]:
    checks: dict[str, str] = {}
    for item in results:
        if item.operation != RemoteOperation.ROLE_HEALTH:
            continue
        for line in item.stdout.splitlines():
            parts = line.strip().split()
            if len(parts) == 2 and parts[1] in {"PASS", "FAIL"}:
                checks[parts[0]] = parts[1]
    return checks


def _network_rule_pass(results: tuple[RemoteResult, ...], rule_id: str) -> bool:
    for item in results:
        if item.operation != RemoteOperation.NETWORK or not item.ok:
            continue
        for line in item.stdout.splitlines():
            if rule_id in line and "PASS" in line:
                return True
    return False


def build_readiness(environment: EnvironmentConfig, results: tuple[RemoteResult, ...], network_ok: bool) -> tuple[dict[str, str], tuple[str, ...]]:
    central = inspect_environment(environment).checks
    remote = _remote_health(results)
    db = _node_status(results, "database")
    app = _node_status(results, "application")
    proxy1 = _node_status(results, "reverse_proxy", 1)
    proxy2 = _node_status(results, "reverse_proxy", 2)

    checks = {
        "postgresql": "PASS" if _network_rule_pass(results, "app-to-database-postgres") else "FAIL",
        "gateway": "PASS" if _network_rule_pass(results, "app-to-database-supabase") else "FAIL",
        "auth": remote.get("auth", "FAIL"),
        "rest": remote.get("rest", "FAIL"),
        "realtime": remote.get("realtime", "FAIL"),
        "storage": remote.get("storage", "FAIL"),
        "frontend": remote.get("frontend", "FAIL"),
        "edge_functions": remote.get("edge_functions", "FAIL"),
        "public_entrypoint": central.get("public_entrypoint", "WAITING_FOR_OPERATOR"),
        "public_auth": central.get("public_auth", "WAITING_FOR_OPERATOR"),
        "public_rest": central.get("public_rest", "WAITING_FOR_OPERATOR"),
        "public_realtime": central.get("public_realtime", "WAITING_FOR_OPERATOR"),
        "public_storage": central.get("public_storage", "WAITING_FOR_OPERATOR"),
        "public_edge": central.get("public_edge", "WAITING_FOR_OPERATOR"),
    }
    internal_keys = ("postgresql", "gateway", "auth", "rest", "realtime", "storage", "frontend", "edge_functions")
    public_keys = ("public_entrypoint", "public_auth", "public_rest", "public_realtime", "public_storage", "public_edge")
    ready = (
        all(value == "PASS" for value in (db, app, proxy1, proxy2))
        and all(checks[key] == "PASS" for key in internal_keys)
        and network_ok
        and all(checks[key] == "PASS" for key in public_keys)
    )
    lines = [
        "SPARK PRODUCTION READINESS", "",
        "Infrastructure",
        f"  Database            {db}",
        f"  Application         {app}",
        f"  Reverse Proxy #1    {proxy1}",
        f"  Reverse Proxy #2    {proxy2}", "",
        "Database Core",
        f"  PostgreSQL          {checks['postgresql']}",
        f"  Auth                {checks['auth']}",
        f"  REST                {checks['rest']}",
        f"  Realtime            {checks['realtime']}",
        f"  Storage             {checks['storage']}",
        f"  Gateway             {checks['gateway']}", "",
        "Application",
        f"  Frontend            {checks['frontend']}",
        f"  Edge Functions      {checks['edge_functions']}",
        "Network",
        f"  Proxy/App/DB Paths  {'PASS' if network_ok else 'FAIL'}", "",
        "Public",
        f"  HTTPS               {checks['public_entrypoint']}",
        f"  Auth Route          {checks['public_auth']}",
        f"  REST Route          {checks['public_rest']}",
        f"  Realtime Route      {checks['public_realtime']}",
        f"  Storage Route       {checks['public_storage']}",
        f"  Edge Functions      {checks['public_edge']}", "",
        f"RESULT                {'READY' if ready else 'NOT_READY'}",
    ]
    checks["result"] = "READY" if ready else "NOT_READY"
    return checks, tuple(lines)
