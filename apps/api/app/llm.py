"""LLM proxy for the assistant. The API key lives only here (server env), never in the browser bundle.

The engine produces a grounded draft answer (numbers from live state); the LLM may only rephrase it in the
requested language. If ANTHROPIC_API_KEY is unset or the call fails, the engine draft is returned unchanged.
"""
from __future__ import annotations

import os

import anthropic

MODEL = os.environ.get("VAJRA_LLM_MODEL", "claude-opus-5")
LANG_NAMES = {"en": "English", "hi": "Hindi", "mr": "Marathi", "bn": "Bengali", "or": "Odia", "ta": "Tamil", "te": "Telugu", "kn": "Kannada"}

SYSTEM = (
    "You rephrase weather-warning answers for the public in India. Keep every number, place name, time and "
    "storm ID exactly as given in the draft. Do not add facts, forecasts or advice that are not in the draft. "
    "Answer in the requested language, in at most four short sentences, plain words, no markdown."
)

_client: anthropic.AsyncAnthropic | None = None


def enabled() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(timeout=20.0, max_retries=1)
    return _client


async def rephrase(question: str, draft: str, lang: str) -> tuple[str, str]:
    """Returns (answer, source) where source is 'llm' or 'engine'."""
    if not enabled():
        return draft, "engine"
    try:
        resp = await _get_client().beta.messages.create(
            model=MODEL,
            max_tokens=1024,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low"},
            system=SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": f"Language: {LANG_NAMES.get(lang, 'English')}\nQuestion: {question}\nDraft answer (ground truth):\n{draft}",
                }
            ],
        )
    except anthropic.RateLimitError:
        return draft, "engine"
    except anthropic.APIStatusError:
        return draft, "engine"
    except anthropic.APIConnectionError:
        return draft, "engine"
    if resp.stop_reason == "refusal":
        return draft, "engine"
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    return (text, "llm") if text else (draft, "engine")
