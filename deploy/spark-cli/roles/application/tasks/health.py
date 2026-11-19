from __future__ import annotations

from pathlib import Path

from config.loader import load_environment
from core.context import ExecutionContext
from core.operation import OperationTask
from core.result import TaskResult
from roles.application.build.manifest import load_build_manifest
from roles.application.deployment.health import StaticHealthGate
from roles.application.edge import EdgeRuntimeManager, EdgeVerifier
from roles.application.source import ApplicationSourceManager


def _profile(ctx: ExecutionContext):
    path = ctx.variables.get("environment_profile")
    if not path:
        raise ValueError("environment_profile is required")
    return load_environment(path)


def _source_plan(ctx: ExecutionContext):
    plan = ctx.variables.get("application_source_plan")
    if plan is not None:
        return plan
    plan = ApplicationSourceManager(ctx.variables.get("command_runner")).resolve(_profile(ctx).application.source)
    ctx.variables["application_source_plan"] = plan
    return plan


class ApplicationHealthGateTask(OperationTask):
    id = "application.health-gate"
    description = "Verify frontend and Edge Runtime/Functions."
    dependencies = ("application.edge-functions",)
    reverify_on_resume = True

    def _inspect(self, ctx):
        env = _profile(ctx); plan = _source_plan(ctx)
        runner = ctx.variables.get("command_runner")
        manifest = load_build_manifest(Path(plan.release_path) / "deploy/spark-cli/spark-build.yaml")
        frontend = StaticHealthGate(runner).wait_healthy(manifest)
        edge_runtime = ctx.variables.get("application_edge_runtime") or EdgeRuntimeManager(runner)
        edge = EdgeVerifier(edge_runtime).inspect(env)
        return frontend, edge

    def detect(self, ctx):
        frontend, edge = self._inspect(ctx)
        return TaskResult.success(
            "Application health inspected", healthy=frontend and edge.healthy,
            frontend=frontend, edge=edge.healthy,
        )

    def plan(self, ctx):
        return TaskResult.success("Application health gate is read-only")

    def apply(self, ctx):
        return TaskResult.success("Application health gate performs no mutation", changed=False)

    def verify(self, ctx):
        frontend, edge = self._inspect(ctx)
        if not (frontend and edge.healthy):
            return TaskResult.failed(
                "Application composite health gate failed", frontend=frontend, edge=edge.healthy,
            )
        return TaskResult.success("Application is HEALTHY", frontend=True, edge=True)
