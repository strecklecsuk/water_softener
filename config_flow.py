import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_ALARM,
    CONF_CAPACITY,
    CONF_INPUT_SENSOR,
    CONF_NAME,
    CONF_NOTIFY,
    CONF_NOTIFY_MSG,
    CONF_OUTPUT_SENSOR,
    CONF_REGEN_MINUTES,
    CONF_SET_REMAINING,
    DEFAULT_ALARM,
    DEFAULT_CAPACITY,
    DEFAULT_NOTIFY_MSG,
    DEFAULT_REGEN_MINUTES,
    DOMAIN,
)

_NOTIFY_EXCLUDE = {"notify", "persistent_notification", "send_message"}


def _notify_options(hass):
    """Return sorted list of available notify service IDs."""
    svcs = hass.services.async_services().get("notify", {})
    return sorted(
        f"notify.{name}"
        for name in svcs
        if name not in _NOTIFY_EXCLUDE
    )


class WaterSoftenerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for initial setup."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            title = user_input.get(CONF_NAME) or "Water Softener"
            return self.async_create_entry(title=title, data=user_input)

        notify_opts = _notify_options(self.hass)

        schema = vol.Schema(
            {
                vol.Required(CONF_NAME, default="Water Softener"): selector.TextSelector(
                    selector.TextSelectorConfig(multiline=False)
                ),
                vol.Required(CONF_INPUT_SENSOR): selector.EntitySelector(
                    selector.EntitySelectorConfig(domain="sensor")
                ),
                vol.Optional(CONF_OUTPUT_SENSOR): selector.EntitySelector(
                    selector.EntitySelectorConfig(domain="sensor")
                ),
                vol.Required(CONF_CAPACITY, default=DEFAULT_CAPACITY): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=100, max=50000, step=100, unit_of_measurement="L", mode="box"
                    )
                ),
                vol.Required(CONF_ALARM, default=DEFAULT_ALARM): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=0, max=5000, step=10, unit_of_measurement="L", mode="box"
                    )
                ),
                vol.Optional(CONF_REGEN_MINUTES, default=DEFAULT_REGEN_MINUTES): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=1, max=120, step=1, unit_of_measurement="min", mode="box"
                    )
                ),
                vol.Optional(CONF_NOTIFY): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=notify_opts,
                        custom_value=True,
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Optional(CONF_NOTIFY_MSG, default=DEFAULT_NOTIFY_MSG): selector.TextSelector(
                    selector.TextSelectorConfig(multiline=False)
                ),
            }
        )

        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return WaterSoftenerOptionsFlow()


class WaterSoftenerOptionsFlow(config_entries.OptionsFlow):
    """Options flow for recalibration and config changes."""

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        coordinator = self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id)
        current_remaining = (
            coordinator.remaining
            if coordinator
            else self.config_entry.data.get(CONF_CAPACITY, DEFAULT_CAPACITY)
        )
        current_capacity = (
            coordinator.capacity
            if coordinator
            else self.config_entry.data.get(CONF_CAPACITY, DEFAULT_CAPACITY)
        )
        current_alarm = (
            coordinator.alarm
            if coordinator
            else self.config_entry.data.get(CONF_ALARM, DEFAULT_ALARM)
        )
        current_regen = (
            coordinator.regen_minutes
            if coordinator
            else self.config_entry.data.get(CONF_REGEN_MINUTES, DEFAULT_REGEN_MINUTES)
        )
        current_notify = (
            coordinator.notify_service
            if coordinator
            else self.config_entry.data.get(CONF_NOTIFY, "")
        ) or ""
        current_notify_msg = (
            coordinator.notify_message
            if coordinator
            else self.config_entry.data.get(CONF_NOTIFY_MSG, DEFAULT_NOTIFY_MSG)
        ) or DEFAULT_NOTIFY_MSG

        notify_opts = _notify_options(self.hass)

        schema = vol.Schema(
            {
                vol.Optional(
                    CONF_SET_REMAINING,
                    description={"suggested_value": round(current_remaining)},
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=0, max=50000, step=1, unit_of_measurement="L", mode="box"
                    )
                ),
                vol.Optional(
                    CONF_CAPACITY,
                    description={"suggested_value": current_capacity},
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=100, max=50000, step=100, unit_of_measurement="L", mode="box"
                    )
                ),
                vol.Optional(
                    CONF_ALARM,
                    description={"suggested_value": current_alarm},
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=0, max=5000, step=10, unit_of_measurement="L", mode="box"
                    )
                ),
                vol.Optional(
                    CONF_REGEN_MINUTES,
                    description={"suggested_value": current_regen},
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=1, max=120, step=1, unit_of_measurement="min", mode="box"
                    )
                ),
                vol.Optional(
                    CONF_NOTIFY,
                    description={"suggested_value": current_notify},
                ): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=notify_opts,
                        custom_value=True,
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Optional(
                    CONF_NOTIFY_MSG,
                    description={"suggested_value": current_notify_msg},
                ): selector.TextSelector(
                    selector.TextSelectorConfig(multiline=False)
                ),
            }
        )

        return self.async_show_form(step_id="init", data_schema=schema)
