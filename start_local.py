#!/usr/bin/env python3
"""
Lesion Lens local demo launcher.

Starts:
  - FastAPI backend on http://localhost:8000
  - Vite frontend on http://localhost:5173

Ctrl+C cleanly stops both services.
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = BACKEND / ("venv" if os.name == "nt" else ".venv")

BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8000
FRONTEND_HOST = "127.0.0.1"
FRONTEND_PORT = 5173

processes: list[tuple[str, subprocess.Popen]] = []
stopping = False


def log(message: str) -> None:
    print(f"[launcher] {message}", flush=True)


def run(command: list[str], cwd: Path, label: str) -> subprocess.Popen:
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    kwargs = {
        "cwd": str(cwd),
        "env": env,
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "text": True,
        "bufsize": 1,
    }

    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True

    process = subprocess.Popen(command, **kwargs)
    processes.append((label, process))
    threading.Thread(target=stream_logs, args=(label, process), daemon=True).start()
    return process


def stream_logs(label: str, process: subprocess.Popen) -> None:
    if process.stdout is None:
        return

    for line in process.stdout:
        print(f"[{label}] {line}", end="", flush=True)


def executable(name: str) -> Path:
    if os.name == "nt":
        return VENV / "Scripts" / name
    return VENV / "bin" / name


def ensure_python_env() -> Path:
    python = executable("python.exe" if os.name == "nt" else "python")

    if not python.exists():
        log(f"Creating Python environment at {VENV}")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV)])

    pip = executable("pip.exe" if os.name == "nt" else "pip")
    requirements = BACKEND / "requirements.txt"

    marker = VENV / ".lesion_lens_requirements_installed"
    if not marker.exists():
        log("Installing backend Python dependencies (first run only)...")
        subprocess.check_call([str(pip), "install", "-r", str(requirements)])
        marker.write_text("installed\n", encoding="utf-8")

    return python


def ensure_frontend_dependencies() -> None:
    node_modules = FRONTEND / "node_modules"
    if not node_modules.exists():
        log("Installing frontend npm dependencies (first run only)...")
        subprocess.check_call(["npm", "install"], cwd=str(FRONTEND))


def wait_for_port(host: str, port: int, process: subprocess.Popen, timeout: float = 120) -> None:
    deadline = time.time() + timeout

    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Service exited before opening port {host}:{port} (code {process.returncode})")

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            if sock.connect_ex((host, port)) == 0:
                return

        time.sleep(0.5)

    raise TimeoutError(f"Timed out waiting for {host}:{port}")


def stop_process(label: str, process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return

    log(f"Stopping {label}...")

    try:
        if os.name == "nt":
            # /T also terminates child processes such as Vite/uvicorn reload children.
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
    except Exception as exc:
        log(f"Could not gracefully stop {label}: {exc}")


def shutdown(*_args) -> None:
    global stopping
    if stopping:
        return
    stopping = True

    print("\n", flush=True)
    for label, process in reversed(processes):
        stop_process(label, process)

    log("All local services stopped.")
    raise SystemExit(0)


def main() -> None:
    if not BACKEND.exists() or not FRONTEND.exists():
        raise RuntimeError("Expected backend/ and frontend/ directories in the project root.")

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    log("Preparing local environment...")
    python = ensure_python_env()
    ensure_frontend_dependencies()

    log("Starting backend...")
    backend = run(
        [
            str(python),
            "-m",
            "uvicorn",
            "app.main:app",
            "--app-dir",
            str(BACKEND),
            "--host",
            BACKEND_HOST,
            "--port",
            str(BACKEND_PORT),
        ],
        ROOT,
        "backend",
    )

    wait_for_port(BACKEND_HOST, BACKEND_PORT, backend)
    log(f"Backend ready: http://localhost:{BACKEND_PORT}")

    log("Starting frontend...")
    frontend = run(
        ["npm", "run", "dev", "--", "--host", FRONTEND_HOST, "--port", str(FRONTEND_PORT)],
        FRONTEND,
        "frontend",
    )

    wait_for_port(FRONTEND_HOST, FRONTEND_PORT, frontend)
    log(f"Frontend ready: http://localhost:{FRONTEND_PORT}")

    # Give Vite a moment to finish its initial compilation before opening the browser.
    time.sleep(1)
    webbrowser.open(f"http://localhost:{FRONTEND_PORT}")

    print()
    log("Lesion Lens is running locally.")
    log("Frontend: http://localhost:5173")
    log("Backend:  http://localhost:8000")
    log("Developer logs from both services are shown below.")
    log("Press Ctrl+C to stop everything.")
    print()

    try:
        while True:
            for label, process in processes:
                if process.poll() is not None and not stopping:
                    log(f"{label} exited with code {process.returncode}. Shutting down.")
                    shutdown()
            time.sleep(0.5)
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()
