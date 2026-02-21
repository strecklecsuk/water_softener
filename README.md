# Water Softener Manager

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![HA Version](https://img.shields.io/badge/Home%20Assistant-2024.1%2B-blue.svg)](https://www.home-assistant.io/)

Custom Home Assistant integration to monitor and manage a water softener (descalcificador). Tracks resin capacity, estimates next regeneration, logs daily consumption history, and sends low-level notifications.

---

## Features

- Tracks remaining resin capacity in liters
- Detects regeneration automatically via input/output water sensors
- Estimates days until next regeneration based on 7-day consumption average
- Sends notification when level drops below configurable alarm threshold
- Manual calibration of remaining liters via Options flow
- Includes a custom Lovelace card with animated tank SVG

---

## Sensors

| Entity | Description |
|---|---|
| `sensor.softener_remaining` | Liters remaining until regeneration |

**Attributes on `sensor.softener_remaining`:**

| Attribute | Description |
|---|---|
| `capacity_L` | Total resin capacity in liters |
| `regenerating` | `true` when regeneration is in progress |
| `avg_daily_consumption_L` | Average daily consumption (last 7 days) |
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
| Output sensor | Water meter sensor (total liters OUT, optional) | — |
| Resin capacity | Total resin capacity in liters | 4500 |
| Alarm threshold | Low level alert in liters | 200 |
| Regen detection window | Minutes with no output flow to confirm regeneration | 5 |
| Notification service | `notify.xxx` service for alerts | optional |

After setup, all parameters except the input sensor can be changed via **Configure** in the integration options.

---

## Lovelace Card

The integration includes a custom card with an animated water tank.

### Resource registration

The card is registered automatically when the integration loads. No manual resource setup needed.

### Usage

```yaml
type: custom:water-softener-card
entity: sensor.softener_remaining
title: Descalcificador
```

### Card features

- Animated SVG tank with wave effect
- Color changes by level: blue (ok) / orange (low) / red (critical) / green (regenerating)
- Percentage and liters displayed inside the tank
- Next regeneration estimate with date
- Daily average consumption
- Last regeneration date

---

## License

MIT — see [LICENSE](LICENSE)
