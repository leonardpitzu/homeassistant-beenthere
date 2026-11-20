"""Pure-python tests for validation and mutations."""

import pytest

from custom_components.beenthere.data import apply_change, default_data, normalize


def change(data, action, **kw):
    apply_change(data, {"action": action, **kw})
    return data


def test_traveller_lifecycle():
    data = change(default_data(), "save_traveller", name="  Ana  ")
    (tid,) = data["travellers"]
    assert data["travellers"][tid] == {"name": "Ana", "countries": []}
    change(data, "set_visit", target_id=tid, location="ro", visited=True)
    change(data, "set_visit", target_id=tid, location="GB-SCT", visited=True)
    assert data["travellers"][tid]["countries"] == ["GB-SCT", "RO"]
    change(data, "set_visit", target_id=tid, location="RO", visited=False)
    assert data["travellers"][tid]["countries"] == ["GB-SCT"]
    change(data, "save_traveller", target_id=tid, name="Ana B")
    assert data["travellers"][tid]["name"] == "Ana B"


def test_group_members_and_traveller_delete():
    data = change(change(default_data(), "save_traveller", name="A"), "save_traveller", name="B")
    a, b = data["travellers"]
    change(data, "save_group", name="Both", members=[a, b, a])
    (gid,) = data["groups"]
    assert data["groups"][gid]["members"] == [a, b]
    change(data, "delete_traveller", target_id=a)
    assert data["groups"][gid]["members"] == [b]
    change(data, "delete_group", target_id=gid)
    assert data["groups"] == {}


@pytest.mark.parametrize(
    ("action", "kw"),
    [
        ("save_traveller", {"name": ""}),
        ("save_traveller", {"name": "x" * 81}),
        ("save_traveller", {"target_id": "nope", "name": "x"}),
        ("set_visit", {"target_id": "nope", "location": "RO", "visited": True}),
        ("save_group", {"name": "G", "members": ["ghost"]}),
        ("set_map_detail", {"country": "RO", "enabled": True}),
        ("explode", {}),
    ],
)
def test_rejects_bad_input(action, kw):
    with pytest.raises(ValueError):
        change(default_data(), action, **kw)


def test_unknown_location_rejected():
    data = change(default_data(), "save_traveller", name="A")
    (tid,) = data["travellers"]
    with pytest.raises(ValueError):
        change(data, "set_visit", target_id=tid, location="ZZ", visited=True)


def test_map_detail_toggle():
    data = change(default_data(), "set_map_detail", country="US", enabled=True)
    assert data["map_settings"]["subdivision_countries"] == ["GB", "US"]
    change(data, "set_map_detail", country="GB", enabled=False)
    assert data["map_settings"]["subdivision_countries"] == ["US"]


def test_normalize_keeps_valid_drops_junk():
    raw = {
        "travellers": {"a": {"name": "A", "countries": ["ro", "QQ", 5]}, "b": {"name": ""}, "c": "junk"},
        "groups": {"g": {"name": "G", "members": ["a", "b", "a"]}},
        "map_settings": {"subdivision_countries": ["US", "RO"]},
    }
    data = normalize(raw)
    assert list(data["travellers"]) == ["a"]
    assert data["travellers"]["a"]["countries"] == ["QQ", "RO"]  # bad entry skipped, unknown-but-valid kept
    assert normalize(None) == default_data()
    assert data["groups"]["g"]["members"] == ["a"]
    assert data["map_settings"]["subdivision_countries"] == ["US"]
