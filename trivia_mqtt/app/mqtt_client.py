"""MQTT integration module.

All MQTT reads/writes stay in this module.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import paho.mqtt.client as mqtt

from app import config
from app.game_engine import game_engine
from app.models import EventRecord
from app.state import app_state
from app.websocket_manager import ws_manager


class MQTTClientService:
    def __init__(self) -> None:
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._client = mqtt.Client(client_id=config.MQTT_CLIENT_ID, protocol=mqtt.MQTTv311)
        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def start(self) -> None:
        self._client.connect(
            host=config.MQTT_BROKER_HOST,
            port=config.MQTT_BROKER_PORT,
            keepalive=config.MQTT_KEEPALIVE_SECONDS,
        )
        self._client.loop_start()

    def stop(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()

    def publish_led_command(self, device_id: str, mode: str) -> None:
        topic = config.MQTT_LED_TOPIC_TEMPLATE.format(device_id=device_id)
        payload = json.dumps({"device_id": device_id, "mode": mode})
        self._client.publish(topic, payload=payload, qos=0, retain=False)

    def _on_connect(self, client: mqtt.Client, userdata: Any, flags: Dict[str, Any], rc: int) -> None:
        if rc != 0:
            return
        client.subscribe(config.MQTT_STATUS_TOPIC)
        client.subscribe(config.MQTT_BUTTON_TOPIC)

    def _on_message(self, client: mqtt.Client, userdata: Any, msg: mqtt.MQTTMessage) -> None:
        payload = self._decode_payload(msg.payload)
        if payload is None:
            return

        topic = msg.topic
        device_id = payload.get("device_id") or self._extract_device_id(topic)
        if not device_id:
            return

        if topic.endswith("/status"):
            status = str(payload.get("status", "unknown"))
            if status.lower() == "offline":
                app_state.remove_control(device_id=device_id)
                current_game_status = app_state.game_status()
                if current_game_status in {"question_ready", "question_active", "waiting_for_answer"}:
                    teams = app_state.teams()
                    assigned_controls = {team.control_id for team in teams}
                    if device_id in assigned_controls:
                        self._notify_pause_due_disconnection(device_id)
            else:
                app_state.upsert_control_status(device_id=device_id, status=status)
            event = EventRecord(
                timestamp=datetime.now(timezone.utc),
                device_id=device_id,
                event_type="status_update",
                topic=topic,
                payload=payload,
            )
            app_state.add_event(event)
            self._notify_controls_updated()
            self._notify_event_received(event.model_dump(mode="json"))
            return

        if topic.endswith("/button"):
            app_state.mark_control_seen(device_id=device_id)
            event = game_engine.handle_button_press(device_id=device_id, topic=topic, payload=payload)
            app_state.add_event(event)
            self._notify_controls_updated()
            self._notify_button_processed(event)

    @staticmethod
    def _decode_payload(raw_payload: bytes) -> Optional[Dict[str, Any]]:
        try:
            decoded = raw_payload.decode("utf-8")
            data = json.loads(decoded)
            if isinstance(data, dict):
                return data
        except Exception:
            return None
        return None

    @staticmethod
    def _extract_device_id(topic: str) -> Optional[str]:
        parts = topic.split("/")
        if len(parts) >= 3:
            return parts[2]
        return None

    def _notify_controls_updated(self) -> None:
        if not self._loop:
            return
        controls = [control.model_dump(mode="json") for control in app_state.controls()]
        message = {"type": "controls_updated", "data": controls}
        self._loop.call_soon_threadsafe(asyncio.create_task, ws_manager.broadcast_json(message))

    def _notify_event_received(self, event_payload: Dict[str, Any]) -> None:
        if not self._loop:
            return
        message = {"type": "event_received", "data": event_payload}
        self._loop.call_soon_threadsafe(asyncio.create_task, ws_manager.broadcast_json(message))

    def _notify_button_processed(self, event: EventRecord) -> None:
        if not self._loop:
            return
        self._loop.call_soon_threadsafe(asyncio.create_task, game_engine.on_button_event_processed(event))

    def _notify_pause_due_disconnection(self, device_id: str) -> None:
        if not self._loop:
            return
        reason = f"Control desconectado durante la cuenta regresiva: {device_id}"
        self._loop.call_soon_threadsafe(
            asyncio.create_task,
            game_engine.pause_game(reason=reason, source="auto_disconnect"),
        )


mqtt_service = MQTTClientService()
