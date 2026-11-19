from __future__ import annotations

from config.loader import load_environment
from core.context import ExecutionContext
from core.operation import OperationTask
from core.result import TaskResult
from secrets.file_provider import FileSecretProvider

from ..configuration import ApplicationConfigurationManager
from ..preflight import run_application_preflight
from ..source import ApplicationSourceManager


def _profile(ctx: ExecutionContext):
    path = ctx.variables.get("environment_profile")
    if not path:
        raise ValueError("environment_profile is required")
    return load_environment(path)


class ApplicationPreflightTask(OperationTask):
    id = "application.preflight"
    description = "Validate application-node readiness without changing the system."

    def detect(self, ctx: ExecutionContext) -> TaskResult:
        report = run_application_preflight(_profile(ctx), host=ctx.variables.get("host_context"), runner=ctx.variables.get("command_runner"))
        ctx.variables["application_preflight_report"] = report
        if not report.ready:
            return TaskResult.failed("application preflight failed", checks=[c.name for c in report.checks if c.status.value == "FAIL"], result=report.result)
        return TaskResult.success("application preflight detected", result=report.result)

    def plan(self, ctx: ExecutionContext) -> TaskResult:
        report = ctx.variables.get("application_preflight_report") or run_application_preflight(_profile(ctx), host=ctx.variables.get("host_context"))
        return TaskResult.success("application preflight plan", actions=[c.name for c in report.checks if c.status.value in {"WARN", "MISSING"}], result=report.result)

    def apply(self, ctx: ExecutionContext) -> TaskResult:
        return TaskResult.success("preflight is read-only; no changes applied", changed=False)

    def verify(self, ctx: ExecutionContext) -> TaskResult:
        report = ctx.variables.get("application_preflight_report")
        return TaskResult.success("application preflight verified", result=report.result) if report and report.ready else TaskResult.failed("application preflight verification failed")


class ApplicationSourceTask(OperationTask):
    id = "application.source"
    description = "Resolve and materialize an immutable pinned application release."
    dependencies = ("application.preflight",)

    def _manager(self, ctx): return ctx.variables.get("application_source_manager") or ApplicationSourceManager(ctx.variables.get("command_runner"))
    def detect(self, ctx):
        plan = self._manager(ctx).resolve(_profile(ctx).application.source); ctx.variables["application_source_plan"] = plan
        return TaskResult.success("application source inspected", present=self._manager(ctx).detect(plan), commit=plan.resolved_commit)
    def plan(self, ctx):
        plan = ctx.variables.get("application_source_plan") or self._manager(ctx).resolve(_profile(ctx).application.source)
        return TaskResult.success("application source plan", repository=plan.repository, revision=plan.requested_revision, commit=plan.resolved_commit, release_path=plan.release_path)
    def apply(self, ctx):
        plan = ctx.variables.get("application_source_plan") or self._manager(ctx).resolve(_profile(ctx).application.source)
        changed = self._manager(ctx).materialize(plan)
        return TaskResult.success("application source materialized", changed=changed, commit=plan.resolved_commit)
    def verify(self, ctx):
        plan = ctx.variables.get("application_source_plan") or self._manager(ctx).resolve(_profile(ctx).application.source)
        return TaskResult.success("application source verified", commit=plan.resolved_commit) if self._manager(ctx).detect(plan) else TaskResult.failed("application source verification failed")


class ApplicationConfigTask(OperationTask):
    id = "application.config"
    description = "Materialize topology plus secrets into a protected runtime environment file."
    dependencies = ("application.source",)

    def _manager(self, ctx):
        env = _profile(ctx)
        provider = ctx.variables.get("application_secret_provider") or FileSecretProvider(env.application.secret_file)
        return ApplicationConfigurationManager(provider)
    def detect(self, ctx):
        env = _profile(ctx); ok = self._manager(ctx).verify(env)
        return TaskResult.success("application configuration inspected", configured=ok)
    def plan(self, ctx):
        env = _profile(ctx)
        missing = [k for k in env.application.required_secret_keys if not (ctx.variables.get("application_secret_provider") or FileSecretProvider(env.application.secret_file)).exists(k)]
        if missing: return TaskResult.failed("required application secrets are missing", missing_keys=missing)
        return TaskResult.success("application configuration plan", runtime_env_file=env.application.runtime_env_file, secret_keys=list(env.application.required_secret_keys))
    def apply(self, ctx):
        env = _profile(ctx); changed = self._manager(ctx).materialize(env)
        return TaskResult.success("application configuration materialized", changed=changed, runtime_env_file=env.application.runtime_env_file)
    def verify(self, ctx):
        env = _profile(ctx)
        return TaskResult.success("application configuration verified") if self._manager(ctx).verify(env) else TaskResult.failed("application configuration verification failed")


from .build import ApplicationBuildTask
from .deploy import ApplicationDeployTask
from .edge import ApplicationEdgeFunctionsTask, ApplicationEdgeRuntimeTask
from .health import ApplicationHealthGateTask

__all__ = [
    "ApplicationPreflightTask",
    "ApplicationSourceTask",
    "ApplicationConfigTask",
    "ApplicationBuildTask",
    "ApplicationDeployTask",
    "ApplicationEdgeRuntimeTask",
    "ApplicationEdgeFunctionsTask",
    "ApplicationHealthGateTask",
]
