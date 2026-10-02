"""Per-user web research helpers.

The app deliberately keeps no fixed event or person catalog. Claude receives a
small, privacy-scoped profile and uses its web-search tool to find current
public opportunities. This module only builds that context and validates the
returned dates and URLs before they reach the browser.
"""

import hashlib
import json
from datetime import date, timedelta
from urllib.parse import urlparse

from .models import Database, ResearchCandidate, ResearchOpportunity, ResearchPayload


def profile_context(database: Database, today: date) -> dict:
    """Return only fields needed to personalize public opportunity searches."""
    user = database.user
    return {
        "today": today.isoformat(),
        "search_window_ends": (today + timedelta(days=90)).isoformat(),
        "student": {
            "name": user.name,
            "school": user.school,
            "major": user.major,
            "target_roles": user.target_roles,
            "location": user.location,
        },
        "known_network_context": [
            {"company": c.company, "role": c.role}
            for c in database.contacts
            if c.company or c.role
        ][:12],
        "open_connection_types": [task.type for task in database.tasks if task.status == "open"],
    }


def search_queries(context: dict) -> list[str]:
    """Human-readable queries used by the web-search prompt and debugging."""
    student = context["student"]
    roles = ", ".join(student["target_roles"])
    location = student["location"]
    school = student["school"]
    return [
        f"upcoming professional networking events for {roles} near {location} within 90 days",
        f"{school} computer science data engineering events seminars career networking within 90 days",
        f"public LinkedIn profiles and community organizers for {roles} in {location}",
    ]


def _valid_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _candidate_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except (TypeError, ValueError):
        return None


def opportunity_id(candidate: ResearchCandidate) -> str:
    key = "|".join((candidate.kind, candidate.title, candidate.source_url, candidate.starts_at or ""))
    return "r_" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def normalize_candidates(payload: ResearchPayload, today: date,
                         radar_ids: set[str]) -> list[ResearchOpportunity]:
    end = today + timedelta(days=90)
    result: list[ResearchOpportunity] = []
    seen: set[str] = set()
    for candidate in payload.candidates:
        if not _valid_url(candidate.source_url) or not _valid_url(candidate.action_url):
            continue
        if candidate.kind == "event":
            starts = _candidate_date(candidate.starts_at)
            if starts is None or not today <= starts <= end:
                continue
        key = f"{candidate.kind}|{candidate.title.casefold()}|{candidate.source_url}"
        if key in seen:
            continue
        seen.add(key)
        identifier = opportunity_id(candidate)
        result.append(ResearchOpportunity(
            **candidate.model_dump(), id=identifier, on_radar=identifier in radar_ids,
        ))
    return result[:12]


def research_fingerprint(context: dict) -> str:
    return hashlib.sha256(json.dumps(context, sort_keys=True).encode("utf-8")).hexdigest()
