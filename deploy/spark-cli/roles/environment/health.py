from __future__ import annotations

import socket
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass

from config.models import EnvironmentConfig


def _host(environment: EnvironmentConfig, role: str) -> str:
    for node in environment.nodes.values():
        if node.role == role:
            return node.host
    raise ValueError(f"{role} node missing")


def _tcp(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _http_status(url: str, *, allow_insecure_tls: bool = False) -> int | None:
    context = ssl._create_unverified_context() if allow_insecure_tls else None
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "spark-production-readiness"})
        with urllib.request.urlopen(request, timeout=4, context=context) as response:
            return int(response.status)
    except urllib.error.HTTPError as exc:
        return int(exc.code)
    except (urllib.error.URLError, TimeoutError, OSError):
        return None


def _http_ok(url: str, accepted: set[int]) -> bool:
    status = _http_status(url, allow_insecure_tls=False)
    return status in accepted


@dataclass(frozen=True)
class EnvironmentHealth:
    checks: dict[str, str]

    @property
    def waiting(self) -> bool:
        return any(value.startswith("WAITING") for value in self.checks.values())

    @property
    def healthy(self) -> bool:
        return bool(self.checks) and all(value == "PASS" for value in self.checks.values())


def inspect_environment(environment: EnvironmentConfig) -> EnvironmentHealth:
    app = _host(environment, "application")
    db = _host(environment, "database")
    rp_node = next(node for node in environment.nodes.values() if node.role == "reverse_proxy")
    checks: dict[str, str] = {}

    postgresql_ok = _tcp(db, 5432)
    gateway_ok = _tcp(db, 8000)
    checks["postgresql"] = "PASS" if postgresql_ok else "FAIL"
    checks["gateway"] = "PASS" if gateway_ok else "FAIL"
    checks["frontend"] = "PASS" if _http_status(f"http://{app}/") == 200 else "FAIL"
    checks["auth"] = "PASS" if postgresql_ok and gateway_ok and _http_status(f"http://{db}:8000/auth/v1/health") in {200, 204} else "FAIL"
    checks["rest"] = "PASS" if postgresql_ok and gateway_ok and _http_status(f"http://{db}:8000/rest/v1/") in {200, 401, 403, 404} else "FAIL"
    checks["storage"] = "PASS" if postgresql_ok and gateway_ok and _http_status(f"http://{db}:8000/storage/v1/status") in {200, 401, 403} else "FAIL"
    checks["realtime"] = "PASS" if postgresql_ok and gateway_ok else "FAIL"
    edge_status = _http_status(f"http://{app}:{environment.application.edge.port}/{environment.application.edge.probe_function}")
    checks["edge_functions"] = "PASS" if edge_status in {200, 401, 403, 404} else "FAIL"

    for index, host in enumerate((rp_node.host, *rp_node.secondary_hosts), start=1):
        checks[f"reverse_proxy_{index}"] = "PASS" if _tcp(host, 443) else "FAIL"

    for key, service in sorted(environment.external_services.items()):
        checks[f"external_{key}"] = "PASS" if _tcp(service.host, service.port) else ("FAIL" if service.required else "WAITING_OPTIONAL")

    public_host = environment.reverse_proxy.public_host.strip()
    if public_host:
        base = f"https://{public_host}"
        checks["public_entrypoint"] = "PASS" if _http_ok(f"{base}/", {200}) else "FAIL"
        checks["public_auth"] = "PASS" if _http_ok(f"{base}/auth/v1/health", {200, 204}) else "FAIL"
        checks["public_rest"] = "PASS" if _http_ok(f"{base}/rest/v1/", {200, 401, 403, 404}) else "FAIL"
        checks["public_realtime"] = "PASS" if _http_ok(f"{base}/realtime/v1/", {200, 400, 401, 403, 404, 426}) else "FAIL"
        checks["public_storage"] = "PASS" if _http_ok(f"{base}/storage/v1/status", {200, 401, 403}) else "FAIL"
        checks["public_edge"] = "PASS" if _http_ok(f"{base}/functions/v1/{environment.application.edge.probe_function}", {200, 401, 403, 404}) else "FAIL"
    else:
        for key in ("public_entrypoint", "public_auth", "public_rest", "public_realtime", "public_storage", "public_edge"):
            checks[key] = "WAITING_FOR_OPERATOR"

    return EnvironmentHealth(checks)
