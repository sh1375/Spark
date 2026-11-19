from __future__ import annotations

from config.loader import load_environment
from core.context import ExecutionContext
from core.operation import OperationTask
from core.result import TaskResult

from .config import ReverseProxyConfigManager
from .health import inspect_reverse_proxy
from .preflight import run_reverse_proxy_preflight


def _profile(ctx: ExecutionContext):
    path = ctx.variables.get("environment_profile")
    if not path:
        raise ValueError("environment_profile is required")
    return load_environment(path)


class ReverseProxyPreflightTask(OperationTask):
    id = "reverse-proxy.preflight"
    description = "Validate the local reverse proxy node and operator-owned TLS inputs."

    def detect(self, ctx):
        report = run_reverse_proxy_preflight(_profile(ctx), host=ctx.variables.get("host_context"), runner=ctx.variables.get("command_runner"))
        ctx.variables["reverse_proxy_preflight"] = report
        return TaskResult.success("reverse proxy preflight inspected", ready=report.ready, waiting_for_operator=report.waiting_for_operator, missing=list(report.missing))

    def plan(self, ctx):
        report = ctx.variables.get("reverse_proxy_preflight") or run_reverse_proxy_preflight(_profile(ctx), host=ctx.variables.get("host_context"), runner=ctx.variables.get("command_runner"))
        if report.waiting_for_operator:
            return TaskResult.failed("WAITING_FOR_OPERATOR: reverse proxy public host/TLS inputs are incomplete", waiting_for_operator=True, missing=list(report.missing))
        if not report.ready:
            return TaskResult.failed("reverse proxy preflight failed")
        return TaskResult.success("reverse proxy preflight plan", nginx_installed=report.nginx_installed)

    def apply(self, ctx):
        return TaskResult.success("reverse proxy preflight is read-only", changed=False)

    def verify(self, ctx):
        report = run_reverse_proxy_preflight(_profile(ctx), host=ctx.variables.get("host_context"), runner=ctx.variables.get("command_runner"))
        return TaskResult.success("reverse proxy preflight verified") if report.ready else TaskResult.failed("reverse proxy preflight verification failed", waiting_for_operator=report.waiting_for_operator, missing=list(report.missing))


class ReverseProxyProvisionTask(OperationTask):
    id = "reverse-proxy.provision"
    description = "Install/configure local Nginx and route Spark traffic to application/database owners."
    dependencies = ("reverse-proxy.preflight",)
    reverify_on_resume = True

    def _manager(self, ctx):
        return ctx.variables.get("reverse_proxy_manager") or ReverseProxyConfigManager(ctx.variables.get("command_runner"))

    def detect(self, ctx):
        env = _profile(ctx); manager = self._manager(ctx)
        return TaskResult.success("reverse proxy inspected", nginx_installed=manager.nginx_installed(), config_matches=(manager.config_matches(env) if not manager.missing_operator_inputs(env) else False))

    def plan(self, ctx):
        env = _profile(ctx); manager = self._manager(ctx)
        missing = manager.missing_operator_inputs(env)
        if missing:
            return TaskResult.failed("WAITING_FOR_OPERATOR: reverse proxy inputs incomplete", waiting_for_operator=True, missing=list(missing))
        return TaskResult.success("reverse proxy provision plan", config_path=env.reverse_proxy.config_path, public_host=env.reverse_proxy.public_host)

    def apply(self, ctx):
        env = _profile(ctx); manager = self._manager(ctx)
        installed = manager.install_nginx()
        changed = manager.apply(env)
        return TaskResult.success("reverse proxy provisioned", changed=installed or changed)

    def verify(self, ctx):
        health = inspect_reverse_proxy(_profile(ctx), ctx.variables.get("command_runner"))
        if not health.healthy:
            return TaskResult.failed("reverse proxy health gate failed", nginx=health.nginx_active, tls=health.tls_listener, frontend=health.frontend_upstream, edge=health.edge_upstream, supabase=health.supabase_upstream)
        return TaskResult.success("reverse proxy HEALTHY")
