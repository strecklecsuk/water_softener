import datetime

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.const import UnitOfVolume
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([SoftenerRemaining(coordinator, entry)])


class SoftenerRemaining(CoordinatorEntity, SensorEntity):

    _attr_device_class = SensorDeviceClass.VOLUME
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = UnitOfVolume.LITERS

    def __init__(self, coordinator, entry):
        super().__init__(coordinator)
        entry_name = entry.data.get("name") or entry.title or "Water Softener"
        self._attr_name = f"{entry_name} Remaining"
        self._attr_unique_id = f"{entry.entry_id}_remaining"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry_name,
        )

    @property
    def icon(self):
        c = self.coordinator
        if c.regenerating:
            return "mdi:water-sync"
        pct = (c.remaining / c.capacity * 100) if c.capacity else 0
        if pct < 10:
            return "mdi:water-alert"
        return "mdi:water-check"

    @property
    def native_value(self):
        return round(self.coordinator.data, 1) if self.coordinator.data is not None else None

    @property
    def extra_state_attributes(self):
        c = self.coordinator
        pct = round(c.remaining / c.capacity * 100, 1) if c.capacity else 0

        attrs = {
            "capacity_L": c.capacity,
            "alarm_threshold_L": c.alarm,
            "remaining_pct": pct,
            "regenerating": c.regenerating,
            "manual_completion_pending": c.manual_completion_pending,
            "entry_id": c.entry.entry_id,
        }

        if c.last_regen_date:
            attrs["last_regeneration"] = c.last_regen_date

        avg = c.avg_daily_consumption
        if avg is not None:
            attrs["avg_daily_consumption_L"] = round(avg, 1)
            days = c.days_until_regen
            if days is not None:
                attrs["days_until_regen"] = round(days, 1)
                next_date = dt_util.now() + datetime.timedelta(days=days)
                attrs["next_regen_estimate"] = next_date.date().isoformat()

        return attrs
