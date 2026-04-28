#ifndef CONFIG_H
#define CONFIG_H

// cd "C:\Program Files\Mosquitto"
// .\mosquitto.exe -c mosquitto.conf
// netstat -an | findstr "1883"

// === MQTT Broker ===
// Ajusta esta IP a la de tu PC/servidor donde corre Mosquitto
#define MQTT_SERVER "192.168.1.4"
#define MQTT_PORT 1883

// === Device ID (hardcodeado) ===
#define DEVICE_ID "control_03"

// === Pines ===
// GPIO0 = BOOT pin, requiere pull-up externa o interna
// GPIO2 = LED integrado en la mayoria de ESP32 (azul)
#define BUTTON_PIN 18
#define LED_PIN 2

// === Tiempos (ms) ===
#define BUTTON_DEBOUNCE_MS 50
#define LED_BLINK_FAST_MS 200

// === WiFiManager - Portal AP (si no conecta WiFi) ===
// El AP se creara con estos datos:
#define AP_NAME "TriviaControl_01"
#define AP_PASSWORD "12345678"

// === WiFi timeouts ===
#define WIFI_CONNECT_TIMEOUT_MS 10000
#define WIFI_RECONNECT_INTERVAL_MS 5000

// === MQTT timeouts ===
#define MQTT_CONNECT_TIMEOUT_MS 5000
#define MQTT_RECONNECT_INTERVAL_MS 5000
#define MQTT_KEEPALIVE_SEC 60

#endif