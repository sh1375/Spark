from __future__ import annotations

import socket
from dataclasses import dataclass

from adapters.command import CommandRunner
from config.models import EnvironmentConfig


def _host(environment: EnvironmentConfig, role: str) -> str:
    for node in environment.nodes.values():
        if node.role == role:
            return node.host
    raise ValueError(f"{role} node missing")


def _tcp(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except OSError:
        return False


@dataclass(frozen=True)
class ReverseProxyHealth:
    nginx_active: bool
    tls_listener: bool
    frontend_upstream: bool
    edge_upstream: bool
    supabase_upstream: bool

    @property
    def healthy(self) -> bool:
        return all((self.nginx_active, self.tls_listener, self.frontend_upstream, self.edge_upstream, self.supabase_upstream))


def inspect_reverse_proxy(environment: EnvironmentConfig, runner: CommandRunner | None = None) -> ReverseProxyHealth:
    runner = runner or CommandRunner()
    app = _host(environment, "application")
    db = _host(environment, "database")
    active = runner.run(("systemctl", "is-active", "nginx"), timeout=15)
    return ReverseProxyHealth(
        nginx_active=active.returncode == 0 and active.stdout.strip() == "active",
        tls_listener=_tcp("127.0.0.1", 443),
        frontend_upstream=_tcp(app, 80),
        edge_upstream=_tcp(app, environment.application.edge.port),
        supabase_upstream=_tcp(db, 8000),
    )
