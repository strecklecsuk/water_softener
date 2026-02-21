import os

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .coordinator import WaterSoftenerCoordinator

PLATFORMS = ["sensor", "binary_sensor"]

_CARD_URL = "/water_softener/water-softener-card.js"
_CARD_PATH = os.path.join(os.path.dirname(__file__), "frontend", "water-softener-card.js")
_card_registered = False


def _register_card(hass: HomeAssistant) -> None:
    global _card_registered
    if _card_registered:
        return
    try:
        hass.http.register_static_path(_CARD_URL, _CARD_PATH, cache_headers=False)
        _card_registered = True
    except Exception:
        pass


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    _register_card(hass)

    coordinator = WaterSoftenerCoordinator(hass, entry)
    await coordinator.async_setup()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(coordinator.async_update_options))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
