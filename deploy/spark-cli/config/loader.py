from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import (
    ApplicationConfig,
    ApplicationEdgeConfig,
    ApplicationSourceConfig,
    DatabaseComposeConfig,
    DatabaseConfig,
    DatabaseSchemaConfig,
    DatabaseStartupConfig,
    DockerRuntimeConfig,
    EnvironmentConfig,
    ExternalServiceConfig,
    FullEnvironmentConfig,
    FullNetworkRuleConfig,
    JumpServerConfig,
    NetworkConfig,
    NetworkRuleConfig,
    NodeConfig,
    PostgresStartupConfig,
    ReverseProxyConfig,
    ReverseProxyTLSConfig,
    RuntimeConfig,
    ServiceRetryConfig,
    SupabaseCapabilitiesConfig,
    SupabasePackageConfig,
)
from .schema import validate_environment
from .yaml_loader import safe_load_profile

FORBIDDEN_SECRET_KEYS = {
    "db_password", "jwt_secret", "service_role_key", "smtp_password", "ssh_private_key",
    "anon_key", "supabase_secret_key", "jwt_private_key", "jwt_public_jwks",
}


def _assert_no_secrets(value: Any, path: str = "profile") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).strip().lower()
            if normalized in FORBIDDEN_SECRET_KEYS or normalized.endswith("_password") or normalized.endswith("_secret") or normalized.endswith("_private_key"):
                raise ValueError(f"secrets are not allowed in architecture profiles: {path}.{key}")
            _assert_no_secrets(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _assert_no_secrets(child, f"{path}[{index}]")


def _ports(value: dict[str, Any]) -> tuple[int, ...]:
    raw = value.get("ports") or ([value["port"]] if value.get("port") is not None else [])
    return tuple(int(port) for port in raw)


def environment_from_mapping(data: dict[str, Any]) -> EnvironmentConfig:
    _assert_no_secrets(data)
    env = data.get("environment", {}) or {}
    name = env.get("name", data.get("name", ""))
    mode = env.get("mode", data.get("mode", "online"))
    schema_version = int(data.get("schema_version", 1))

    nodes = {
        key: NodeConfig(
            role=str(value.get("role", key)), host=str(value["host"]), vlan=value.get("vlan"),
            secondary_hosts=tuple(str(x) for x in value.get("secondary_hosts", ()) or ()),
            ssh_user=(str(value["ssh_user"]) if value.get("ssh_user") is not None else None),
        ) for key, value in data.get("nodes", {}).items()
    }
    jump_data = data.get("jump_server", {}) or {}
    jump_server = JumpServerConfig(
        enabled=bool(jump_data.get("enabled", False)),
        host=(str(jump_data["host"]) if jump_data.get("host") is not None else None),
        ssh_user=(str(jump_data["ssh_user"]) if jump_data.get("ssh_user") is not None else None),
    )
    external_services = {
        key: ExternalServiceConfig(
            name=str(value.get("name", key)), host=str(value["host"]), port=int(value.get("port", 443)),
            protocol=str(value.get("protocol", "https")), required=bool(value.get("required", True)),
        ) for key, value in data.get("external_services", {}).items()
    }

    network_data = data.get("network", {}) or {}
    raw_rules = network_data.get("rules", network_data.get("connectivity", ())) or ()
    network = NetworkConfig(
        management_cidr=network_data.get("management_cidr"),
        rules=tuple(NetworkRuleConfig(
            rule_id=str(value.get("id", f"rule-{index + 1}")), source=str(value.get("source", "")),
            destination=str(value.get("destination", value.get("target", ""))), protocol=str(value.get("protocol", "tcp")),
            ports=_ports(value),
        ) for index, value in enumerate(raw_rules)),
    )

    runtime_data = data.get("runtime", {}) or {}
    docker_data = runtime_data.get("docker", {}) or {}
    runtime = RuntimeConfig(
        install_root=str(runtime_data.get("install_root", "/opt/spark")),
        state_root=str(runtime_data.get("state_root", "/var/lib/spark-manager")),
        docker=DockerRuntimeConfig(
            install_policy=str(docker_data.get("install_policy", "install-if-missing")),
            replace_conflicting_packages=bool(docker_data.get("replace_conflicting_packages", False)),
            version_policy=str(docker_data.get("version_policy", "compatible-stable")),
            version=(str(docker_data["version"]) if docker_data.get("version") is not None else None),
        ),
    )

    database_data = data.get("database", {}) or {}
    supabase_data = database_data.get("supabase", {}) or {}
    capabilities_data = supabase_data.get("capabilities", {}) or {}
    compose_data = database_data.get("compose", {}) or {}
    schema_data = database_data.get("schema", {}) or {}
    startup_data = database_data.get("startup", {}) or {}
    postgres_startup = startup_data.get("postgres", {}) or {}
    retry_data = startup_data.get("service_retry", {}) or {}
    database = DatabaseConfig(
        supabase=SupabasePackageConfig(
            release=str(supabase_data.get("release", "self-hosted/v0.8.1")),
            source_url=str(supabase_data.get("source_url", "https://github.com/supabase/supabase.git")),
            destination=str(supabase_data.get("destination", "/opt/spark/database/supabase")),
            capabilities=SupabaseCapabilitiesConfig(**{key: bool(capabilities_data.get(key, True)) for key in (
                "auth", "rest", "realtime", "storage", "gateway", "studio", "pooler", "meta", "imgproxy"
            )}),
        ),
        secret_file=str(database_data.get("secret_file", "/etc/spark-manager/secrets/database.env")),
        compose=DatabaseComposeConfig(project_name=str(compose_data.get("project_name", "spark-supabase"))),
        schema=DatabaseSchemaConfig(
            owned_schemas=tuple(str(v).strip().lower() for v in (schema_data.get("owned_schemas", ()) or ()) if str(v).strip()),
            shared_schemas=tuple(str(v).strip().lower() for v in (schema_data.get("shared_schemas", ()) or ()) if str(v).strip()),
        ),
        startup=DatabaseStartupConfig(
            postgres=PostgresStartupConfig(
                normal_timeout_seconds=int(postgres_startup.get("normal_timeout_seconds", 120)),
                initialization_timeout_seconds=int(postgres_startup.get("initialization_timeout_seconds", 600)),
            ),
            service_retry=ServiceRetryConfig(attempts=int(retry_data.get("attempts", 3)), delay_seconds=int(retry_data.get("delay_seconds", 10))),
            supabase_timeout_seconds=int(startup_data.get("supabase_timeout_seconds", 300)),
            image_pull_timeout_seconds=int(startup_data.get("image_pull_timeout_seconds", 900)),
        ),
    )

    app_data = data.get("application", {}) or {}
    source_data = app_data.get("source", {}) or {}
    edge_data = app_data.get("edge", {}) or {}
    application = ApplicationConfig(
        source=ApplicationSourceConfig(
            repository=str(source_data.get("repository", "https://github.com/sh1375/Spark.git")), revision=str(source_data.get("revision", "main")),
            releases_root=str(source_data.get("releases_root", "/opt/spark/application/releases")),
            current_link=str(source_data.get("current_link", "/opt/spark/application/current")),
            shared_root=str(source_data.get("shared_root", "/opt/spark/application/shared")),
        ),
        secret_file=str(app_data.get("secret_file", "/etc/spark-manager/secrets/application.env")),
        runtime_env_file=str(app_data.get("runtime_env_file", "/opt/spark/application/shared/runtime.env")),
        node_command=str(app_data.get("node_command", "node")), npm_command=str(app_data.get("npm_command", "npm")),
        required_secret_keys=tuple(str(v) for v in (app_data.get("required_secret_keys", ()) or ())),
        edge=ApplicationEdgeConfig(
            image=str(edge_data.get("image", "supabase/edge-runtime:v1.76.2")), root=str(edge_data.get("root", "/opt/spark/application/edge")),
            port=int(edge_data.get("port", 9000)), project_name=str(edge_data.get("project_name", "spark-edge")),
            probe_function=str(edge_data.get("probe_function", "auth-health-check")), verify_jwt=bool(edge_data.get("verify_jwt", False)),
        ),
    )

    rp_data = data.get("reverse_proxy", {}) or {}
    tls_data = rp_data.get("tls", {}) or {}
    reverse_proxy = ReverseProxyConfig(
        public_host=str(rp_data.get("public_host", "")), config_path=str(rp_data.get("config_path", "/etc/nginx/conf.d/spark.conf")),
        tls=ReverseProxyTLSConfig(mode=str(tls_data.get("mode", "provided")), certificate_file=str(tls_data.get("certificate_file", "")), key_file=str(tls_data.get("key_file", ""))),
        install_nginx_if_missing=bool(rp_data.get("install_nginx_if_missing", True)),
    )

    full_data = data.get("full_environment", {}) or {}
    full_rules = full_data.get("network_rules", ()) or ()
    full_environment = FullEnvironmentConfig(
        mode=str(full_data.get("mode", "GUIDED")).upper(),
        network_rules=tuple(FullNetworkRuleConfig(
            rule_id=str(value.get("id", f"full-rule-{index + 1}")), source=str(value.get("source", "")), destination=str(value.get("destination", "")),
            protocol=str(value.get("protocol", "tcp")).lower(), ports=_ports(value),
            port_ranges=tuple(str(v) for v in (value.get("port_ranges", ()) or ())), verification=str(value.get("verification", "AUTO_VERIFY")).upper(),
        ) for index, value in enumerate(full_rules)),
    )

    return validate_environment(EnvironmentConfig(
        name=str(name), mode=str(mode), schema_version=schema_version, nodes=nodes, jump_server=jump_server,
        external_services=external_services, network=network, runtime=runtime, database=database, application=application,
        reverse_proxy=reverse_proxy, full_environment=full_environment,
    ))


def load_environment(path: str | Path) -> EnvironmentConfig:
    path = Path(path)
    text = path.read_text()
    if path.suffix.lower() == ".json":
        data = json.loads(text)
    elif path.suffix.lower() in {".yaml", ".yml"}:
        data = safe_load_profile(text)
    else:
        raise ValueError(f"unsupported environment profile format: {path.suffix or '<none>'}")
    if not isinstance(data, dict):
        raise ValueError("environment profile root must be an object/mapping")
    return environment_from_mapping(data)
