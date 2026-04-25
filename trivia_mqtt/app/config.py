"""Central configuration for TriviaMQTT v1."""

MQTT_BROKER_HOST = "localhost"
MQTT_BROKER_PORT = 1883
MQTT_CLIENT_ID = "trivia_server"
MQTT_KEEPALIVE_SECONDS = 60

MQTT_STATUS_TOPIC = "trivia/controls/+/status"
MQTT_BUTTON_TOPIC = "trivia/controls/+/button"
MQTT_LED_TOPIC_TEMPLATE = "trivia/controls/{device_id}/led"

MAX_EVENTS = 100
CONTROL_STALE_SECONDS = 6
