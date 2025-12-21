from pathlib import Path

from dotenv import load_dotenv

# Project root (two levels above this file: core/settings -> core -> project_root)
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Load .env files from project root if present (priority: .env, .env.development, .env.production)
for env_file in (
    PROJECT_ROOT / ".env",
    PROJECT_ROOT / ".env.development",
    PROJECT_ROOT / ".env.production",
):
    if env_file.exists():
        load_dotenv(env_file)

from .aws_config import *  # noqa: F401,F403,E402

# Export the composed settings by importing modules
from .base import *  # noqa: F401,F403,E402
from .databases import *  # noqa: F401,F403,E402

# Also expose PROJECT_ROOT for other modules if needed
