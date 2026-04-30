"""Build TriviaMQTT Windows executable using PyInstaller."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--name",
        "TriviaMQTT",
        "--add-data",
        "app/static;app/static",
        "--add-data",
        "app/templates;app/templates",
        "--hidden-import",
        "app.main",
        "--hidden-import",
        "app.embedded_broker",
        "--collect-submodules",
        "amqtt.plugins",
        "launcher.py",
    ]
    subprocess.run(command, cwd=root, check=True)


if __name__ == "__main__":
    main()
