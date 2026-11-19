from __future__ import annotations

import os
from pathlib import Path

from adapters.command import CommandRunner
from config.models import EnvironmentConfig


def _node_host(environment: EnvironmentConfig, role: str) -> str:
    for node in environment.nodes.values():
        if node.role == role:
            return node.host
    raise ValueError(f"{role} node missing from profile")


class ReverseProxyConfigManager:
    def __init__(self, runner: CommandRunner | None = None) -> None:
        self.runner = runner or CommandRunner()

    @staticmethod
    def missing_operator_inputs(environment: EnvironmentConfig) -> tuple[str, ...]:
        rp = environment.reverse_proxy
        missing: list[str] = []
        if not rp.public_host.strip():
            missing.append("reverse_proxy.public_host")
        if rp.tls.mode == "provided":
            if not rp.tls.certificate_file.strip():
                missing.append("reverse_proxy.tls.certificate_file")
            elif not Path(rp.tls.certificate_file).is_file():
                missing.append("reverse proxy certificate file")
            if not rp.tls.key_file.strip():
                missing.append("reverse_proxy.tls.key_file")
            elif not Path(rp.tls.key_file).is_file():
                missing.append("reverse proxy TLS key file")
        elif rp.tls.mode == "acme":
            missing.append("ACME provisioning is guided/deferred; provide TLS material or complete ACME externally")
        return tuple(missing)

    @staticmethod
    def render(environment: EnvironmentConfig) -> str:
        app = _node_host(environment, "application")
        db = _node_host(environment, "database")
        rp = environment.reverse_proxy
        return f'''server {{\n    listen 443 ssl;\n    server_name {rp.public_host};\n\n    ssl_certificate {rp.tls.certificate_file};\n    ssl_certificate_key {rp.tls.key_file};\n\n    location /functions/v1/ {{\n        proxy_pass http://{app}:9000/;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto https;\n    }}\n\n    location /auth/v1/ {{ proxy_pass http://{db}:8000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto https; }}\n    location /rest/v1/ {{ proxy_pass http://{db}:8000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto https; }}\n    location /storage/v1/ {{ proxy_pass http://{db}:8000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto https; }}\n\n    location /realtime/v1/ {{\n        proxy_pass http://{db}:8000;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n        proxy_set_header Host $host;\n        proxy_read_timeout 3600s;\n    }}\n\n    location / {{\n        proxy_pass http://{app}:80;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto https;\n    }}\n}}\n'''

    def nginx_installed(self) -> bool:
        return self.runner.run(("nginx", "-v"), timeout=10).returncode == 0

    def install_nginx(self, *, dry_run: bool = False) -> bool:
        if self.nginx_installed():
            return False
        if dry_run:
            return True
        if self.runner.run(("apt-get", "update"), timeout=600).returncode != 0:
            raise RuntimeError("Nginx package index refresh failed")
        if self.runner.run(("apt-get", "install", "-y", "nginx"), timeout=900).returncode != 0:
            raise RuntimeError("Nginx installation failed")
        return True

    def config_matches(self, environment: EnvironmentConfig) -> bool:
        target = Path(environment.reverse_proxy.config_path)
        return target.is_file() and target.read_text() == self.render(environment)

    def apply(self, environment: EnvironmentConfig) -> bool:
        target = Path(environment.reverse_proxy.config_path)
        content = self.render(environment)
        if target.is_file() and target.read_text() == content:
            return False
        target.parent.mkdir(parents=True, exist_ok=True)
        previous = target.read_bytes() if target.exists() else None
        temp = target.with_name(target.name + ".tmp")
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
        try:
            with os.fdopen(fd, "w") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp, target)
            test = self.runner.run(("nginx", "-t"), timeout=30)
            if test.returncode != 0:
                if previous is None:
                    target.unlink(missing_ok=True)
                else:
                    target.write_bytes(previous)
                raise RuntimeError("Nginx configuration validation failed; previous config restored")
            reload_result = self.runner.run(("systemctl", "reload", "nginx"), timeout=60)
            if reload_result.returncode != 0:
                if previous is None:
                    target.unlink(missing_ok=True)
                else:
                    target.write_bytes(previous)
                self.runner.run(("nginx", "-t"), timeout=30)
                self.runner.run(("systemctl", "reload", "nginx"), timeout=60)
                raise RuntimeError("Nginx reload failed; previous config restored")
            return True
        finally:
            temp.unlink(missing_ok=True)
