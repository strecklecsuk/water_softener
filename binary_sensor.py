from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([SoftenerRegenerating(coordinator, entry)])


class SoftenerRegenerating(CoordinatorEntity, BinarySensorEntity):

    _attr_device_class = BinarySensorDeviceClass.RUNNING

    def __init__(self, coordinator, entry):
        super().__init__(coordinator)
        entry_name = entry.data.get("name") or entry.title or "Water Softener"
        self._attr_name = f"{entry_name} Regenerating"
        self._attr_unique_id = f"{entry.entry_id}_regenerating"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry_name,
        )

    @property
    def is_on(self):
        return self.coordinator.regenerating
