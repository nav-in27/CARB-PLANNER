"""
CARB-Planner — One-Click Unified Project Launcher
Starts both FastAPI backend and Vite frontend on dedicated, unused ports,
pre-loads the demo scenario, and opens the browser dashboard automatically.

Usage:
    python start_project.py
    python start_project.py --frontend-port 5185 --backend-port 8010
    python start_project.py --no-browser
"""

import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")

# Dedicated non-standard default ports to avoid collision with standard Vite (5173) and Uvicorn (8000)
DEFAULT_BACKEND_PORT = 8008
DEFAULT_FRONTEND_PORT = 5180
DEFAULT_HOST = "127.0.0.1"


def is_port_in_use(port: int, host: str = DEFAULT_HOST) -> bool:
    """Check if a TCP port is currently accepting connections."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


def is_carb_backend(port: int, host: str = DEFAULT_HOST) -> bool:
    """Check if an active HTTP service on host:port is specifically the CARB-Planner backend."""
    try:
        req = urllib.request.Request(f"http://{host}:{port}/health")
        with urllib.request.urlopen(req, timeout=1.5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                return data.get("service") == "carb-planner"
    except Exception:
        pass
    return False


def find_unused_port(start_port: int, host: str = DEFAULT_HOST, avoid: set = None, max_attempts: int = 100) -> int:
    """Find the first genuinely unused, bindable port starting from start_port."""
    avoid = avoid or set()
    for offset in range(max_attempts):
        port = start_port + offset
        if port in avoid:
            continue
        if not is_port_in_use(port, host):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    s.bind((host, port))
                    return port
            except OSError:
                continue
    raise RuntimeError(f"Unable to find an unused port in range {start_port}–{start_port + max_attempts}")


def wait_for_service(url: str, timeout: int = 20) -> bool:
    """Poll a URL until it responds with 200/204 or times out."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=1) as response:
                if response.status in (200, 204):
                    return True
        except (urllib.error.URLError, socket.timeout, ConnectionRefusedError):
            time.sleep(0.5)
    return False


