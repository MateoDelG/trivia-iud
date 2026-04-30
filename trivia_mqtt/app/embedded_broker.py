"""Embedded MQTT broker service using amqtt."""

from __future__ import annotations

from amqtt.broker import Broker

from app import config


class EmbeddedBrokerService:
    def __init__(self) -> None:
        self._broker: Broker | None = None

    async def start(self) -> None:
        if self._broker is not None:
            return

        broker_config = {
            "listeners": {
                "default": {
                    "type": "tcp",
                    "bind": f"{config.MQTT_BROKER_BIND_HOST}:{config.MQTT_BROKER_PORT}",
                }
            },
            "sys_interval": 60,
            "topic_check": {"enabled": False},
        }
        self._broker = Broker(broker_config)
        await self._broker.start()

    async def stop(self) -> None:
        if self._broker is None:
            return
        await self._broker.shutdown()
        self._broker = None


embedded_broker_service = EmbeddedBrokerService()
