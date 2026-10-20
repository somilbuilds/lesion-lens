#!/usr/bin/env python3
"""
SkinLesionNet - Automated Cloudflare Tunnel & Render CI/CD Bridge
================================================================
This script turns your local laptop into the compute engine for SkinLesionNet,
while your Render static site serves the frontend.

Workflow:
1. Verifies/starts your local FastAPI backend on a flexible port (default: 8000).
2. Launches an encrypted Cloudflare Tunnel (trycloudflare.com).
3. Pings the public tunnel to verify it is responsive.
4. Uses the Render REST API to update VITE_API_BASE_URL on your frontend service.
5. Triggers a Render deployment and displays the live status.
6. Gives you an instant URL so you can use Render immediately without waiting for builds!
7. Keeps localhost frontend and backend completely intact and operational.
"""

import os
import sys
import time
import re
import signal
import subprocess
import threading
import urllib.request
import urllib.error
import json
import argparse
from pathlib import Path

# Base Paths
REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_DIR = REPO_ROOT / "frontend"
ENV_FILE = REPO_ROOT / ".env"

# Windows python interpreter inside virtualenv
VENV_PYTHON = BACKEND_DIR / "venv" / "Scripts" / "python.exe"
if not VENV_PYTHON.exists():
    VENV_PYTHON = Path(sys.executable)


def load_env(env_path: Path) -> dict:
    """Load key-value pairs from .env file."""
    env = {}
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    env[key.strip()] = val.strip().strip("'\"")
    return env


def is_backend_alive(port: int) -> bool:
    """Check if FastAPI backend responds to health check."""
    try:
        url = f"http://127.0.0.1:{port}/api/health"
        req = urllib.request.Request(url, headers={"User-Agent": "TunnelSync/1.0"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False


def start_local_backend(port: int) -> subprocess.Popen:
    """Start FastAPI uvicorn server in a subprocess."""
    print(f"[*] Starting local FastAPI backend on port {port}...")
    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_DIR)
    
    cmd = [
        str(VENV_PYTHON),
        "-m", "uvicorn",
        "app.main:app",
        "--host", "127.0.0.1",
        "--port", str(port),
    ]
    
    proc = subprocess.Popen(
        cmd,
        cwd=str(REPO_ROOT),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    
    # Wait up to 15 seconds for startup
    for _ in range(30):
        if is_backend_alive(port):
            print(f"[✓] Local backend is live and healthy at http://127.0.0.1:{port}")
            return proc
        time.sleep(0.5)
        
    print("[!] Warning: Backend took longer than expected to start.")
    return proc


def find_cloudflared() -> str:
    """Locate cloudflared executable on the system."""
    import shutil
    found = shutil.which("cloudflared")
    if found:
        return found
    
    # Check standard Windows paths
    candidates = [
        Path(r"C:\Program Files (x86)\cloudflared\cloudflared.exe"),
        Path(r"C:\Program Files\cloudflared\cloudflared.exe"),
        REPO_ROOT / "bin" / "cloudflared.exe",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
            
    raise FileNotFoundError(
        "cloudflared executable was not found. Please install it or place it in your PATH:\n"
        "Download from: https://github.com/cloudflare/cloudflared/releases/latest"
    )


def update_render_env_var(api_key: str, service_id: str, tunnel_url: str):
    """Update VITE_API_BASE_URL on the Render service using the Render REST API."""
    url = f"https://api.render.com/v1/services/{service_id}/env-vars"
    payload = json.dumps([
        {"key": "VITE_API_BASE_URL", "value": tunnel_url}
    ]).encode("utf-8")
    
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="PUT"
    )
    
    with urllib.request.urlopen(req, timeout=15) as resp:
        if resp.status in (200, 201):
            return json.loads(resp.read().decode())
        raise RuntimeError(f"Render API returned status {resp.status}")


def trigger_render_deploy(api_key: str, service_id: str) -> str:
    """Trigger a new deployment on Render."""
    url = f"https://api.render.com/v1/services/{service_id}/deploys"
    payload = json.dumps({"clearCache": "do_not_clear"}).encode("utf-8")
    
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST"
    )
    
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())
        return data.get("id", "")