def find_compatible_python() -> str:
    """Find a Python interpreter that has all required project packages."""
    # 1. Fast check for current interpreter
    try:
        import importlib
        for mod in ("ortools", "fastapi", "lightgbm", "networkx", "uvicorn"):
            importlib.import_module(mod)
        return sys.executable
    except ImportError:
        pass

    # 2. Check known candidates
    candidates = [
        r"C:\Users\navee\AppData\Local\Programs\Python\Python311\python.exe",
        r"C:\Users\navee\miniconda3\New folder\python.exe",
        "python",
        sys.executable,
    ]
    for py in candidates:
        if not py or not (os.path.exists(py) or py == "python"):
            continue
        try:
            cmd = [py, "-c", "import ortools, fastapi, lightgbm, networkx; print('OK')"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
            if res.returncode == 0 and "OK" in res.stdout:
                return py
        except Exception:
            continue
    return sys.executable


def parse_args():
    parser = argparse.ArgumentParser(description="CARB-Planner Unified Project Launcher")
    parser.add_argument(
        "-f", "--frontend-port",
        type=int,
        default=int(os.environ.get("CARB_FRONTEND_PORT", DEFAULT_FRONTEND_PORT)),
        help=f"Preferred frontend port (default: {DEFAULT_FRONTEND_PORT}, auto-selects unused if occupied)"
    )
    parser.add_argument(
        "-b", "--backend-port",
        type=int,
        default=int(os.environ.get("CARB_BACKEND_PORT", DEFAULT_BACKEND_PORT)),
        help=f"Preferred backend port (default: {DEFAULT_BACKEND_PORT}, auto-selects unused if occupied)"
    )
    parser.add_argument(
        "--host",
        type=str,
        default=DEFAULT_HOST,
        help=f"Host address to bind servers (default: {DEFAULT_HOST})"
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open the browser automatically upon launch"
    )
    return parser.parse_args()


def main():
    args = parse_args()
    host = args.host

    print("=" * 68)
    print("  CARB-Planner — SIH26027 Indian Railways Block Planner")
    print("  Unified Startup Launcher with Dynamic Port Isolation")
    print("=" * 68)

    processes = []
    py_exec = find_compatible_python()

    # ─────────────────────────────────────────────────────────────
    # 1. Resolve Backend Port (Dedicated & Isolated)
    # ─────────────────────────────────────────────────────────────
    target_backend_port = args.backend_port
    backend_already_running = False

    if is_port_in_use(target_backend_port, host):
        if is_carb_backend(target_backend_port, host):
            print(f"[+] Found existing CARB-Planner backend on http://{host}:{target_backend_port}")
            backend_port = target_backend_port
            backend_already_running = True
        else:
            print(f"[!] Port {target_backend_port} is occupied by another application/project.")
            backend_port = find_unused_port(target_backend_port + 1, host)
            print(f"[*] Allocated dedicated unused port for CARB-Planner backend: {backend_port}")
    else:
        backend_port = target_backend_port

    # ─────────────────────────────────────────────────────────────
    # 2. Resolve Frontend Port (Dedicated & Isolated)
    # ─────────────────────────────────────────────────────────────
    target_frontend_port = args.frontend_port
    if is_port_in_use(target_frontend_port, host):
        print(f"[!] Port {target_frontend_port} is occupied by another application/project.")
        frontend_port = find_unused_port(target_frontend_port + 1, host, avoid={backend_port})
        print(f"[*] Allocated dedicated unused port for CARB-Planner frontend: {frontend_port}")
    else:
        frontend_port = target_frontend_port

    print(f"\n[+] Configured Port Allocation:")
    print(f"    • Backend API:      http://{host}:{backend_port}")
    print(f"    • Frontend UI:       http://{host}:{frontend_port}")
    print(f"    • Python Runtime:    {py_exec}\n")

    try:
        # ─────────────────────────────────────────────────────────
        # 3. Start Backend if not already running
        # ─────────────────────────────────────────────────────────
        if not backend_already_running:
            print(f"[*] Launching FastAPI Backend on http://{host}:{backend_port}...")
            backend_cmd = [
                py_exec,
                "-m",
                "uvicorn",
                "backend.main:app",
                "--host",
                host,
                "--port",
                str(backend_port),
                "--reload",
            ]
            backend_proc = subprocess.Popen(backend_cmd, cwd=PROJECT_ROOT)
            processes.append(backend_proc)

            print("[*] Waiting for backend to initialize (CP-SAT & ML models)...")
            if wait_for_service(f"http://{host}:{backend_port}/health", timeout=30):
                print(f"[+] Backend initialized and healthy on port {backend_port}!")
            else:
                poll = backend_proc.poll()
                print(f"[!] Warning: Backend health check timed out (exit code: {poll}), proceeding anyway...")

        # Verify Scenario Status
        try:
            status_req = urllib.request.Request(f"http://{host}:{backend_port}/api/status")
            with urllib.request.urlopen(status_req, timeout=10) as resp:
                if resp.status == 200:
                    print("[+] Corridor timetable, network topology & CP-SAT solver ready!")
        except Exception as e:
            print(f"[!] Note on backend status: {e}")

        # ─────────────────────────────────────────────────────────
        # 4. Start Frontend
        # ─────────────────────────────────────────────────────────
        print(f"\n[*] Launching Vite Frontend on http://{host}:{frontend_port}...")
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"

        # Pass ports directly through environment so Vite proxy targets the exact backend port
        frontend_env = os.environ.copy()
        frontend_env["PORT"] = str(frontend_port)
        frontend_env["VITE_PORT"] = str(frontend_port)
        frontend_env["BACKEND_PORT"] = str(backend_port)
        frontend_env["VITE_BACKEND_PORT"] = str(backend_port)

        frontend_cmd = [
            npm_cmd,
            "run",
            "dev",
            "--",
            "--host",
            host,
            "--port",
            str(frontend_port),
            "--strictPort",
        ]
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            cwd=FRONTEND_DIR,
            env=frontend_env,
        )
        processes.append(frontend_proc)

        print("[*] Waiting for frontend dev server...")
        time.sleep(2)

        # ─────────────────────────────────────────────────────────
        # 5. Open in Browser
        # ─────────────────────────────────────────────────────────
        dashboard_url = f"http://localhost:{frontend_port}"
        if not args.no_browser:
            print(f"[+] Opening CARB-Planner Dashboard: {dashboard_url}")
            webbrowser.open(dashboard_url)

        print("\n" + "=" * 68)
        print("  CARB-Planner is LIVE and ISOLATED on its own ports!")
        print(f"  • Web Dashboard:  http://localhost:{frontend_port}")
        print(f"  • API Swagger:    http://localhost:{backend_port}/docs")
        print(f"  • Health Check:   http://localhost:{backend_port}/health")
        print("  Press Ctrl+C at any time to terminate both servers.")
        print("=" * 68 + "\n")

        # Keep alive until Ctrl+C
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[*] Stopping CARB-Planner servers...")
    finally:
        for p in processes:
            try:
                p.terminate()
                p.wait(timeout=3)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass
        print("[+] All servers terminated cleanly. Goodbye!")


if __name__ == "__main__":
    main()
