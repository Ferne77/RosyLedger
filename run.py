#!/usr/bin/env python3
"""
RosyLedger — development launcher.

Starts the FastAPI app (API + static SPA) and opens the default browser. If the
current interpreter lacks ``uvicorn``, re-executes with ``.venv`` Python when
present (helps IDE / Code Runner). Before boot, it also checks whether the
target port is already occupied and attempts to free it automatically.

Usage:
  python run.py              # default: reload on app/ and public/ changes
  python run.py --no-reload  # no file watcher
  python run.py --port 8080
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCRIPT = Path(__file__).resolve()
REQUIRED_MODULES = ("uvicorn", "fastapi", "pydantic", "motor")


def _venv_dir() -> Path:
    return ROOT / ".venv"


def _venv_python() -> Path | None:
    if sys.platform == "win32":
        p = ROOT / ".venv" / "Scripts" / "python.exe"
        return p if p.is_file() else None
    for name in ("python3", "python"):
        p = ROOT / ".venv" / "bin" / name
        if p.is_file():
            return p
    return None


def _venv_pip() -> Path | None:
    if sys.platform == "win32":
        p = ROOT / ".venv" / "Scripts" / "pip.exe"
        return p if p.is_file() else None
    p = ROOT / ".venv" / "bin" / "pip"
    return p if p.is_file() else None


def _run_cmd(cmd: list[str], *, desc: str) -> bool:
    print(desc, file=sys.stderr)
    proc = subprocess.run(cmd, cwd=ROOT, check=False)
    return proc.returncode == 0


def _bootstrap_venv() -> bool:
    req = ROOT / "requirements.txt"
    venv = _venv_dir()
    if not venv.exists():
        if not _run_cmd([sys.executable, "-m", "venv", str(venv)], desc="Creating virtual environment (.venv)..."):
            return False
    if not req.is_file():
        return True
    vpip = _venv_pip()
    if not vpip:
        return False
    if not _run_cmd([str(vpip), "install", "-U", "pip"], desc="Upgrading pip in .venv..."):
        return False
    return _run_cmd(
        [str(vpip), "install", "-r", str(req)],
        desc="Installing dependencies from requirements.txt...",
    )


def _missing_modules(modules: tuple[str, ...]) -> list[str]:
    missing: list[str] = []
    for mod in modules:
        if importlib.util.find_spec(mod) is None:
            missing.append(mod)
    return missing


def _venv_missing_modules(modules: tuple[str, ...]) -> list[str] | None:
    vpy = _venv_python()
    if not vpy:
        return None
    check_script = (
        "import importlib.util, json\n"
        f"mods = {repr(modules)}\n"
        "missing = [m for m in mods if importlib.util.find_spec(m) is None]\n"
        "print(json.dumps(missing))\n"
    )
    proc = subprocess.run(
        [str(vpy), "-c", check_script],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return None
    out = (proc.stdout or "").strip()
    if not out:
        return None
    try:
        import json

        data = json.loads(out)
    except Exception:
        return None
    if not isinstance(data, list):
        return None
    return [str(x) for x in data]


def _ensure_deps() -> None:
    """Ensure required runtime deps are available, bootstrapping .venv when needed."""
    missing_here = _missing_modules(REQUIRED_MODULES)
    if not missing_here:
        return

    print(
        f"Missing dependencies in current Python: {', '.join(missing_here)}",
        file=sys.stderr,
    )

    vpy = _venv_python()
    if vpy:
        missing_in_venv = _venv_missing_modules(REQUIRED_MODULES)
        if missing_in_venv == []:
            print("Switching to .venv Python...", file=sys.stderr)
            os.execv(str(vpy), [str(vpy), str(SCRIPT), *sys.argv[1:]])

    if _bootstrap_venv():
        vpy = _venv_python()
        if vpy:
            os.execv(str(vpy), [str(vpy), str(SCRIPT), *sys.argv[1:]])
    print(
        "Required dependencies are missing and automatic setup failed.\n"
        "From the project folder run:\n"
        "  python3 -m venv .venv\n"
        "  .venv/bin/pip install -r requirements.txt\n"
        "Then: .venv/bin/python run.py\n"
        "(Windows: use .venv\\\\Scripts\\\\pip and .venv\\\\Scripts\\\\python)",
        file=sys.stderr,
    )
    sys.exit(1)


_ensure_deps()

import uvicorn  # noqa: E402
from app.config import settings  # noqa: E402


class RosyLedgerLauncher:
    """Run Uvicorn for ``app.main:app`` and open the app URL once the server is up."""

    def __init__(self, host: str = "127.0.0.1", port: int = 3000) -> None:
        self.host = host
        self.port = port

    def _open_browser(self) -> None:
        time.sleep(0.9)
        webbrowser.open(f"http://{self.host}:{self.port}/")

    def _probe_host(self) -> str:
        if self.host in ("0.0.0.0", "::"):
            return "127.0.0.1"
        return self.host

    def _port_in_use(self) -> bool:
        probe_host = self._probe_host()
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.4)
            return sock.connect_ex((probe_host, self.port)) == 0

    def _list_listening_pids(self) -> list[int]:
        if sys.platform == "win32":
            return []
        proc = subprocess.run(
            [
                "lsof",
                "-nP",
                f"-iTCP:{self.port}",
                "-sTCP:LISTEN",
                "-t",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            check=False,
        )
        out = (proc.stdout or "").strip()
        if not out:
            return []
        pids: list[int] = []
        for line in out.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                pid = int(line)
            except ValueError:
                continue
            if pid not in pids:
                pids.append(pid)
        return pids

    def _pid_alive(self, pid: int) -> bool:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    def _terminate_pid(self, pid: int) -> bool:
        if pid == os.getpid():
            return False
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            return False
        deadline = time.time() + 3.0
        while time.time() < deadline:
            if not self._pid_alive(pid):
                return True
            time.sleep(0.1)
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            return not self._pid_alive(pid)
        time.sleep(0.2)
        return not self._pid_alive(pid)

    def _ensure_port_ready(self) -> None:
        if not self._port_in_use():
            return
        if sys.platform == "win32":
            print(
                f"Port {self.port} is already in use. Stop the existing process "
                f"or run with --port on a different port.",
                file=sys.stderr,
            )
            sys.exit(1)
        pids = self._list_listening_pids()
        if not pids:
            print(
                f"Port {self.port} is in use but no listening PID was detected.",
                file=sys.stderr,
            )
            sys.exit(1)
        print(
            f"Port {self.port} is in use. Attempting to stop listener PID(s): {pids}",
            file=sys.stderr,
        )
        terminated = 0
        for pid in pids:
            if self._terminate_pid(pid):
                terminated += 1
        time.sleep(0.2)
        if self._port_in_use():
            print(
                f"Failed to free port {self.port}. Stop the process manually or "
                f"choose another port with --port.",
                file=sys.stderr,
            )
            sys.exit(1)
        if terminated:
            print(
                f"Port {self.port} is now available ({terminated} process(es) stopped).",
                file=sys.stderr,
            )

    def run(self, *, reload: bool = True) -> None:
        self._ensure_port_ready()
        threading.Thread(target=self._open_browser, daemon=True).start()
        reload_dirs = None
        if reload:
            reload_dirs = [str(ROOT / "app"), str(ROOT / "public")]
        run_kwargs = {
            "app": "app.main:app",
            "host": self.host,
            "port": self.port,
            "reload": reload,
            "reload_dirs": reload_dirs,
        }
        try:
            uvicorn.run(**run_kwargs)
        except ModuleNotFoundError as exc:
            missing_mod = getattr(exc, "name", "")
            if reload and missing_mod == "watchfiles._rust_notify":
                print(
                    "watchfiles native extension is unavailable; "
                    "falling back to no-reload mode.",
                    file=sys.stderr,
                )
                uvicorn.run(
                    app="app.main:app",
                    host=self.host,
                    port=self.port,
                    reload=False,
                )
                return
            raise


def main() -> None:
    parser = argparse.ArgumentParser(description="RosyLedger — one-click dev server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=settings.port)
    parser.add_argument(
        "--no-reload",
        action="store_true",
        help="Disable auto-reload (default is reload on app/ and public/ changes)",
    )
    args = parser.parse_args()
    RosyLedgerLauncher(host=args.host, port=args.port).run(
        reload=not args.no_reload
    )


if __name__ == "__main__":
    main()
