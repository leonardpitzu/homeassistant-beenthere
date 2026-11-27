"""Integration tests: setup, websocket API, persistence, permissions."""

from homeassistant.config_entries import ConfigEntryState
from pytest_homeassistant.common import MockConfigEntry

from custom_components.beenthere import DOMAIN


async def _setup(hass):
    entry = MockConfigEntry(domain=DOMAIN, entry_id="e1")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_subscribe_and_change(hass, hass_ws_client, hass_storage):
    await _setup(hass)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "beenthere/subscribe"})
    assert (await ws.receive_json())["success"]
    first = await ws.receive_json()
    assert first["event"]["travellers"] == {}

    await ws.send_json({"id": 2, "type": "beenthere/change", "action": "save_traveller", "name": "Ana"})
    # The subscription push and the command result can arrive in either order.
    msgs = {m.get("type"): m for m in [await ws.receive_json(), await ws.receive_json()]}
    (tid,) = msgs["result"]["result"]["travellers"]
    assert msgs["event"]["event"]["travellers"][tid]["name"] == "Ana"
    assert hass_storage[f"{DOMAIN}.e1"]["data"]["travellers"][tid]["name"] == "Ana"

    await ws.send_json({"id": 3, "type": "beenthere/change", "action": "set_visit",
                        "target_id": tid, "location": "XX", "visited": True})
    msg = await ws.receive_json()
    assert not msg["success"] and msg["error"]["code"] == "invalid_request"


async def test_non_admin_can_read_not_write(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    ws = await hass_ws_client(hass, hass_read_only_access_token)
    await ws.send_json({"id": 1, "type": "beenthere/subscribe"})
    assert (await ws.receive_json())["success"]
    await ws.receive_json()
    await ws.send_json({"id": 2, "type": "beenthere/change", "action": "save_traveller", "name": "X"})
    msg = await ws.receive_json()
    assert msg["error"]["code"] == "unauthorized"


async def test_loads_upstream_v1_storage(hass, hass_storage):
    hass_storage[f"{DOMAIN}.e1"] = {
        "version": 1, "minor_version": 1, "key": f"{DOMAIN}.e1",
        "data": {"travellers": {"t": {"name": "Old", "countries": ["FR"]}}, "groups": {}},
    }
    await _setup(hass)
    data = hass.config_entries.async_entries(DOMAIN)[0].runtime_data.data
    assert data["travellers"]["t"]["countries"] == ["FR"]
    assert data["map_settings"]["subdivision_countries"] == ["GB"]


async def test_unload(hass):
    entry = await _setup(hass)
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert entry.state is ConfigEntryState.NOT_LOADED


async def test_frontend_urls_are_versioned(hass, fake_frontend):
    await _setup(hass)
    url = fake_frontend["panel"].call_args.kwargs["module_url"]
    assert url.startswith("/beenthere/static/beenthere-panel.js?v=") and len(url.split("v=")[1]) == 10
    assert fake_frontend["extra_js"].call_args.args[1].endswith(url.split("?")[1])


async def test_sidebar_option(hass, fake_frontend):
    entry = await _setup(hass)
    assert fake_frontend["panel"].call_count == 1

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["step_id"] == "init"
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"sidebar": False})
    await hass.async_block_till_done()
    assert entry.options == {"sidebar": False}
    # Reloaded without the panel; the card and websocket API stay available.
    assert fake_frontend["panel"].call_count == 1
    assert entry.state is ConfigEntryState.LOADED

    # Switching it back on reloads the entry again, which registers the panel again.
    result = await hass.config_entries.options.async_init(entry.entry_id)
    await hass.config_entries.options.async_configure(result["flow_id"], {"sidebar": True})
    await hass.async_block_till_done()
    assert fake_frontend["panel"].call_count == 2
    assert entry.state is ConfigEntryState.LOADED
