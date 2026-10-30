import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FASTAPI_DIR = ROOT / "services" / "catalog-matching-fastapi"
EXPRESS_DIR = ROOT / "services" / "claims-express-service"
FRONTEND_DIR = ROOT / "frontend"


def get_lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def npm_cmd() -> str:
    found = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not found:
        print("Error: Node.js / npm is not installed. Install Node.js LTS from https://nodejs.org first.")
        sys.exit(1)
    return found


def ensure_dependencies(npm_bin: str) -> None:
    try:
        import aiosqlite
        import fastapi
        import httpx
        import jwt
        import numpy
        import uvicorn
    except ImportError:
        print("Installing Python backend packages...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(FASTAPI_DIR / "requirements.txt")])

    if not (EXPRESS_DIR / "node_modules").exists():
        print("Installing Express notification packages...")
        subprocess.check_call([npm_bin, "install"], cwd=str(EXPRESS_DIR))

    if not (FRONTEND_DIR / "node_modules").exists():
        print("Installing Frontend packages...")
        subprocess.check_call([npm_bin, "install"], cwd=str(FRONTEND_DIR))


def main() -> None:
    npm_bin = npm_cmd()
    node_bin = shutil.which("node.exe" if os.name == "nt" else "node") or "node"
    ensure_dependencies(npm_bin)

    procs = []
    try:
        procs.append(
            subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8001"],
                cwd=str(FASTAPI_DIR),
            )
        )
        procs.append(
            subprocess.Popen(
                [node_bin, "server.js"],
                cwd=str(EXPRESS_DIR),
            )
        )
        time.sleep(1.5)
        procs.append(
            subprocess.Popen(
                [npm_bin, "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"],
                cwd=str(FRONTEND_DIR),
            )
        )

        lan_ip = get_lan_ip()
        print("\n" + "=" * 62)
        print("KLH University Lost & Found is running!")
        print("  Your laptop:            http://localhost:5173")
        print(f"  Friends on same Wi-Fi:  http://{lan_ip}:5173")
        print("Press Ctrl+C to stop all services.")
        print("=" * 62 + "\n")

        while True:
            time.sleep(1)
            for p in procs:
                if p.poll() is not None:
                    raise KeyboardInterrupt
    except KeyboardInterrupt:
        print("\nStopping KLH Lost & Found services...")
        for p in procs:
            if p.poll() is None:
                if os.name == "nt":
                    p.terminate()
                else:
                    p.send_signal(signal.SIGTERM)
        for p in procs:
            try:
                p.wait(timeout=5)
            except Exception:
                p.kill()


if __name__ == "__main__":
    main()
