"""Run Nudge so a phone on the same Wi-Fi can open it."""

from __future__ import annotations

import os
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - provided by the project dependency
    load_dotenv = None

if load_dotenv:
    load_dotenv(ROOT / ".env", override=False)


def local_ip() -> str:
    """Return the laptop's routed LAN address without sending application data."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # UDP connect selects the route; it does not send a packet.
        probe.connect(("192.0.2.1", 80))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def main() -> None:
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    ip = local_ip()
    print(f"Phone URL:  http://{ip}:{port}/", flush=True)
    print(f"Laptop URL: http://127.0.0.1:{port}/", flush=True)
    print("Keep this terminal open and connect the phone to the same Wi-Fi.", flush=True)
    print("Note: phones only allow notifications (and app install) over https://. For those, run", flush=True)
    print(f"      cloudflared tunnel --url http://localhost:{port}   and open its https:// link instead.", flush=True)
    if os.getenv("DEMO_MODE", "1") == "0":
        print("Live mode is enabled; Claude calls use the server-side .env key.", flush=True)
    else:
        print("Demo mode is enabled; no Claude credits will be used.", flush=True)

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("RELOAD", "0") == "1",
    )


if __name__ == "__main__":
    main()
