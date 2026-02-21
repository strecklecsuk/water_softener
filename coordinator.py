import logging

from homeassistant.core import callback
from homeassistant.helpers.event import async_track_state_change_event, async_call_later
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import (
    CONF_ALARM,
    CONF_CAPACITY,
    CONF_INPUT_SENSOR,
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
    STORAGE_KEY,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)


class WaterSoftenerCoordinator(DataUpdateCoordinator):

    def __init__(self, hass, entry):
        super().__init__(hass, _LOGGER, name=DOMAIN)
        self.entry = entry
        self._store = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY}_{entry.entry_id}")
        self._regen_unsub = None
        self._last_input_time = None
        self._regen_started_at = None

        self._load_config()

        # Runtime state (overwritten by stored data in async_setup)
        self.remaining = self.capacity
        self.last_input_total = None
        self.last_output_total = None
        self.regenerating = False
        self._alarm_notified = False

        # Consumption history tracking
        self._today_consumption = 0.0
        self._today_date = None
        self.consumption_history = []   # daily values, last 30 days
        self.last_regen_date = None

    def _load_config(self):
        data = self.entry.data
        opts = self.entry.options

        self.input_sensor = data[CONF_INPUT_SENSOR]
        self.output_sensor = data.get(CONF_OUTPUT_SENSOR)
        self.capacity = opts.get(CONF_CAPACITY, data.get(CONF_CAPACITY, DEFAULT_CAPACITY))
        self.alarm = opts.get(CONF_ALARM, data.get(CONF_ALARM, DEFAULT_ALARM))
        self.notify_service = opts.get(CONF_NOTIFY, data.get(CONF_NOTIFY))
        self.notify_message = opts.get(CONF_NOTIFY_MSG, data.get(CONF_NOTIFY_MSG, DEFAULT_NOTIFY_MSG)) or DEFAULT_NOTIFY_MSG
        self.regen_minutes = opts.get(
            CONF_REGEN_MINUTES, data.get(CONF_REGEN_MINUTES, DEFAULT_REGEN_MINUTES)
        )

    async def async_setup(self):
        stored = await self._store.async_load()
        if stored:
            self.remaining = stored.get("remaining", self.capacity)
            self.last_input_total = stored.get("last_input_total")
            self.last_output_total = stored.get("last_output_total")
            self.regenerating = stored.get("regenerating", False)
            self._alarm_notified = stored.get("alarm_notified", False)
            # Consumption history (backward compatible)
            self._today_consumption = stored.get("today_consumption", 0.0)
            self._today_date = stored.get("today_date")
            self.consumption_history = stored.get("consumption_history", [])
            self.last_regen_date = stored.get("last_regen_date")
            _LOGGER.debug(
                "State restored: remaining=%.0f L, regenerating=%s, history_days=%d",
                self.remaining,
                self.regenerating,
                len(self.consumption_history),
            )

        entities = [self.input_sensor]
        if self.output_sensor:
            entities.append(self.output_sensor)

        async_track_state_change_event(self.hass, entities, self._handle_state_change)
        self.async_set_updated_data(self.remaining)

    async def async_update_options(self, hass, entry):
        self._load_config()

        opts = entry.options
        if CONF_SET_REMAINING in opts and opts[CONF_SET_REMAINING] is not None:
            new_remaining = float(opts[CONF_SET_REMAINING])
            self.remaining = new_remaining
            self._alarm_notified = False
            _LOGGER.info("Remaining manually recalibrated to %.0f L", new_remaining)

        await self._async_save()
        self.async_set_updated_data(self.remaining)

    # ------------------------------------------------------------------
    # Consumption history helpers
    # ------------------------------------------------------------------

    def _track_daily_consumption(self, delta):
        """Accumulate daily consumption and archive previous day when date changes."""
        today = dt_util.now().date().isoformat()
        if self._today_date != today:
            if self._today_date is not None and self._today_consumption > 0:
                self.consumption_history.append(round(self._today_consumption, 1))
                self.consumption_history = self.consumption_history[-30:]
                _LOGGER.debug(
                    "Archived consumption for %s: %.0f L (history: %d days)",
                    self._today_date,
                    self._today_consumption,
                    len(self.consumption_history),
                )
            self._today_consumption = 0.0
            self._today_date = today
        self._today_consumption += delta

    @property
    def avg_daily_consumption(self):
        """Average daily consumption over the last 7 archived days (excluding today)."""
        history = self.consumption_history[-7:]
        if not history:
            return None
        return sum(history) / len(history)

    @property
    def days_until_regen(self):
        """Estimated days until next regeneration based on historical average."""
        avg = self.avg_daily_consumption
        if not avg or avg <= 0:
            return None
        return self.remaining / avg

    # ------------------------------------------------------------------
    # State change handlers
    # ------------------------------------------------------------------

    @callback
    def _handle_state_change(self, event):
        entity_id = event.data.get("entity_id")
        if entity_id == self.input_sensor:
            self._handle_input()
        elif entity_id == self.output_sensor:
            self._handle_output()

    def _handle_input(self):
        state = self.hass.states.get(self.input_sensor)
        if not state or state.state in ("unknown", "unavailable"):
            return

        try:
            total = float(state.state)
        except ValueError:
            return

        if self.last_input_total is None:
            self.last_input_total = total
            self.hass.async_create_task(self._async_save())
            self.async_set_updated_data(self.remaining)
            return

        delta = total - self.last_input_total
        self.last_input_total = total

        if delta <= 0:
            return

        self._last_input_time = dt_util.utcnow()

        if not self.regenerating:
            self.remaining = max(0.0, self.remaining - delta)
            self._track_daily_consumption(delta)
            self._check_alarm()

            if self.remaining == 0:
                self._enter_regenerating()
            elif self.output_sensor and self.remaining < self.alarm:
                self._start_regen_timer()

        self.hass.async_create_task(self._async_save())
        self.async_set_updated_data(self.remaining)

    def _handle_output(self):
        state = self.hass.states.get(self.output_sensor)
        if not state or state.state in ("unknown", "unavailable"):
            return

        try:
            total = float(state.state)
        except ValueError:
            return

        if self.last_output_total is None:
            self.last_output_total = total
            return

        delta = total - self.last_output_total
        self.last_output_total = total

        if delta <= 0:
            return

        self._cancel_regen_timer()

        if self.regenerating:
            self.regenerating = False
            self.remaining = float(self.capacity)
            self._alarm_notified = False
            self.last_regen_date = dt_util.now().isoformat()
            _LOGGER.info(
                "Regeneration complete. Remaining reset to %.0f L", self.capacity
            )
            self.hass.async_create_task(self._async_save())
            self.async_set_updated_data(self.remaining)

    # ------------------------------------------------------------------
    # Regeneration detection helpers
    # ------------------------------------------------------------------

    def _enter_regenerating(self):
        if not self.regenerating:
            self.regenerating = True
            _LOGGER.info(
                "Regeneration detected (remaining=%.0f L). Waiting for output to resume.",
                self.remaining,
            )

    def _start_regen_timer(self):
        if self._regen_unsub is not None:
            return
        self._regen_started_at = dt_util.utcnow()
        _LOGGER.debug(
            "Regen detection started: %.0f L remaining, waiting %s min with no output.",
            self.remaining,
            self.regen_minutes,
        )
        self._regen_unsub = async_call_later(
            self.hass, self.regen_minutes * 60, self._regen_timeout
        )

    def _cancel_regen_timer(self):
        if self._regen_unsub is not None:
            self._regen_unsub()
            self._regen_unsub = None

    @callback
    def _regen_timeout(self, _now):
        self._regen_unsub = None

        if self._last_input_time is None or self._regen_started_at is None:
            return

        # Require input to have occurred AFTER the timer started.
        # A single trigger event (that started the timer) is not enough;
        # input must be ongoing during the monitoring window.
        if self._last_input_time <= self._regen_started_at:
            _LOGGER.debug(
                "Regen timer fired but no input detected during monitoring window — ignoring."
            )
            return

        if self.remaining < self.alarm and not self.regenerating:
            self._enter_regenerating()
            self.hass.async_create_task(self._async_save())
            self.async_set_updated_data(self.remaining)

    # ------------------------------------------------------------------
    # Alarm notification
    # ------------------------------------------------------------------

    def _check_alarm(self):
        if (
            self.remaining <= self.alarm
            and not self._alarm_notified
            and self.notify_service
        ):
            self._alarm_notified = True
            svc = self.notify_service.removeprefix("notify.")
            try:
                msg = self.notify_message.format(
                    remaining=self.remaining,
                    capacity=self.capacity,
                    alarm=self.alarm,
                )
            except (KeyError, ValueError):
                msg = self.notify_message
            self.hass.async_create_task(
                self.hass.services.async_call(
                    "notify",
                    svc,
                    {"message": msg},
                )
            )

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    async def _async_save(self):
        await self._store.async_save(
            {
                "remaining": self.remaining,
                "last_input_total": self.last_input_total,
                "last_output_total": self.last_output_total,
                "regenerating": self.regenerating,
                "alarm_notified": self._alarm_notified,
                "today_consumption": self._today_consumption,
                "today_date": self._today_date,
                "consumption_history": self.consumption_history,
                "last_regen_date": self.last_regen_date,
            }
        )
