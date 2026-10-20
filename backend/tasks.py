"""Cross-platform task runner (make is not available on this setup).

Usage:
    python tasks.py install     # create backend/.venv and install deps
    python tasks.py run         # uvicorn with --reload on port 8000
    python tasks.py serve       # uvicorn without --reload
    python tasks.py secure      # uvicorn with AUTH_ENABLED=true
    python tasks.py users       # list seeded demo accounts
    python tasks.py test        # pytest
    python tasks.py lint        # ruff check
    python tasks.py format      # ruff format + fix
    python tasks.py typecheck   # mypy (strict)
    python tasks.py check       # lint + typecheck + test
"""

from __future__ import annotations

import argparse
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENV_DIR = HERE / ".venv"


def venv_python() -> Path:
    """Path to the venv interpreter, falling back to the current one."""
    bindir = "Scripts" if sys.platform == "win32" else "bin"
    exe = "python.exe" if sys.platform == "win32" else "python"
    candidate = VENV_DIR / bindir / exe
    return candidate if candidate.exists() else Path(sys.executable)


def run(args: list[str], *, env: dict[str, str] | None = None) -> None:
    """Run a command from the backend directory, failing on error."""
    subprocess.run(args, cwd=HERE, check=True, env=env)


def cmd_venv() -> None:
    """Create ``backend/.venv`` (prefers uv, falls back to the venv module)."""
    if VENV_DIR.exists():
        print(f".venv already exists at {VENV_DIR}")
        return
    uv = shutil.which("uv")
    if uv:
        run([uv, "venv", str(VENV_DIR)])
    else:
        run([sys.executable, "-m", "venv", str(VENV_DIR)])


def cmd_install() -> None:
    """Create the venv if needed, then install the project with dev extras."""
    cmd_venv()
    uv = shutil.which("uv")
    if uv:
        run([uv, "pip", "install", "--python", str(venv_python()), "-e", ".[dev]"])
    else:
        run([str(venv_python()), "-m", "pip", "install", "-e", ".[dev]"])


def cmd_run() -> None:
    """Start the dev server with auto-reload."""
    run(
        [
            str(venv_python()),
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
            "--reload",
        ]
    )


def cmd_serve() -> None:
    """Start the server without auto-reload (demo mode)."""
    run(
        [
            str(venv_python()),
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
        ]
    )


def cmd_secure() -> None:
    """Start the server with auth enabled and a generated demo secret."""
    env = os.environ.copy()
    env["AUTH_ENABLED"] = "true"
    if not env.get("JWT_SECRET") or env["JWT_SECRET"] == "dev-only-change-me":
        env["JWT_SECRET"] = secrets.token_urlsafe(48)
        print("Generated an ephemeral JWT_SECRET for this process.")
    print("Demo users: python tasks.py users")
    print("Auth: POST /api/auth/login, then Authorization: Bearer <accessToken>")
    run(
        [
            str(venv_python()),
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
        ],
        env=env,
    )


def cmd_users() -> None:
    """List the seeded fictional demo accounts and credentials."""
    from app.security.users import DEMO_CREDENTIALS, DEMO_PASSWORD, DEMO_STEP_UP_PIN

    print(f"Password: {DEMO_PASSWORD}    Step-up PIN: {DEMO_STEP_UP_PIN}")
    for username, (user_id, display_name, role) in DEMO_CREDENTIALS.items():
        print(f"{username:20} {user_id}  {role.value:20} {display_name}")


def cmd_test() -> None:
    """Run the test suite."""
    run([str(venv_python()), "-m", "pytest"])


def cmd_lint() -> None:
    """Check style and common mistakes."""
    run([str(venv_python()), "-m", "ruff", "check", "."])


def cmd_format() -> None:
    """Format the code and apply safe lint fixes."""
    run([str(venv_python()), "-m", "ruff", "format", "."])
    run([str(venv_python()), "-m", "ruff", "check", "--fix", "."])


def cmd_typecheck() -> None:
    """Run mypy in strict mode."""
    run([str(venv_python()), "-m", "mypy", "app", "tests", "tasks.py"])


def cmd_check() -> None:
    """Run lint, typecheck and tests in sequence."""
    cmd_lint()
    cmd_typecheck()
    cmd_test()


COMMANDS = {
    "venv": cmd_venv,
    "install": cmd_install,
    "run": cmd_run,
    "serve": cmd_serve,
    "secure": cmd_secure,
    "users": cmd_users,
    "test": cmd_test,
    "lint": cmd_lint,
    "format": cmd_format,
    "typecheck": cmd_typecheck,
    "check": cmd_check,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="AirOps DSS backend tasks")
    parser.add_argument("command", choices=sorted(COMMANDS))
    args = parser.parse_args()
    COMMANDS[args.command]()


if __name__ == "__main__":
    main()
