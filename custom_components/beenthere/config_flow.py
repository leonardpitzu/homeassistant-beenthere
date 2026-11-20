"""Config flow for BeenThere: one entry (single_config_entry in manifest), one option."""

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback

from . import CONF_SIDEBAR, DOMAIN


class BeenThereConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title="BeenThere", data={})
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return BeenThereOptionsFlow()


class BeenThereOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input=None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        current = self.config_entry.options.get(CONF_SIDEBAR, True)
        return self.async_show_form(
            step_id="init", data_schema=vol.Schema({vol.Required(CONF_SIDEBAR, default=current): bool})
        )
