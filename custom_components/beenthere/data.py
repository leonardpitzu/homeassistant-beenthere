"""Catalogue, validation and mutations for BeenThere data (no Home Assistant imports)."""

from __future__ import annotations

import json
import re
import uuid
from functools import cache
from pathlib import Path
from typing import Any

NAME_MAX = 80
CODE_RE = re.compile(r"^[A-Z]{2}(-[A-Z0-9]{1,3})?$")
DEFAULT_DETAIL = ["GB"]


@cache
def catalogue() -> dict[str, Any]:
    """Return geography.json plus a flat set of valid location codes."""
    raw = json.loads((Path(__file__).parent / "frontend" / "geography.json").read_text(encoding="utf-8"))
    codes = {c for group in raw["countries"].values() for c in group}
    codes |= {c for group in raw["subdivisions"].values() for c in group}
    return {**raw, "codes": frozenset(codes)}


def default_data() -> dict[str, Any]:
    return {"travellers": {}, "groups": {}, "map_settings": {"subdivision_countries": list(DEFAULT_DETAIL)}}


def _name(value: Any) -> str:
    name = value.strip() if isinstance(value, str) else ""
    if not 1 <= len(name) <= NAME_MAX:
        raise ValueError(f"Name must be 1-{NAME_MAX} characters")
    return name


def _code(value: Any, known_only: bool = True) -> str:
    code = value.strip().upper() if isinstance(value, str) else ""
    if not CODE_RE.match(code) or (known_only and code not in catalogue()["codes"]):
        raise ValueError(f"Unknown location: {value!r}")
    return code


def normalize(value: Any) -> dict[str, Any]:
    """Coerce stored data into shape, dropping malformed records but keeping old visit codes."""
    if not isinstance(value, dict):
        return default_data()
    data = default_data()
    for ident, t in (value.get("travellers") or {}).items():
        try:
            name = _name(t.get("name"))
        except (AttributeError, ValueError):
            continue
        countries = set()
        for code in t.get("countries") or []:
            try:
                countries.add(_code(code, known_only=False))
            except ValueError:
                pass
        data["travellers"][ident] = {"name": name, "countries": sorted(countries)}
    for ident, g in (value.get("groups") or {}).items():
        try:
            members = [m for m in dict.fromkeys(g.get("members", [])) if m in data["travellers"]]
            data["groups"][ident] = {"name": _name(g.get("name")), "members": members}
        except (AttributeError, TypeError, ValueError):
            continue
    detail = (value.get("map_settings") or {}).get("subdivision_countries", DEFAULT_DETAIL)
    supported = set(catalogue()["subdivision_countries"])
    data["map_settings"]["subdivision_countries"] = sorted({c for c in detail if c in supported})
    return data


def apply_change(data: dict[str, Any], msg: dict[str, Any]) -> None:
    """Apply one websocket change to data in place. Raises ValueError on bad input."""
    action, ident = msg["action"], msg.get("target_id")
    travellers, groups = data["travellers"], data["groups"]

    def existing(collection: dict) -> dict:
        if ident not in collection:
            raise ValueError("Unknown traveller or group")
        return collection[ident]

    if action == "save_traveller":
        name = _name(msg.get("name"))
        if ident is None:
            travellers[uuid.uuid4().hex] = {"name": name, "countries": []}
        else:
            existing(travellers)["name"] = name
    elif action == "delete_traveller":
        existing(travellers)
        del travellers[ident]
        for group in groups.values():
            group["members"] = [m for m in group["members"] if m != ident]
    elif action == "save_group":
        members = list(dict.fromkeys(msg.get("members", [])))
        if any(m not in travellers for m in members):
            raise ValueError("Unknown traveller")
        if ident is not None:
            existing(groups)
        groups[ident or uuid.uuid4().hex] = {"name": _name(msg.get("name")), "members": members}
    elif action == "delete_group":
        existing(groups)
        del groups[ident]
    elif action == "set_visit":
        code = _code(msg.get("location"))
        countries = set(existing(travellers)["countries"])
        if msg.get("visited"):
            countries.add(code)
        else:
            countries.discard(code)
        travellers[ident]["countries"] = sorted(countries)
    elif action == "set_map_detail":
        code = _code(msg.get("country"))
        if code not in catalogue()["subdivision_countries"]:
            raise ValueError("Regional detail is not available for this country")
        enabled = set(data["map_settings"]["subdivision_countries"])
        if msg.get("enabled"):
            enabled.add(code)
        else:
            enabled.discard(code)
        data["map_settings"]["subdivision_countries"] = sorted(enabled)
    else:
        raise ValueError(f"Unknown action: {action}")
