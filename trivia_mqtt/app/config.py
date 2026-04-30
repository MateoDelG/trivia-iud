"""Central configuration for TriviaMQTT v1."""

# App server
APP_HOST = "0.0.0.0"
APP_PORT = 8014
APP_STARTUP_TIMEOUT_SECONDS = 15
OPEN_BROWSER_ON_START = True

# Local network naming
MDNS_ENABLED = True
MDNS_HOSTNAME = "trivia"

# MQTT broker/client
MQTT_BROKER_BIND_HOST = "0.0.0.0"
MQTT_BROKER_HOST = "127.0.0.1"
MQTT_BROKER_PORT = 1883
MQTT_CLIENT_ID = "trivia_server"
MQTT_KEEPALIVE_SECONDS = 1
USE_EMBEDDED_BROKER = True

MQTT_STATUS_TOPIC = "trivia/controls/+/status"
MQTT_BUTTON_TOPIC = "trivia/controls/+/button"
MQTT_HEARTBEAT_TOPIC = "trivia/controls/+/heartbeat"
MQTT_LED_TOPIC_TEMPLATE = "trivia/controls/{device_id}/led"

MAX_EVENTS = 100
CONTROL_STALE_SECONDS = 1  # Offline si sin ver por más de 1 segundo
CONTROL_HEARTBEAT_INTERVAL_MS = 100
CONTROL_DISCONNECT_TIMEOUT_MS = 500
CONTROL_HEARTBEAT_MONITOR_INTERVAL_MS = 100