def poll_deploy_status(api_key: str, service_id: str, deploy_id: str, timeout_sec: int = 180):
    """Poll Render deployment status until live or failure."""
    if not deploy_id:
        return
        
    url = f"https://api.render.com/v1/services/{service_id}/deploys/{deploy_id}"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
    )
    
    start = time.time()
    last_status = ""
    print("[*] Tracking Render deployment progress in background...")
    
    while time.time() - start < timeout_sec:
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                status = data.get("status", "unknown")
                if status != last_status:
                    print(f"    -> Render Deploy Status: {status}")
                    last_status = status
                if status == "live":
                    print("[✓] Render static site deploy is LIVE and connected!")
                    return
                elif status in ("build_failed", "update_failed", "canceled"):
                    print(f"[!] Render deploy ended with status: {status}")
                    return
        except Exception:
            pass
        time.sleep(5)


def main():
    parser = argparse.ArgumentParser(description="SkinLesionNet - Cloudflare Tunnel & Render CI/CD")
    parser.add_argument("--port", type=int, default=None, help="Backend port (default: from .env or 8000)")
    parser.add_argument("--frontend-port", type=int, default=None, help="Local frontend port (default: 5173)")
    parser.add_argument("--service-id", type=str, default=None, help="Render service ID (default: from .env)")
    parser.add_argument("--no-deploy", action="store_true", help="Update Render env var without triggering a build")
    parser.add_argument("--start-frontend", action="store_true", help="Also start local Vite frontend dev server")
    args = parser.parse_args()

    # Load environment configuration
    env = load_env(ENV_FILE)
    backend_port = args.port or int(env.get("BACKEND_PORT", 8000))
    frontend_port = args.frontend_port or int(env.get("FRONTEND_PORT", 5173))
    render_api_key = env.get("RENDER_API_KEY", "")
    render_service_id = args.service_id or env.get("RENDER_SERVICE_ID", "srv-db3dis5g1s2s73a0uovg")

    print("\n" + "="*70)
    print("  SkinLesionNet - Laptop Backend & Render Cloudflare Tunnel Bridge")
    print("="*70)
    print(f"• Laptop Backend Port:  {backend_port}")
    print(f"• Localhost Frontend:   http://localhost:{frontend_port}")
    print(f"• Render Service ID:    {render_service_id}")
    print(f"• Render API Key:       {'Configured (hidden)' if render_api_key else 'NOT CONFIGURED'}")
    print("="*70 + "\n")

    backend_proc = None
    frontend_proc = None
    tunnel_proc = None

    try:
        # Step 1: Ensure local backend is running
        if not is_backend_alive(backend_port):
            backend_proc = start_local_backend(backend_port)
        else:
            print(f"[✓] Existing backend detected on port {backend_port}.")

        # (Optional) Start local frontend if requested
        if args.start_frontend:
            print(f"[*] Starting local Vite frontend on port {frontend_port}...")
            frontend_env = os.environ.copy()
            frontend_env["BACKEND_PORT"] = str(backend_port)
            frontend_env["FRONTEND_PORT"] = str(frontend_port)
            frontend_proc = subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=str(FRONTEND_DIR),
                shell=True,
                env=frontend_env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            print(f"[✓] Local frontend running at http://localhost:{frontend_port}")

        # Step 2: Locate cloudflared binary
        cloudflared_bin = find_cloudflared()
        print(f"[✓] Using cloudflared: {cloudflared_bin}")

        # Step 3: Launch Cloudflare Tunnel
        print(f"[*] Creating Cloudflare tunnel forwarding to http://127.0.0.1:{backend_port}...")
        tunnel_cmd = [cloudflared_bin, "tunnel", "--url", f"http://127.0.0.1:{backend_port}"]
        
        tunnel_proc = subprocess.Popen(
            tunnel_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        # Regex to capture the public trycloudflare URL
        tunnel_url = None
        url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

        # Read tunnel output until URL is found
        for line in tunnel_proc.stdout:
            match = url_pattern.search(line)
            if match:
                tunnel_url = match.group(0)
                break
            if "error" in line.lower() and "failed" in line.lower():
                print(f"[!] Tunnel output: {line.strip()}")

        if not tunnel_url:
            raise RuntimeError("Failed to obtain a public Cloudflare tunnel URL.")

        print(f"\n[✓] Tunnel Established: {tunnel_url}")

        # Step 4: Verify tunnel health
        print("[*] Verifying public tunnel connectivity...")
        tunnel_healthy = False
        for _ in range(15):
            try:
                test_req = urllib.request.Request(
                    f"{tunnel_url}/api/health",
                    headers={"User-Agent": "TunnelSync/1.0"}
                )
                with urllib.request.urlopen(test_req, timeout=3) as resp:
                    if resp.status == 200:
                        tunnel_healthy = True
                        break
            except Exception:
                time.sleep(1)

        if tunnel_healthy:
            print("[✓] Public HTTPS tunnel is responding with 200 OK!")
        else:
            print("[!] Note: Public tunnel is warming up; continuing with Render sync.")

        # Step 5: Render API CI/CD Integration
        instant_render_url = f"https://lesion-lens-1.onrender.com/?backend={tunnel_url}"

        if render_api_key and render_service_id:
            print(f"\n[*] Updating Render service {render_service_id}...")
            try:
                update_render_env_var(render_api_key, render_service_id, tunnel_url)
                print(f"[✓] Successfully set VITE_API_BASE_URL = {tunnel_url} on Render!")

                if not args.no_deploy:
                    print("[*] Triggering Render build and deployment...")
                    deploy_id = trigger_render_deploy(render_api_key, render_service_id)
                    print(f"[✓] Deployment triggered! (Deploy ID: {deploy_id})")

                    # Run polling in a separate daemon thread so the tunnel remains responsive
                    poll_thread = threading.Thread(
                        target=poll_deploy_status,
                        args=(render_api_key, render_service_id, deploy_id),
                        daemon=True
                    )
                    poll_thread.start()
            except Exception as e:
                print(f"[!] Render API sync warning: {e}")
        else:
            print("[!] Render API key not provided; skipping automated Render CI/CD update.")

        # Print active access links
        print("\n" + "="*70)
        print("  ACTIVE ACCESS ENDPOINTS:")
        print("="*70)
        print(f"  1. INSTANT RENDER LINK:  {instant_render_url}")
        print("     (Click and use IMMEDIATELY without waiting for Render to rebuild!)")
        print(f"  2. RENDER DEFAULT SITE:  https://lesion-lens-1.onrender.com")
        print(f"  3. PUBLIC BACKEND API:   {tunnel_url}/api/health")
        print(f"  4. LOCAL BACKEND:        http://127.0.0.1:{backend_port}")
        print(f"  5. LOCAL FRONTEND:       http://localhost:{frontend_port}")
        print("="*70)
        print("  Press Ctrl+C at any time to shut down the tunnel and exit.")
        print("="*70 + "\n")

        # Keep running until Ctrl+C
        tunnel_proc.wait()

    except KeyboardInterrupt:
        print("\n[*] Received shutdown signal. Terminating processes...")
    finally:
        if tunnel_proc and tunnel_proc.poll() is None:
            tunnel_proc.terminate()
            print("[✓] Cloudflare tunnel stopped.")
        if backend_proc and backend_proc.poll() is None:
            backend_proc.terminate()
            print("[✓] Local background backend stopped.")
        if frontend_proc and frontend_proc.poll() is None:
            frontend_proc.terminate()
            print("[✓] Local frontend stopped.")
        print("[*] Teardown complete. Goodbye!")


if __name__ == "__main__":
    main()
