import os
import shutil
import uuid

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN
from .coordinator import WaterSoftenerCoordinator

PLATFORMS = ["sensor", "binary_sensor"]

_CARD_PATH = os.path.join(os.path.dirname(__file__), "frontend", "water-softener-card.js")
_WWW_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "www", "water-softener-card.js")

_CARD_VERSION = "1.2"
_CARD_URL = f"/local/water-softener-card.js?v={_CARD_VERSION}"
_CARD_URL_LEGACY = "/water_softener/water-softener-card.js"

_card_static_registered = False


def _sync_card_to_www() -> None:
    """Copy the card JS to /config/www/ so /local/ is always available at boot."""
    try:
        www_path = os.path.abspath(_WWW_PATH)
        os.makedirs(os.path.dirname(www_path), exist_ok=True)
        shutil.copy2(_CARD_PATH, www_path)
    except Exception:
        pass


def _register_static_path(hass: HomeAssistant) -> None:
    """Keep the legacy /water_softener/ URL working as a fallback."""
    global _card_static_registered
    if _card_static_registered:
        return
    try:
        hass.http.register_static_path(_CARD_URL_LEGACY, _CARD_PATH, cache_headers=False)
        _card_static_registered = True
    except Exception:
        pass


async def _ensure_lovelace_resource(hass: HomeAssistant) -> None:
    """Register the versioned Lovelace resource URL, removing any older versions.

    Using a versioned URL (?v=X.Y) forces browsers to reload the JS whenever
    the version is bumped, avoiding stale-cache issues.
    """
    store = Store(hass, 1, "lovelace_resources")
    data = await store.async_load()
    if data is None:
        data = {"items": []}

    items = data.get("items", [])

    # Already registered with the exact current versioned URL → nothing to do
    if any(item.get("url") == _CARD_URL for item in items):
        return

    # Remove ALL previous water-softener-card entries (legacy URL and old versions)
    new_items = [
        item for item in items
        if "water-softener-card" not in item.get("url", "")
    ]
    new_items.append({"id": uuid.uuid4().hex, "url": _CARD_URL, "type": "module"})
    data["items"] = new_items
    await store.async_save(data)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # 1. Always keep /config/www/water-softener-card.js up to date
    _sync_card_to_www()

    # 2. Legacy fallback so old lovelace_resources entries still load this boot
    _register_static_path(hass)

    # 3. Migrate / register the correct URL in storage (effective next boot)
    await _ensure_lovelace_resource(hass)

    coordinator = WaterSoftenerCoordinator(hass, entry)
    await coordinator.async_setup()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(coordinator.async_update_options))

    # Register manual completion service (single-sensor mode)
    async def handle_complete_regeneration(call):
        entry_id = call.data.get("entry_id")
        coord = hass.data.get(DOMAIN, {}).get(entry_id)
        if coord:
            coord.manual_complete_regeneration()

    hass.services.async_register(
        DOMAIN,
        "complete_regeneration",
        handle_complete_regeneration,
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
