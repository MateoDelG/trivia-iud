#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <WiFiManager.h>

#include "config.h"

// ============================================
// WiFi Manager
// ============================================
WiFiManager wm;

// ============================================
// MQTT Client
// ============================================
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

char mqttServer[40] = MQTT_SERVER;
char mqttPort[6] = "1883";

unsigned long lastMqttReconnectAttempt = 0;
unsigned long lastWifiReconnectAttempt = 0;
unsigned long lastStatusPublish = 0;

bool mqttConnected = false;
bool wifiConnected = false;

// === Status Publishing ===
#define STATUS_PUBLISH_INTERVAL_MS 3000

void publishStatus(const char* status) {
    if (!mqttConnected) return;
    
    char topic[64];
    snprintf(topic, sizeof(topic), "trivia/controls/%s/status", DEVICE_ID);
    
    StaticJsonDocument<128> doc;
    doc["device_id"] = DEVICE_ID;
    doc["status"] = status;
    
    char buffer[128];
    serializeJson(doc, buffer);
    mqttClient.publish(topic, buffer);
    Serial.print("[STATUS] Published: ");
    Serial.println(buffer);
}

// ============================================
// LED Control
// ============================================
enum LedMode { LED_OFF, LED_ON, LED_BLINK_FAST };
LedMode currentLedMode = LED_OFF;
unsigned long lastLedToggle = 0;
bool ledState = false;

void setLedMode(LedMode mode) {
    currentLedMode = mode;
    if (mode == LED_OFF) {
        digitalWrite(LED_PIN, LOW);
        ledState = false;
    } else if (mode == LED_ON) {
        digitalWrite(LED_PIN, HIGH);
        ledState = true;
    }
    // LED_BLINK_FAST se maneja en loop()
}

void handleLed() {
    unsigned long now = millis();
    
    if (currentLedMode == LED_BLINK_FAST) {
        if (now - lastLedToggle >= LED_BLINK_FAST_MS) {
            lastLedToggle = now;
            ledState = !ledState;
            digitalWrite(LED_PIN, ledState ? HIGH : LOW);
        }
    }
}

// ============================================
// Button Handling
// ============================================
volatile bool buttonPressed = false;
volatile unsigned long lastButtonPress = 0;

void IRAM_ATTR buttonISR() {
    unsigned long now = millis();
    if (now - lastButtonPress >= BUTTON_DEBOUNCE_MS) {
        lastButtonPress = now;
        buttonPressed = true;
    }
}

void handleButton() {
    if (buttonPressed) {
        buttonPressed = false;
        
        // Publicar al broker MQTT
        if (mqttConnected) {
            char topic[64];
            snprintf(topic, sizeof(topic), "trivia/controls/%s/button", DEVICE_ID);
            
            StaticJsonDocument<128> doc;
            doc["device_id"] = DEVICE_ID;
            doc["event"] = "button_pressed";
            
            char buffer[128];
            serializeJson(doc, buffer);
            
            mqttClient.publish(topic, buffer);
            Serial.print("[BUTTON] Published: ");
            Serial.println(buffer);
        }
    }
}

// ============================================
// MQTT Callbacks
// ============================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    // Convertir payload a string
    char buffer[128];
    unsigned int len = min(length, (unsigned int)(sizeof(buffer) - 1));
    memcpy(buffer, payload, len);
    buffer[len] = '\0';
    
    Serial.print("[MQTT] Message on ");
    Serial.print(topic);
    Serial.print(": ");
    Serial.println(buffer);
    
    // Parsear JSON
    StaticJsonDocument<128> doc;
    DeserializationError error = deserializeJson(doc, buffer);
    
    if (error) {
        Serial.print("[MQTT] JSON parse error: ");
        Serial.println(error.c_str());
        return;
    }
    
    // Procesar comando LED
    if (doc.containsKey("mode")) {
        String mode = doc["mode"].as<String>();
        
        if (mode == "on") {
            Serial.println("[LED] Mode: ON");
            setLedMode(LED_ON);
        } else if (mode == "off") {
            Serial.println("[LED] Mode: OFF");
            setLedMode(LED_OFF);
        } else if (mode == "blink_fast") {
            Serial.println("[LED] Mode: BLINK_FAST");
            setLedMode(LED_BLINK_FAST);
        }
    }
}

