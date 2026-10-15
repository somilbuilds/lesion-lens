#!/usr/bin/env python3
"""Start the Lesion Lens API using the existing backend virtual environment.

Run from any directory with: python start_backend.py
Press Ctrl+C to stop the API and its child processes.
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
PORT = 8000
HOST = "127.0.0.1"


def log(message: str) -> None:
    print(f"[lesion-lens] {message}", flush=True)


def venv_python() -> Path:
    candidates = (
        [BACKEND / "venv" / "Scripts" / "python.exe",
         BACKEND / ".venv" / "Scripts" / "python.exe"]
        if os.name == "nt"
        else [BACKEND / ".venv" / "bin" / "python",
              BACKEND / "venv" / "bin" / "python"]
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    paths = "\n".join(f"  - {path}" for path in candidates)
    raise FileNotFoundError(
        "Could not find the existing backend virtual environment. Expected one of:\n"
        f"{paths}\nCreate it and install backend/requirements.txt first."
    )


def port_is_open() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex((HOST, PORT)) == 0


def clear_port() -> None:
    """Stop the process(es) listening on port 8000 before starting the API."""
    if not port_is_open():
        log(f"Port {PORT} is already free.")
        return

    log(f"Port {PORT} is occupied; stopping its listener before startup.")
    if os.name == "nt":
        # Find the listening PID using PowerShell, then terminate its process tree.
        script = (
            "$c = Get-NetTCPConnection -LocalPort "
            + str(PORT)
            + " -State Listen -ErrorAction SilentlyContinue; "
              "$c | Select-Object -ExpandProperty OwningProcess -Unique"
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True, text=True, check=False,
        )
        pids = {line.strip() for line in result.stdout.splitlines()
                if line.strip().isdigit() and int(line.strip()) != os.getpid()}
        if not pids:
            raise RuntimeError(
                f"Port {PORT} is busy but its PID could not be found. "
                "Close the program using port 8000, then retry."
            )
        for pid in pids:
            subprocess.run(
                ["taskkill", "/PID", pid, "/T", "/F"],
                check=False, capture_output=True, text=True,
            )
    else:
        result = subprocess.run(
            ["lsof", "-ti", f"tcp:{PORT}"],
            capture_output=True, text=True, check=False,
        )
        pids = {line.strip() for line in result.stdout.splitlines()
                if line.strip().isdigit() and int(line.strip()) != os.getpid()}
        if not pids:
            raise RuntimeError(
                f"Port {PORT} is busy but its PID could not be found. "
                "Install lsof or stop the process using port 8000 manually."
            )
        for pid in pids:
            subprocess.run(["kill", "-TERM", pid], check=False)
    for _ in range(30):
        if not port_is_open():
            log(f"Port {PORT} is free.")
            return
        time.sleep(0.2)
    raise RuntimeError(f"Port {PORT} is still occupied after attempting to clear it.")


def main() -> int:
    if not (BACKEND / "app" / "main.py").is_file():
        raise FileNotFoundError(f"Backend entry point not found under {BACKEND}")

    python = venv_python()
    clear_port()

    command = [
        str(python), "-m", "uvicorn", "app.main:app",
        "--app-dir", str(BACKEND),
        "--host", HOST,
        "--port", str(PORT),
    ]
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    start_new_session = os.name != "nt"

    log(f"Using virtual environment: {python.parent}")
    log(f"Starting API at http://localhost:{PORT}")
    log("Press Ctrl+C to stop the API.")

    process = subprocess.Popen(
        command,
        cwd=ROOT,
        creationflags=creationflags,
        start_new_session=start_new_session,
    )
    try:
        while process.poll() is None:
            time.sleep(0.25)
        return int(process.returncode or 0)
    except KeyboardInterrupt:
        log("Stopping backend...")
        if process.poll() is None:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    check=False, capture_output=True,
                )
            else:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
        log("Backend stopped.")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(1)
