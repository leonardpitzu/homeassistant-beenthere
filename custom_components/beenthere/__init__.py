"""BeenThere: a travel map panel and card for Home Assistant."""

from __future__ import annotations

import hashlib
from copy import deepcopy
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store

from .data import apply_change, catalogue, normalize

DOMAIN = "beenthere"
STATIC_URL = f"/{DOMAIN}/static"
FRONTEND_DIR = Path(__file__).parent / "frontend"
STORAGE_VERSION = 2
UPDATED_EVENT = f"{DOMAIN}_updated"
CONF_SIDEBAR = "sidebar"

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


class _Store(Store):
    async def _async_migrate_func(self, old_major, old_minor, old_data):
        return old_data  # v1 -> v2 only added map_settings; normalize() fills it in


def _frontend_version() -> str:
    """Hash of all frontend files: busts browser caches exactly when something changed."""
    digest = hashlib.sha256()
    for path in sorted(FRONTEND_DIR.rglob("*")):
        if path.is_file():
            digest.update(path.read_bytes())
    return digest.hexdigest()[:10]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    await hass.async_add_executor_job(catalogue)  # warm the cache off the event loop
    store = _Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry.entry_id}", private=True, atomic_writes=True)
    hass.data[DOMAIN] = {"store": store, "data": normalize(await store.async_load())}

    if not hass.data.get(f"{DOMAIN}_static"):
        hass.data[f"{DOMAIN}_static"] = version = await hass.async_add_executor_job(_frontend_version)
        await hass.http.async_register_static_paths([StaticPathConfig(STATIC_URL, str(FRONTEND_DIR), True)])
        frontend.add_extra_js_url(hass, f"{STATIC_URL}/beenthere-card.js?v={version}")
        websocket_api.async_register_command(hass, ws_subscribe)
        websocket_api.async_register_command(hass, ws_change)

    # The card works on any dashboard either way; the sidebar entry is optional.
    if entry.options.get(CONF_SIDEBAR, True):
        await _register_panel(hass)
    entry.async_on_unload(entry.add_update_listener(_reload))
    return True


async def _reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def _register_panel(hass: HomeAssistant) -> None:
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="beenthere-panel",
        frontend_url_path=DOMAIN,
        sidebar_title="BeenThere",
        sidebar_icon="mdi:map-marker-check",
        module_url=f"{STATIC_URL}/beenthere-panel.js?v={hass.data[f'{DOMAIN}_static']}",
        embed_iframe=False,
        require_admin=False,
    )


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, DOMAIN, warn_if_unknown=False)
    hass.data.pop(DOMAIN, None)
    return True


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Send the data now and again after every change (works for non-admin users too)."""
    if DOMAIN not in hass.data:
        connection.send_error(msg["id"], "not_loaded", "BeenThere is not loaded.")
        return

    @callback
    def send(_event=None) -> None:
        if DOMAIN in hass.data:
            connection.send_message(websocket_api.event_message(msg["id"], hass.data[DOMAIN]["data"]))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(UPDATED_EVENT, send)
    connection.send_result(msg["id"])
    send()


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/change",
    vol.Required("action"): vol.In(
        ["save_traveller", "delete_traveller", "save_group", "delete_group", "set_visit", "set_map_detail"]
    ),
    vol.Optional("target_id"): str,
    vol.Optional("name"): str,
    vol.Optional("members"): [str],
    vol.Optional("location"): str,
    vol.Optional("country"): str,
    vol.Optional("visited"): bool,
    vol.Optional("enabled"): bool,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_change(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (runtime := hass.data.get(DOMAIN)) is None:
        connection.send_error(msg["id"], "not_loaded", "BeenThere is not loaded.")
        return
    data = deepcopy(runtime["data"])
    try:
        apply_change(data, msg)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_request", str(err))
        return
    runtime["data"] = data  # in memory first: concurrent changes build on each other
    await runtime["store"].async_save(data)
    hass.bus.async_fire(UPDATED_EVENT)
    connection.send_result(msg["id"], data)
