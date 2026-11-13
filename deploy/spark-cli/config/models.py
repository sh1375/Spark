from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class EndpointConfig:
    host: str
    port: int
    protocol: str = "tcp"


@dataclass(frozen=True)
class NodeConfig:
    role: str
    host: str
    vlan: int | None = None
    secondary_hosts: tuple[str, ...] = ()
    ssh_user: str | None = None


@dataclass(frozen=True)
class ExternalServiceConfig:
    name: str
    host: str
    port: int = 443
    protocol: str = "https"
    required: bool = True


@dataclass(frozen=True)
class JumpServerConfig:
    enabled: bool = False
    host: str | None = None
    ssh_user: str | None = None


@dataclass(frozen=True)
class NetworkRuleConfig:
    rule_id: str
    source: str
    destination: str
    protocol: str = "tcp"
    ports: tuple[int, ...] = ()


@dataclass(frozen=True)
class NetworkConfig:
    management_cidr: str | None = None
    rules: tuple[NetworkRuleConfig, ...] = ()


@dataclass(frozen=True)
class DockerRuntimeConfig:
    install_policy: str = "install-if-missing"
    replace_conflicting_packages: bool = False
    version_policy: str = "compatible-stable"
    version: str | None = None


@dataclass(frozen=True)
class RuntimeConfig:
    install_root: str = "/opt/spark"
    state_root: str = "/var/lib/spark-manager"
    docker: DockerRuntimeConfig = field(default_factory=DockerRuntimeConfig)


@dataclass(frozen=True)
class SupabaseCapabilitiesConfig:
    auth: bool = True
    rest: bool = True
    realtime: bool = True
    storage: bool = True
    gateway: bool = True
    studio: bool = True
    pooler: bool = True
    meta: bool = True
    imgproxy: bool = True


@dataclass(frozen=True)
class SupabasePackageConfig:
    release: str = "self-hosted/v0.8.1"
    source_url: str = "https://github.com/supabase/supabase.git"
    destination: str = "/opt/spark/database/supabase"
    capabilities: SupabaseCapabilitiesConfig = field(default_factory=SupabaseCapabilitiesConfig)


@dataclass(frozen=True)
class DatabaseComposeConfig:
    project_name: str = "spark-supabase"


@dataclass(frozen=True)
class DatabaseSchemaConfig:
    owned_schemas: tuple[str, ...] = ()
    shared_schemas: tuple[str, ...] = ()


@dataclass(frozen=True)
class PostgresStartupConfig:
    normal_timeout_seconds: int = 120
    initialization_timeout_seconds: int = 600


@dataclass(frozen=True)
class ServiceRetryConfig:
    attempts: int = 3
    delay_seconds: int = 10


@dataclass(frozen=True)
class DatabaseStartupConfig:
    postgres: PostgresStartupConfig = field(default_factory=PostgresStartupConfig)
    service_retry: ServiceRetryConfig = field(default_factory=ServiceRetryConfig)
    supabase_timeout_seconds: int = 300
    image_pull_timeout_seconds: int = 900


@dataclass(frozen=True)
class DatabaseConfig:
    supabase: SupabasePackageConfig = field(default_factory=SupabasePackageConfig)
    secret_file: str = "/etc/spark-manager/secrets/database.env"
    compose: DatabaseComposeConfig = field(default_factory=DatabaseComposeConfig)
    schema: DatabaseSchemaConfig = field(default_factory=DatabaseSchemaConfig)
    startup: DatabaseStartupConfig = field(default_factory=DatabaseStartupConfig)


@dataclass(frozen=True)
class ApplicationSourceConfig:
    repository: str = "https://github.com/sh1375/Spark.git"
    revision: str = "main"
    releases_root: str = "/opt/spark/application/releases"
    current_link: str = "/opt/spark/application/current"
    shared_root: str = "/opt/spark/application/shared"


@dataclass(frozen=True)
class ApplicationEdgeConfig:
    image: str = "supabase/edge-runtime:v1.76.2"
    root: str = "/opt/spark/application/edge"
    port: int = 9000
    project_name: str = "spark-edge"
    probe_function: str = "auth-health-check"
    verify_jwt: bool = False


@dataclass(frozen=True)
class ApplicationLiveKitConfig:
    root: str = "/opt/spark/application/livekit"
    source_dir: str = "deploy/spark-cli/livekit"
    image: str = "livekit/livekit-server:v1.13.5"
    redis_image: str = "redis:7.4.5-alpine"
    api_port: int = 7880
    rtc_tcp_port: int = 7881
    rtc_udp_start: int = 50000
    rtc_udp_end: int = 60000
    embedded_turn: bool = False


@dataclass(frozen=True)
class ApplicationCoturnConfig:
    enabled: bool = True
    listener_port: int = 3478
    tls_port: int = 5349
    relay_min_port: int = 49152
    relay_max_port: int = 65535
    realm: str = ""
    certificate_file: str = ""
    key_file: str = ""
    service_name: str = "coturn"


@dataclass(frozen=True)
class ApplicationConfig:
    source: ApplicationSourceConfig = field(default_factory=ApplicationSourceConfig)
    secret_file: str = "/etc/spark-manager/secrets/application.env"
    runtime_env_file: str = "/opt/spark/application/shared/runtime.env"
    node_command: str = "node"
    npm_command: str = "npm"
    required_secret_keys: tuple[str, ...] = ()
    edge: ApplicationEdgeConfig = field(default_factory=ApplicationEdgeConfig)
    livekit: ApplicationLiveKitConfig = field(default_factory=ApplicationLiveKitConfig)
    coturn: ApplicationCoturnConfig = field(default_factory=ApplicationCoturnConfig)


@dataclass(frozen=True)
class ReverseProxyTLSConfig:
    mode: str = "provided"
    certificate_file: str = ""
    key_file: str = ""


@dataclass(frozen=True)
class ReverseProxyConfig:
    public_host: str = ""
    config_path: str = "/etc/nginx/conf.d/spark.conf"
    tls: ReverseProxyTLSConfig = field(default_factory=ReverseProxyTLSConfig)
    install_nginx_if_missing: bool = True


@dataclass(frozen=True)
class FullNetworkRuleConfig:
    rule_id: str
    source: str
    destination: str
    protocol: str = "tcp"
    ports: tuple[int, ...] = ()
    port_ranges: tuple[str, ...] = ()
    verification: str = "AUTO_VERIFY"


@dataclass(frozen=True)
class FullEnvironmentConfig:
    mode: str = "GUIDED"
    network_rules: tuple[FullNetworkRuleConfig, ...] = ()


@dataclass(frozen=True)
class EnvironmentConfig:
    name: str
    mode: str = "online"
    schema_version: int = 1
    nodes: dict[str, NodeConfig] = field(default_factory=dict)
    jump_server: JumpServerConfig = field(default_factory=JumpServerConfig)
    external_services: dict[str, ExternalServiceConfig] = field(default_factory=dict)
    network: NetworkConfig = field(default_factory=NetworkConfig)
    runtime: RuntimeConfig = field(default_factory=RuntimeConfig)
    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    application: ApplicationConfig = field(default_factory=ApplicationConfig)
    reverse_proxy: ReverseProxyConfig = field(default_factory=ReverseProxyConfig)
    full_environment: FullEnvironmentConfig = field(default_factory=FullEnvironmentConfig)
