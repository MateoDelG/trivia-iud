"""Launch TriviaMQTT with embedded broker and browser."""

from __future__ import annotations

import threading
import time
import urllib.error
import urllib.request
import webbrowser

import uvicorn

from app import config
from app.main import app


def _wait_and_open_browser() -> None:
    if not config.OPEN_BROWSER_ON_START:
        return

    browser_host = "127.0.0.1" if config.APP_HOST == "0.0.0.0" else config.APP_HOST
    url = f"http://{browser_host}:{config.APP_PORT}/setup"
    deadline = time.time() + config.APP_STARTUP_TIMEOUT_SECONDS

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://{browser_host}:{config.APP_PORT}/api/game/state", timeout=1):
                webbrowser.open(url)
                return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.25)


def main() -> None:
    opener = threading.Thread(target=_wait_and_open_browser, daemon=True)
    opener.start()
    uvicorn.run(app, host=config.APP_HOST, port=config.APP_PORT, reload=False)


if __name__ == "__main__":
    main()
