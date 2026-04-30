"""Simple MQTT control simulator for TriviaMQTT v1.

Usage:
    python tools/simulate_control.py control_01
"""

import json
import sys
import threading
import time

import paho.mqtt.client as mqtt

BROKER_HOST = "localhost"
BROKER_PORT = 1883
KEEPALIVE_SECONDS = 60


def main() -> int:
    if len(sys.argv) != 2:
        print("Uso: python tools/simulate_control.py <device_id>")
        return 1

    device_id = sys.argv[1]
    status_topic = f"trivia/controls/{device_id}/status"
    button_topic = f"trivia/controls/{device_id}/button"
    led_topic = f"trivia/controls/{device_id}/led"
    offline_payload = json.dumps({"device_id": device_id, "status": "offline"})
    online_payload = json.dumps({"device_id": device_id, "status": "online"})

    stop_event = threading.Event()
    client = mqtt.Client(client_id=f"sim_{device_id}", protocol=mqtt.MQTTv311)
    client.will_set(status_topic, payload=offline_payload, qos=1, retain=True)

    def on_connect(mqtt_client: mqtt.Client, userdata, flags, rc: int):
        if rc == 0:
            mqtt_client.subscribe(led_topic)
            print(f"Conectado a MQTT y suscrito a {led_topic}")
        else:
            print(f"Fallo de conexion MQTT. rc={rc}")

    def on_message(mqtt_client: mqtt.Client, userdata, msg: mqtt.MQTTMessage):
        try:
            data = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            data = {"raw": msg.payload.decode("utf-8", errors="replace")}
        print(f"[LED] Comando recibido en {msg.topic}: {data}")

    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(BROKER_HOST, BROKER_PORT, KEEPALIVE_SECONDS)
    client.loop_start()
    client.publish(status_topic, online_payload, qos=1, retain=True)

    def publish_status_loop() -> None:
        while not stop_event.is_set():
            client.publish(status_topic, online_payload, qos=0, retain=False)
            time.sleep(0.5)  # Publicar cada 500ms

    status_thread = threading.Thread(target=publish_status_loop, daemon=True)
    status_thread.start()

    print("Simulador listo. Escribe 'press' y Enter para enviar pulsacion.")
    print("Escribe 'exit' y Enter para salir.")
    try:
        while True:
            command = input().strip().lower()
            if command == "press":
                payload = {"device_id": device_id, "event": "button_pressed"}
                client.publish(button_topic, json.dumps(payload), qos=0, retain=False)
                print(f"[BUTTON] Pulsacion enviada en {button_topic}")
            elif command == "exit":
                break
            elif command:
                print("Comando no reconocido. Usa 'press' o 'exit'.")
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        client.publish(status_topic, offline_payload, qos=1, retain=True)
        client.loop_stop()
        client.disconnect()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
