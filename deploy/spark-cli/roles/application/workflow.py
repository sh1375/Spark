from __future__ import annotations

from core.registry import OperationRegistry
from core.workflow import Workflow
from .tasks import (
    ApplicationBuildTask,
    ApplicationConfigTask,
    ApplicationDeployTask,
    ApplicationEdgeFunctionsTask,
    ApplicationEdgeRuntimeTask,
    ApplicationHealthGateTask,
    ApplicationPreflightTask,
    ApplicationSourceTask,
)


def _registry() -> OperationRegistry:
    registry = OperationRegistry()
    registry.extend((
        ApplicationPreflightTask(),
        ApplicationSourceTask(),
        ApplicationConfigTask(),
        ApplicationBuildTask(),
        ApplicationDeployTask(),
        ApplicationEdgeRuntimeTask(),
        ApplicationEdgeFunctionsTask(),
        ApplicationHealthGateTask(),
    ))
    return registry


def build_application_preflight_workflow() -> Workflow:
    return Workflow("application.preflight", _registry(), targets=["application.preflight"])


def build_application_source_workflow() -> Workflow:
    return Workflow("application.source", _registry(), targets=["application.source"])


def build_application_foundation_workflow() -> Workflow:
    return Workflow("application.foundation", _registry(), targets=["application.config"])


def build_application_build_workflow() -> Workflow:
    return Workflow("application.build", _registry(), targets=["application.build"])


def build_application_deploy_workflow() -> Workflow:
    return Workflow("application.deploy", _registry(), targets=["application.deploy"])


def build_application_full_workflow() -> Workflow:
    return Workflow("application.provision", _registry(), targets=["application.health-gate"])
