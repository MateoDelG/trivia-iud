---
name: mqtt-iot
description: MQTT topic design, broker setup, and IoT communication troubleshooting.
---

# MQTT IoT

Source: https://skills.rest/skill/mqtt-iot

Use this skill for MQTT changes.

- Keep topic contracts stable and documented.
- Prefer clear topic hierarchy and payload schemas.
- Validate broker host/port/QoS assumptions in README and config.
- Keep device command topics separate from status/event topics.
- Add simulator checks when changing payload or topic behavior.
