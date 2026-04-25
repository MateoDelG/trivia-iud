---
name: testing-arsenal
description: Practical testing strategy for unit, integration, and end-to-end verification.
---

# Testing Arsenal

Source: https://skills.rest/skill/testing-arsenal

Use this skill before closing significant changes.

- Prefer behavior-focused tests over implementation details.
- Keep fast checks for API contract and validation edge cases.
- Add focused integration checks for MQTT + WebSocket flows.
- Verify regressions with reproducible manual scripts when tests are absent.
- Document exact verification commands in README/AGENTS when adding tooling.
