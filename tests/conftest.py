"""Shared fixtures for BeenThere tests."""

from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.setup import async_setup_component

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


@pytest.fixture(autouse=True)
async def fake_frontend(hass):
    """hass_frontend isn't installable in tests; pretend frontend/panel_custom are loaded."""
    await async_setup_component(hass, "http", {})
    await async_setup_component(hass, "websocket_api", {})
    hass.config.components.update({"frontend", "panel_custom"})
    with (
        patch("homeassistant.components.panel_custom.async_register_panel", AsyncMock()) as panel,
        patch("homeassistant.components.frontend.add_extra_js_url") as extra_js,
        patch("homeassistant.components.frontend.async_remove_panel"),
    ):
        yield {"panel": panel, "extra_js": extra_js}
