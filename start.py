#!/usr/bin/env python3
"""
Starts the AnimeStream site from Python, for hosts that launch a .py file
(Discord-bot panels, Pterodactyl "Python" eggs, etc.). Node.js 18+ must
still be installed on the host; this script just drives it.

    python start.py              install (if needed), build (if needed), run
    python start.py --rebuild    force a fresh build first

Port: taken from PORT or SERVER_PORT (Pterodactyl), default 3000.
Any other settings (ENABLE_DEMO_SOURCE, SELF_HOSTED_BASE_URL) are read from
the environment or a .env.local file next to this script.
"""

import hashlib
import os
import shutil
import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NEXT_BIN = ROOT / "node_modules" / "next" / "dist" / "bin" / "next"
STAMP = ROOT / "node_modules" / ".lock-hash"
BUILD_ID = ROOT / ".next" / "BUILD_ID"


def log(msg: str) -> None:
    print(f"[start.py] {msg}", flush=True)


def find(cmd: str) -> str:
    path = shutil.which(cmd)
    if not path:
        log(f"'{cmd}' was not found. Install Node.js 18 or newer on this host.")
        sys.exit(1)
    return path


def run(args: list[str]) -> None:
    log("$ " + " ".join(args))
    result = subprocess.run(args, cwd=ROOT)
    if result.returncode != 0:
        log(f"command failed with exit code {result.returncode}")
        sys.exit(result.returncode)


def lock_hash() -> str:
    lock = ROOT / "package-lock.json"
    return hashlib.sha256(lock.read_bytes()).hexdigest() if lock.exists() else ""


def install(npm: str) -> None:
    # Reinstall only when node_modules is missing or package-lock.json changed.
    if NEXT_BIN.exists() and STAMP.exists() and STAMP.read_text() == lock_hash():
        log("dependencies up to date")
        return
    run([npm, "ci" if (ROOT / "package-lock.json").exists() else "install", "--no-audit", "--no-fund"])
    STAMP.write_text(lock_hash())


def needs_build() -> bool:
    if not BUILD_ID.exists():
        return True
    built = BUILD_ID.stat().st_mtime
    for folder in ("app", "components", "lib"):
        for f in (ROOT / folder).rglob("*"):
            if f.is_file() and f.stat().st_mtime > built:
                return True
    return any((ROOT / f).stat().st_mtime > built for f in ("package.json", "next.config.mjs", "tsconfig.json"))


def main() -> None:
    node = find("node")
    npm = find("npm")
    version = subprocess.run([node, "-v"], capture_output=True, text=True).stdout.strip()
    log(f"Node.js {version}")
    if int(version.lstrip("v").split(".")[0]) < 18:
        log("Node.js 18 or newer is required.")
        sys.exit(1)

    os.environ.setdefault("NEXT_TELEMETRY_DISABLED", "1")
    install(npm)

    if "--rebuild" in sys.argv or needs_build():
        run([node, str(NEXT_BIN), "build"])
    else:
        log("build up to date")

    port = os.environ.get("PORT") or os.environ.get("SERVER_PORT") or "3000"
    log(f"starting on port {port}")
    server = subprocess.Popen([node, str(NEXT_BIN), "start", "-p", port, "-H", "0.0.0.0"], cwd=ROOT)

    def stop(*_):
        server.terminate()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    sys.exit(server.wait())


if __name__ == "__main__":
    main()