// ============================================
// MQTT Functions
// ============================================
void connectMqtt() {
    // Intentar conectar si no esta conectado
    if (!mqttClient.connected()) {
        unsigned long now = millis();
        if (now - lastMqttReconnectAttempt >= MQTT_RECONNECT_INTERVAL_MS) {
            lastMqttReconnectAttempt = now;
            
            Serial.print("[MQTT] Attempting connection to ");
            Serial.print(mqttServer);
            Serial.print(":");
            Serial.println(mqttPort);
            
            // Generar client ID unico
            char clientId[32];
            snprintf(clientId, sizeof(clientId), "esp32_%s", DEVICE_ID);
            
            // Configurar callback y conectar
            mqttClient.setCallback(mqttCallback);
            mqttClient.setServer(mqttServer, atoi(mqttPort));
            
            if (mqttClient.connect(clientId)) {
                Serial.println("[MQTT] Connected!");
                mqttConnected = true;
                
                // Suscribir al topic LED
                char ledTopic[64];
                snprintf(ledTopic, sizeof(ledTopic), "trivia/controls/%s/led", DEVICE_ID);
                mqttClient.subscribe(ledTopic);
                Serial.print("[MQTT] Subscribed to: ");
                Serial.println(ledTopic);
                
                // Publicar status online
                publishStatus("online");
            } else {
                Serial.print("[MQTT] Failed, rc=");
                Serial.println(mqttClient.state());
                mqttConnected = false;
            }
        }
    }
}

void checkMqttConnection() {
    if (mqttClient.connected()) {
        mqttClient.loop();
    } else {
        mqttConnected = false;
        connectMqtt();
    }
}

// ============================================
// WiFi Functions
// ============================================
void connectWifi() {
    if (WiFi.status() == WL_CONNECTED) {
        wifiConnected = true;
        return;
    }
    
    unsigned long now = millis();
    if (now - lastWifiReconnectAttempt >= WIFI_RECONNECT_INTERVAL_MS) {
        lastWifiReconnectAttempt = now;
        
        Serial.println("[WiFi] Attempting connection...");
        
        // Configurar WiFiManager
        wm.setConfigPortalTimeout(60); // 60 seg timeout del portal
        wm.setConnectTimeout(WIFI_CONNECT_TIMEOUT_MS / 1000);
        
        // Intentar conectar con credenciales guardadas
        bool connected = wm.autoConnect(AP_NAME, AP_PASSWORD);
        
        if (connected) {
            wifiConnected = true;
            Serial.print("[WiFi] Connected! IP: ");
            Serial.println(WiFi.localIP());
        } else {
            wifiConnected = false;
            Serial.println("[WiFi] Connection failed, AP mode available");
        }
    }
}

void checkWifiConnection() {
    connectWifi();
}

// ============================================
// Startup LED Feedback
// ============================================
void startupLedFeedback() {
    Serial.println("[LED] Startup feedback...");
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(150);
        digitalWrite(LED_PIN, LOW);
        delay(150);
    }
    Serial.println("[LED] Startup feedback done");
}

// ============================================
// Setup
// ============================================
void setup() {
    Serial.begin(115200);
    Serial.println();
    Serial.println("========================================");
    Serial.println("  ESP32 Trivia Control v1.0");
    Serial.println("========================================");
    
    // Configurar pines
    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    
    // Apagar LED inicialmente
    digitalWrite(LED_PIN, LOW);
    
    // Adjuntar interrupcion para boton
    attachInterrupt(BUTTON_PIN, buttonISR, FALLING);
    
    // Feedback visual de inicio
    startupLedFeedback();
    
    // Conectar WiFi (esto iniciara portal si no hay credenciales)
    connectWifi();
    
    // Si esta conectado WiFi, conectar MQTT
    if (wifiConnected) {
        connectMqtt();
    }
}

// ============================================
// Loop
// ============================================
void loop() {
    unsigned long now = millis();
    
    // Verificar WiFi y reconectar si necesario
    checkWifiConnection();
    
    // Verificar MQTT y mantener conexion
    checkMqttConnection();
    
    // Publicar status periodicamente (cada 3 segundos)
    if (mqttConnected && now - lastStatusPublish >= STATUS_PUBLISH_INTERVAL_MS) {
        lastStatusPublish = now;
        publishStatus("online");
    }
    
    // Procesar LED
    handleLed();
    
    // Procesar boton
    handleButton();
    
    //delay(10); // Pequeno delay para estabilidad
}