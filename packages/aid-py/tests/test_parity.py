# MIT License
# Copyright (c) 2025 Agent Community
# Author: Agent Community
# Repository: https://github.com/agentcommunity/agent-identity-discovery
"""Cross-language parity test (Python).
Parses the shared golden fixtures and ensures output matches expected.
"""
from __future__ import annotations

import json
from pathlib import Path

from aid_py.parser import parse

FIXTURE_PATH = Path(__file__).parents[3] / "test-fixtures" / "golden.json"
_fixture = json.loads(FIXTURE_PATH.read_text())


def test_parity():
    for rec in _fixture["records"]:
        parsed = parse(rec["raw"])
        # Convert TypedDict to plain dict for comparison
        assert dict(parsed) == rec["expected"]

    for rec in _fixture.get("invalid", []):
        try:
            parse(rec["raw"])
        except Exception as exc:  # noqa: BLE001
            assert getattr(exc, "error_code", None) == rec.get("errorCode")
        else:
            raise AssertionError(f'{rec["name"]}: expected parse failure')
