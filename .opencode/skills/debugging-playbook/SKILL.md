---
name: debugging-playbook
description: Structured debugging checklist for API, MQTT, WebSocket, and state issues.
---

# Debugging Playbook

Source: https://skills.rest/skill/debugging-playbook

Use this skill for incident-style debugging.

- Reproduce with minimal steps and capture exact inputs.
- Verify state transitions (`idle` -> `configured`) with API snapshots.
- Confirm MQTT publish/subscribe topics and payloads end-to-end.
- Confirm WebSocket events are emitted and consumed as expected.
- Check for UI state loss on refresh and WS updates.
