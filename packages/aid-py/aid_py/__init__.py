# MIT License
# Copyright (c) 2025 Agent Community
# Author: Agent Community
# Repository: https://github.com/agentcommunity/agent-identity-discovery
"""Agent Identity & Discovery (AID) – Python library.

This is a **work-in-progress** implementation providing the same high-level API as the
TypeScript reference:

    from aid_py import discover, parse, AidError

    record = discover("example.com")
    # ...
"""

from __future__ import annotations

from typing import Dict, Tuple

# Re-export key API pieces from submodules
from .parser import AidError, parse, is_valid_proto  # noqa: E402
from .discover import discover  # noqa: E402

__all__ = [
    "discover",
    "parse",
    "is_valid_proto",
    "AidError",
] 