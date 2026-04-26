from __future__ import annotations

import pytest

from voicecal.guardrails import reset_in_memory_rate_limiter_for_tests
from voicecal.settings import settings


@pytest.fixture(autouse=True)
def _offline_test_settings() -> None:
    """Keep tests local: in-memory tools and deterministic LLM for API contract tests."""
    settings.mock_providers = True
    settings.mock_llm = True
    reset_in_memory_rate_limiter_for_tests()
    yield
    reset_in_memory_rate_limiter_for_tests()
