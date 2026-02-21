# Water Softener Manager

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![HA Version](https://img.shields.io/badge/Home%20Assistant-2024.1%2B-blue.svg)](https://www.home-assistant.io/)
[![Version](https://img.shields.io/badge/version-1.2.0-green.svg)](https://github.com/strecklecsuk/water_softener/releases)

Custom Home Assistant integration to monitor and manage a water softener (descalcificador). Tracks resin ion-exchange capacity, detects regeneration cycles automatically, estimates the next regeneration date, logs daily consumption history, and sends configurable low-level notifications.

---

## Features

- Tracks remaining resin ion-exchange capacity in liters
- Detects regeneration automatically via input/output water sensors
  - Primary path: remaining reaches 0 → immediate detection
  - Secondary path: input flow detected without output flow for X minutes → timer-based detection (requires ongoing input during the full window to avoid false positives)
- Estimates days until next regeneration based on 7-day consumption average
- Sends a configurable notification when level drops below the alarm threshold
- Manual calibration of remaining liters via Options flow
- Custom Lovelace card with animated SVG tank showing resin, salt and water zones

---

## Sensors

| Entity | Description |
|---|---|
| `sensor.softener_remaining` | Liters of ion-exchange capacity remaining |

**Attributes on `sensor.softener_remaining`:**

| Attribute | Description |
|---|---|
| `capacity_L` | Total resin capacity in liters |
| `alarm_threshold_L` | Alert threshold in liters |
| `remaining_pct` | Remaining capacity as percentage |
| `regenerating` | `true` when regeneration is in progress |
| `avg_daily_consumption_L` | Average daily consumption (last 7 archived days) |
| `days_until_regen` | Estimated days until next regeneration |
| `next_regen_estimate` | Estimated date of next regeneration (YYYY-MM-DD) |
| `last_regeneration` | ISO timestamp of last completed regeneration |

## Binary Sensors

| Entity | Description |
|---|---|
| `binary_sensor.softener_regenerating` | `on` while regeneration is in progress |

---

## Installation

### Via HACS (recommended)

1. Go to **HACS → Integrations → Custom repositories**
2. Add `https://github.com/strecklecsuk/water_softener` as an **Integration**
3. Install **Water Softener Manager**
4. Restart Home Assistant

### Manual

1. Copy the `water_softener` folder into your `custom_components` directory
2. Restart Home Assistant

---

## Configuration

Go to **Settings → Devices & Services → Add Integration → Water Softener Manager**

| Parameter | Description | Default |
|---|---|---|
| Input sensor | Water meter sensor (total liters IN) | required |
| Output sensor | Water meter sensor (total liters OUT) | optional |
| Resin capacity | Total resin capacity in liters | 4500 |
| Alarm threshold | Low level alert in liters | 200 |
| Regen detection window | Minutes of input without output to confirm regeneration | 5 |
| Notification service | `notify.xxx` service for alerts | optional |
| Notification message | Custom alert text with `{remaining}`, `{capacity}`, `{alarm}` placeholders | see below |

**Default notification message:**
```
⚠️ Descalcificador: {remaining:.0f} L restantes, revise la sal.
```

After setup, all parameters except the input sensor can be changed via **Configure** in the integration options. Remaining capacity can also be recalibrated manually from the options flow.

---

## Regeneration Detection

The integration uses two complementary paths to detect a regeneration cycle:

### Path 1 — Counter reaches zero
When `remaining` drops to exactly `0 L`, regeneration is flagged immediately.

### Path 2 — Input without output (timer-based)
When `remaining < alarm_threshold`:
1. Any input flow event starts a timer (`regen_detection_window` minutes)
2. If output flow is detected → timer is cancelled (normal usage)
3. When the timer fires, it checks that **at least one additional input event occurred after the timer started** — a single brief trigger event is not enough
4. If confirmed → regeneration is flagged

Regeneration ends when the output sensor registers flow again, resetting `remaining` to full capacity.

---

## Lovelace Card

The integration includes a custom Lovelace card with an animated SVG tank.

### Resource registration

The card JS is registered automatically when the integration loads. No manual resource setup is needed.

### Usage

```yaml
type: custom:water-softener-card
entity: sensor.softener_remaining
title: Descalcificador
```

### Card features

- **Animated SVG tank** that always appears full (a softener holds resin, not an emptying liquid)
- **Three visual zones** inside the tank:
  - Top: water/brine layer with animated wave surface
  - Center: resin column with small ion-exchange bead dots
  - Base (~20%): salt layer with large white balls
- **Color changes** by remaining capacity:

| State | Color | Chip label |
|---|---|---|
| Normal (≥ 25%) | Blue | — |
| Low (< 25%) | Orange | Regeneración Próxima |
| Critical (< 10%) | Red | Regeneración en Breve |
| Regenerating | Green | Regenerando |

- Remaining liters and percentage displayed inside the tank
- Next regeneration estimate with day name and date
- 7-day average daily consumption
- Date of last completed regeneration

---

## Changelog

### v1.2.0
- **Fix:** Timer-based regeneration detection now requires ongoing input flow during the full monitoring window — a single brief water event can no longer trigger a false regeneration
- **New:** Notification message is now fully configurable via options flow, with `{remaining}`, `{capacity}` and `{alarm}` placeholders
- **Card:** Tank always shown full — visual realism for resin-based softeners (no level drop)
- **Card:** Fixed wave animation escaping the tank bounds (clip-path applied to static parent group, not to animated children)
- **Card:** New interior design — central resin column with small inline dot circles, large white salt balls at the base
- **Card:** Status labels changed to "Regeneración en Breve" / "Regeneración Próxima"

### v1.1.1
- Fix: serve Lovelace card via `/local/` to avoid startup timing issues

### v1.1.0
- Initial public release

---

## License

MIT — see [LICENSE](LICENSE)
