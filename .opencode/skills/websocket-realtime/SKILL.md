---
name: websocket-realtime
description: Realtime update patterns, connection handling, and safe incremental UI updates.
---

# WebSocket Realtime

Source: https://skills.rest/skill/websocket-realtime

Use this skill when touching `/ws` flows.

- Prefer incremental updates over full re-render in clients.
- Send typed events (`type` + `data`) and keep them backward compatible.
- Reconnect clients with backoff and avoid duplicate subscriptions.
- Keep initial snapshot + incremental events consistent.
- Ensure stale/disconnected sockets are cleaned up.
