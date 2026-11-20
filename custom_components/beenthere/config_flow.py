"""Config flow for BeenThere: one entry (single_config_entry in manifest), no options."""

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from . import DOMAIN


class BeenThereConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title="BeenThere", data={})
        return self.async_show_form(step_id="user")
