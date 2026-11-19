from __future__ import annotations

import ipaddress
import re
from pathlib import Path

from .models import EnvironmentConfig

HOST_RE = re.compile(r"^(?=.{1,253}$)(?!-)[A-Za-z0-9.-]+(?<!-)$")
PROJECT_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$")
SCHEMA_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")
REQUIRED_ROLES = {"reverse_proxy", "application", "database"}
VALID_PROTOCOLS = {"tcp", "udp", "https", "http"}
PINNED_RELEASE_RE = re.compile(r"^self-hosted/v\d+\.\d+\.\d+$")
VALID_DOCKER_INSTALL_POLICIES = {"install-if-missing", "manual"}
VALID_DOCKER_VERSION_POLICIES = {"compatible-stable", "exact"}
VALID_FULL_MODES = {"AUTO", "GUIDED"}
VALID_VERIFICATION = {"AUTO_VERIFY", "GUIDED", "MANUAL"}


def _valid_host(value: str) -> bool:
    value = value.strip()
    if not value:
        return False
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return bool(HOST_RE.fullmatch(value)) and ".." not in value


def _port(value: int, label: str) -> None:
    if not (1 <= int(value) <= 65535):
        raise ValueError(f"invalid port for {label}: {value}")


def validate_environment(config: EnvironmentConfig) -> EnvironmentConfig:
    if config.schema_version != 1:
        raise ValueError(f"unsupported architecture schema_version: {config.schema_version}")
    if not config.name.strip():
        raise ValueError("environment name is required")
    if config.mode not in {"online", "airgap"}:
        raise ValueError(f"unsupported environment mode: {config.mode}")

    roles: set[str] = set()
    seen_hosts: dict[str, str] = {}
    for key, node in config.nodes.items():
        if not key.strip() or not node.role.strip() or not _valid_host(node.host):
            raise ValueError(f"invalid node definition: {key!r}")
        if node.vlan is not None and not (1 <= int(node.vlan) <= 4094):
            raise ValueError(f"invalid VLAN for {key}: {node.vlan}")
        if node.role in roles:
            raise ValueError(f"duplicate node role: {node.role}")
        roles.add(node.role)
        for host in (node.host, *node.secondary_hosts):
            if not _valid_host(host):
                raise ValueError(f"invalid host for {key}: {host}")
            if host in seen_hosts:
                raise ValueError(f"duplicate host {host} used by {seen_hosts[host]} and {key}")
            seen_hosts[host] = key

    missing = REQUIRED_ROLES - roles
    if missing:
        raise ValueError(f"missing required architecture roles: {', '.join(sorted(missing))}")

    if config.jump_server.enabled and config.jump_server.host is not None and not _valid_host(config.jump_server.host):
        raise ValueError(f"invalid jump server host: {config.jump_server.host}")

    for key, service in config.external_services.items():
        if not key.strip() or not _valid_host(service.host):
            raise ValueError(f"invalid external service: {key!r}")
        _port(service.port, f"external service {key}")
        if service.protocol not in VALID_PROTOCOLS:
            raise ValueError(f"unsupported external service protocol for {key}: {service.protocol}")

    known_refs = set(config.nodes) | roles | set(config.external_services) | {"internet", "clients"}
    seen_rule_ids: set[str] = set()
    seen_signatures: set[tuple[str, str, str, tuple[int, ...]]] = set()
    for rule in config.network.rules:
        if not rule.rule_id.strip() or rule.rule_id in seen_rule_ids:
            raise ValueError(f"duplicate or empty network rule id: {rule.rule_id!r}")
        seen_rule_ids.add(rule.rule_id)
        if rule.source not in known_refs or rule.destination not in known_refs:
            raise ValueError(f"network rule {rule.rule_id} references an unknown source/destination")
        if rule.protocol not in VALID_PROTOCOLS:
            raise ValueError(f"unsupported protocol in network rule {rule.rule_id}: {rule.protocol}")
        if not rule.ports or any(port < 1 or port > 65535 for port in rule.ports):
            raise ValueError(f"invalid ports in network rule {rule.rule_id}")
        signature = (rule.source, rule.destination, rule.protocol, tuple(sorted(rule.ports)))
        if signature in seen_signatures:
            raise ValueError(f"duplicate network rule definition: {rule.rule_id}")
        seen_signatures.add(signature)

    docker = config.runtime.docker
    if docker.install_policy not in VALID_DOCKER_INSTALL_POLICIES:
        raise ValueError(f"unsupported runtime.docker.install_policy: {docker.install_policy}")
    if docker.version_policy not in VALID_DOCKER_VERSION_POLICIES:
        raise ValueError(f"unsupported runtime.docker.version_policy: {docker.version_policy}")
    if docker.version_policy == "exact" and not docker.version:
        raise ValueError("runtime.docker.version is required when version_policy=exact")

    package = config.database.supabase
    if not PINNED_RELEASE_RE.fullmatch(package.release):
        raise ValueError("database.supabase.release must be an explicit self-hosted/vX.Y.Z release")
    if not package.source_url.startswith("https://"):
        raise ValueError("database.supabase.source_url must use https")
    if not Path(package.destination).is_absolute():
        raise ValueError("database.supabase.destination must be an absolute path")
    if not Path(config.database.secret_file).is_absolute():
        raise ValueError("database.secret_file must be an absolute path")
    if not PROJECT_RE.fullmatch(config.database.compose.project_name):
        raise ValueError("database.compose.project_name contains invalid characters")

    owned = config.database.schema.owned_schemas
    if len(set(owned)) != len(owned):
        raise ValueError("database.schema.owned_schemas contains duplicates")
    if any(not SCHEMA_NAME_RE.fullmatch(value) for value in owned):
        raise ValueError("database.schema.owned_schemas contains an invalid schema name")

    startup = config.database.startup
    if startup.postgres.normal_timeout_seconds < 1 or startup.postgres.initialization_timeout_seconds < 1:
        raise ValueError("database.startup.postgres timeouts must be positive")
    if startup.postgres.initialization_timeout_seconds < startup.postgres.normal_timeout_seconds:
        raise ValueError("database.startup.postgres initialization timeout must be >= normal timeout")
    if startup.service_retry.attempts < 1 or startup.service_retry.delay_seconds < 0:
        raise ValueError("database.startup.service_retry values are invalid")
    if startup.supabase_timeout_seconds < 1 or startup.image_pull_timeout_seconds < 1:
        raise ValueError("database startup timeouts must be positive")

    app = config.application
    if not Path(app.secret_file).is_absolute() or not Path(app.runtime_env_file).is_absolute():
        raise ValueError("application secret/runtime env paths must be absolute")
    if app.edge.image != "supabase/edge-runtime:v1.76.2":
        raise ValueError("application.edge.image must remain pinned to supabase/edge-runtime:v1.76.2 for self-hosted/v0.8.1")
    _port(app.edge.port, "application edge")

    rp = config.reverse_proxy
    if not Path(rp.config_path).is_absolute():
        raise ValueError("reverse_proxy.config_path must be absolute")
    if rp.tls.mode not in {"provided", "acme"}:
        raise ValueError("reverse_proxy.tls.mode must be provided or acme")

    full = config.full_environment
    if full.mode not in VALID_FULL_MODES:
        raise ValueError("full_environment.mode must be AUTO or GUIDED")
    seen_full: set[str] = set()
    for rule in full.network_rules:
        if not rule.rule_id or rule.rule_id in seen_full:
            raise ValueError(f"duplicate or empty full_environment network rule: {rule.rule_id!r}")
        seen_full.add(rule.rule_id)
        if rule.protocol not in {"tcp", "udp"}:
            raise ValueError(f"unsupported full_environment protocol: {rule.protocol}")
        if rule.verification not in VALID_VERIFICATION:
            raise ValueError(f"unsupported verification mode: {rule.verification}")
        if rule.verification == "AUTO_VERIFY" and rule.protocol != "tcp":
            raise ValueError(f"UDP rule {rule.rule_id} cannot use AUTO_VERIFY")
        if not rule.ports and not rule.port_ranges:
            raise ValueError(f"full_environment rule {rule.rule_id} has no ports")
        for port in rule.ports:
            _port(port, rule.rule_id)

    return config
