# TriviaMQTT

## Sistema interactivo de trivia con controles físicos inalámbricos, servidor Python e interfaz web en tiempo real

---

## 1. Descripción general

**TriviaMQTT** es un sistema de juego tipo trivia o concurso por equipos, inspirado en dinámicas como *¿Quién quiere ser millonario?*, en el cual varios equipos participan utilizando controles físicos inalámbricos comunicados por MQTT.

Cada control físico cuenta únicamente con:

- Un botón.
- Un LED de estado.
- Conexión WiFi.
- Comunicación MQTT.

El ordenador del presentador funciona como:

- Servidor local del juego.
- Host de la partida.
- Cliente MQTT.
- Servidor web.
- Interfaz administrativa.
- Pantalla pública para proyectar.

Desde la interfaz web, el host puede cargar preguntas desde archivos CSV o Excel, configurar equipos, descubrir controles disponibles, enlazarlos a la partida, iniciar preguntas con temporizador, registrar el orden de pulsación, validar manualmente las respuestas y llevar el puntaje en tiempo real.

---

## 2. Objetivo general

Desarrollar un sistema de trivia interactiva basado en Python y MQTT, que permita gestionar partidas con equipos físicos mediante controles inalámbricos, carga de preguntas desde archivos externos, registro de pulsaciones en tiempo real, validación manual de respuestas y visualización web para host y público.

---

## 3. Objetivos específicos

1. Diseñar una arquitectura modular para el servidor de juego en Python.
2. Implementar comunicación MQTT entre controles físicos y servidor.
3. Crear un mecanismo de descubrimiento y vinculación de controles disponibles.
4. Desarrollar un motor de juego capaz de manejar preguntas, turnos, temporizador, respuestas y puntajes.
5. Permitir la carga de bancos de preguntas desde archivos CSV y Excel.
6. Crear una interfaz web para el host de la partida.
7. Crear una pantalla pública para proyectar el juego.
8. Registrar eventos importantes durante la partida.
9. Exportar los resultados finales de cada juego.
10. Diseñar el sistema de manera escalable para futuras versiones con más modos de juego.

---

## 4. Alcance del proyecto

### 4.1. Incluido en la primera versión

La primera versión del sistema debe incluir:

- Servidor Python local.
- Broker MQTT local, preferiblemente Mosquitto.
- Soporte para 1 a 3 controles.
- Carga de preguntas desde CSV.
- Configuración de equipos.
- Descubrimiento de controles encendidos.
- Asociación de cada control a un equipo.
- Selección de preguntas en orden o aleatorias.
- Temporizador por pregunta.
- Registro del orden de pulsación.
- Validación manual de respuesta correcta o incorrecta.
- Asignación automática del turno al siguiente equipo si el primero falla.
- Puntaje por equipo.
- Vista para host.
- Vista pública para proyección.
- Historial básico de eventos.
- Exportación básica de resultados.

### 4.2. No incluido inicialmente

Para mantener controlado el primer prototipo, se recomienda dejar para futuras versiones:

- Editor interno de preguntas.
- Preguntas multimedia.
- Base de datos avanzada.
- Sistema de usuarios.
- Modo torneo.
- Estadísticas detalladas.
- Sonidos avanzados.
- Animaciones complejas.
- Aplicación móvil para equipos.

---

## 5. Arquitectura general del sistema

```text
┌──────────────────────┐
│ Control Equipo 1     │
│ ESP32 + Botón + LED  │
└──────────┬───────────┘
           │ MQTT
┌──────────▼───────────┐
│ Control Equipo 2     │
│ ESP32 + Botón + LED  │
└──────────┬───────────┘
           │ MQTT
┌──────────▼───────────┐
│ Control Equipo 3     │
│ ESP32 + Botón + LED  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Broker MQTT          │
│ Mosquitto local      │
└──────────┬───────────┘
           │
           ▼
┌─────────────────────────────┐
│ Servidor Python             │
│ FastAPI + MQTT + WebSocket  │
│ Motor de juego              │
│ Gestión de equipos          │
│ Gestión de preguntas        │
│ Registro de eventos         │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Interfaz Web                │
│ /setup                      │
│ /host                       │
│ /display                    │
└─────────────────────────────┘
```

---

## 6. Tecnologías recomendadas

### 6.1. Backend

- Python
- FastAPI
- Paho-MQTT
- WebSockets
- Pandas
- OpenPyXL
- SQLite

### 6.2. Frontend inicial

Para una primera versión simple:

- HTML
- CSS
- JavaScript
- WebSocket nativo

### 6.3. Frontend avanzado

Para una versión más profesional:

- React
- Vite
- TailwindCSS

### 6.4. Broker MQTT

- Mosquitto local

### 6.5. Microcontroladores

- ESP32
- Arduino Framework
- PlatformIO

---

## 7. Estructura de carpetas recomendada

```text
trivia_mqtt/
│
├── app/
│   ├── main.py
│   ├── config.py
│   ├── mqtt_client.py
│   ├── game_engine.py
│   ├── question_loader.py
│   ├── models.py
│   ├── database.py
│   ├── event_logger.py
│   └── websocket_manager.py
│
├── app/
│   ├── static/
│   │   ├── css/
│   │   │   ├── host.css
│   │   │   ├── display.css
│   │   │   └── setup.css
│   │   │
│   │   ├── js/
│   │   │   ├── host.js
│   │   │   ├── display.js
│   │   │   └── setup.js
│   │   │
│   │   └── assets/
│   │       ├── logo.png
│   │       └── sounds/
│   │
│   └── templates/
│       ├── setup.html
│       ├── host.html
│       └── display.html
│
├── data/
│   ├── questions/
│   ├── results/
│   └── database/
│
├── firmware/
│   ├── control_esp32/
│   │   ├── src/
│   │   │   └── main.cpp
│   │   └── platformio.ini
│
├── docs/
│   ├── protocolo_mqtt.md
│   ├── formato_preguntas.md
│   ├── flujo_juego.md
│   └── manual_usuario.md
│
├── tests/
│   ├── test_question_loader.py
│   ├── test_game_engine.py
│   └── test_mqtt_messages.py
│
├── requirements.txt
├── README.md
└── run.py
```

---

## 8. Responsabilidad de cada módulo

### 8.1. `main.py`

Archivo principal del servidor.

Responsabilidades:

- Crear la aplicación FastAPI.
- Servir las vistas web.
- Exponer endpoints HTTP.
- Iniciar el cliente MQTT.
- Iniciar el gestor WebSocket.
- Conectar todos los módulos del sistema.

Endpoints sugeridos:

```text
GET  /setup
GET  /host
GET  /display

POST /api/upload-questions
POST /api/create-game
POST /api/start-question
POST /api/mark-correct
POST /api/mark-incorrect
POST /api/skip-question
POST /api/end-game

GET  /api/game-state
GET  /api/results
```

---

### 8.2. `config.py`

Archivo de configuración general.

Ejemplo:

```python
MQTT_BROKER_HOST = "localhost"
MQTT_BROKER_PORT = 1883

DEFAULT_QUESTION_TIME = 20
DEFAULT_POINTS = 100

MAX_CONTROLS = 3

QUESTIONS_FOLDER = "data/questions"
RESULTS_FOLDER = "data/results"
DATABASE_PATH = "data/database/trivia.db"
```

---

### 8.3. `mqtt_client.py`

Maneja toda la comunicación MQTT.

Funciones principales:

- Conectarse al broker.
- Suscribirse a tópicos de controles.
- Recibir mensajes de estado.
- Recibir pulsaciones.
- Publicar comandos al LED de cada control.
- Informar al motor de juego cuando llega una pulsación.

Regla de diseño:

```text
MQTT entra y sale por este módulo.
El resto del sistema no debería hablar directamente con MQTT.
```

---

### 8.4. `game_engine.py`

Es el núcleo del proyecto.

Funciones principales:

- Crear partida.
- Agregar equipos.
- Vincular controles.
- Cargar preguntas.
- Iniciar pregunta.
- Abrir ventana de pulsaciones.
- Registrar orden de pulsación.
- Seleccionar equipo en turno.
- Validar respuesta correcta.
- Validar respuesta incorrecta.
- Pasar al siguiente equipo.
- Sumar puntos.
- Finalizar pregunta.
- Finalizar partida.

Este módulo debe controlar los estados del juego.

---

### 8.5. `question_loader.py`

Carga y valida preguntas.

Funciones principales:

- Leer archivo CSV.
- Leer archivo Excel.
- Validar columnas obligatorias.
- Convertir cada fila en una pregunta.
- Aplicar modo aleatorio.
- Aplicar filtros por categoría o dificultad en futuras versiones.

Columnas mínimas:

```text
id
pregunta
opcion_a
opcion_b
opcion_c
opcion_d
respuesta_correcta
puntos
```

Columnas opcionales:

```text
tiempo
categoria
dificultad
retroalimentacion
imagen
```

---

### 8.6. `models.py`

Define las clases principales del sistema.

Modelos sugeridos:

```text
Control
Team
Question
Game
ButtonPress
GameEvent
ScoreRecord
```

Ejemplo conceptual:

```python
class Team:
    def __init__(self, name, control_id):
        self.name = name
        self.control_id = control_id
        self.score = 0
        self.correct_answers = 0
        self.incorrect_answers = 0
```

---

### 8.7. `database.py`

Gestiona la persistencia de datos.

Primera versión:

- Guardar resultados en archivos JSON o CSV.

Versión más robusta:

- Usar SQLite.

Tablas sugeridas:

```text
games
teams
questions
answers
events
scores
```

---

### 8.8. `event_logger.py`

Registra eventos de la partida.

Ejemplos de eventos:

```text
Control conectado
Control asignado
Partida creada
Pregunta iniciada
Equipo presionó botón
Equipo respondió correctamente
Equipo respondió incorrectamente
Puntaje actualizado
Pregunta anulada
Partida finalizada
```

Este historial es útil para depuración y generación de reportes.

---

### 8.9. `websocket_manager.py`

Actualiza la interfaz web en tiempo real.

Debe enviar cambios a:

- `/host`
- `/display`

Eventos enviados por WebSocket:

```text
game_state_updated
question_started
timer_updated
button_pressed
team_selected
answer_correct
answer_incorrect
score_updated
game_finished
control_status_updated
```

---

## 9. Firmware de los controles

Cada control debe tener una lógica simple.

### 9.1. Funciones del control

El control debe:

1. Conectarse a WiFi.
2. Conectarse al broker MQTT.
3. Publicar periódicamente que está activo.
4. Detectar pulsación del botón.
5. Enviar evento de botón presionado.
6. Recibir comandos para el LED.
7. Ejecutar patrones básicos de LED.

---

## 10. Protocolo MQTT propuesto

### 10.1. Estado de los controles

Cada control publica su estado en:

```text
trivia/controls/{device_id}/status
```

Ejemplo:

```json
{
  "device_id": "control_01",
  "status": "online"
}
```

---

### 10.2. Pulsación del botón

Cada control publica su pulsación en:

```text
trivia/controls/{device_id}/button
```

Ejemplo:

```json
{
  "device_id": "control_01",
  "event": "button_pressed"
}
```

---

### 10.3. Comando para LED

El servidor publica comandos en:

```text
trivia/controls/{device_id}/led
```

Comando LED encendido:

```json
{
  "mode": "on"
}
```

Comando LED apagado:

```json
{
  "mode": "off"
}
```

Comando LED con parpadeo lento:

```json
{
  "mode": "blink_slow"
}
```

Comando LED con parpadeo rápido:

```json
{
  "mode": "blink_fast"
}
```

---

## 11. Uso del LED del control

Como solo hay un LED, se recomienda usar patrones simples.

| Estado del control | Patrón LED |
|---|---|
| Encendido pero no asignado | Parpadeo lento |
| Asignado a equipo | Encendido fijo |
| Pregunta activa | Apagado |
| Botón presionado | Parpadeo rápido |
| Equipo en turno | Encendido fijo |
| Equipo bloqueado | Apagado |
| Error de conexión | Parpadeo rápido continuo |

Para la primera versión, usar solo:

| Estado | LED |
|---|---|
| Disponible | Parpadeo lento |
| Listo/asignado | Encendido fijo |
| Ya presionó | Parpadeo rápido |
| Bloqueado | Apagado |

---

## 12. Estados del juego

El motor de juego debe manejar una máquina de estados.

```text
CONFIGURANDO
ESPERANDO_CONTROLES
PARTIDA_LISTA
MOSTRANDO_PREGUNTA
RECIBIENDO_PULSACIONES
ESPERANDO_VALIDACION
RESPUESTA_CORRECTA
RESPUESTA_INCORRECTA
PREGUNTA_FINALIZADA
PARTIDA_FINALIZADA
```

Flujo principal:

```text
CONFIGURANDO
     ↓
ESPERANDO_CONTROLES
     ↓
PARTIDA_LISTA
     ↓
MOSTRANDO_PREGUNTA
     ↓
RECIBIENDO_PULSACIONES
     ↓
ESPERANDO_VALIDACION
     ↓
RESPUESTA_CORRECTA ──────────────→ PREGUNTA_FINALIZADA
     ↓
RESPUESTA_INCORRECTA
     ↓
¿Hay otro equipo en cola?
     ↓ sí
ESPERANDO_VALIDACION
     ↓ no
PREGUNTA_FINALIZADA
     ↓
Siguiente pregunta
```

---

## 13. Flujo detallado de la partida

### 13.1. Inicio

1. El host abre `/setup`.
2. Carga archivo de preguntas.
3. El sistema valida el archivo.
4. El host selecciona modo:
   - Ordenado.
   - Aleatorio.
5. El host define:
   - Tiempo por pregunta.
   - Puntos por pregunta.
   - Número de equipos.
6. Los controles encendidos aparecen como disponibles.
7. El host asigna cada control a un equipo.
8. El host inicia la partida.

---

### 13.2. Inicio de pregunta

1. El host presiona “Iniciar pregunta”.
2. El sistema muestra la pregunta en `/display`.
3. El sistema limpia la cola de pulsaciones.
4. El sistema activa el temporizador.
5. El sistema cambia el estado a `RECIBIENDO_PULSACIONES`.
6. Los controles quedan habilitados para responder.
7. Cada pulsación se registra en orden de llegada.

---

### 13.3. Selección del equipo que responde

Cuando llega la primera pulsación válida:

1. El sistema registra el equipo.
2. El sistema lo pone como equipo en turno.
3. El sistema puede seguir registrando otras pulsaciones durante el tiempo restante o cerrar la ventana inmediatamente, según la configuración.

Recomendación:

```text
Seguir registrando pulsaciones durante el temporizador.
```

Así, si el primer equipo falla, ya existe una cola de espera.

---

### 13.4. Validación de respuesta

El host pregunta verbalmente al equipo.

Luego selecciona en la interfaz:

- Correcta.
- Incorrecta.

Si es correcta:

1. Se suman puntos.
2. Se actualiza el ranking.
3. Se muestra respuesta correcta.
4. Finaliza la pregunta.

Si es incorrecta:

1. El equipo queda bloqueado para esa pregunta.
2. El sistema toma el siguiente equipo de la cola.
3. El nuevo equipo responde.
4. Si no hay más equipos, la pregunta finaliza sin puntos.

---

### 13.5. Fin de partida

Al terminar las preguntas:

1. El sistema muestra ranking final.
2. Declara ganador.
3. Guarda resultados.
4. Permite exportar archivo CSV o Excel.

---

## 14. Formato del archivo de preguntas

### 14.1. CSV recomendado

```csv
id,pregunta,opcion_a,opcion_b,opcion_c,opcion_d,respuesta_correcta,puntos,tiempo,categoria,dificultad,retroalimentacion
1,¿Qué protocolo es común en IoT?,HTTP,MQTT,FTP,SMTP,B,100,20,IoT,Fácil,MQTT es un protocolo ligero basado en publish/subscribe.
2,¿Qué componente mide temperatura?,LED,Sensor DHT11,Relé,Buzzer,B,100,20,Sensores,Fácil,El DHT11 permite medir temperatura y humedad.
```

### 14.2. Columnas obligatorias

```text
id
pregunta
opcion_a
opcion_b
opcion_c
opcion_d
respuesta_correcta
puntos
```

### 14.3. Columnas opcionales

```text
tiempo
categoria
dificultad
retroalimentacion
imagen
```

---

## 15. Modelo de datos interno

### 15.1. Control

```text
device_id
status
last_seen
assigned_team
led_state
is_online
```

### 15.2. Equipo

```text
team_id
team_name
control_id
score
correct_answers
incorrect_answers
is_active
```

### 15.3. Pregunta

```text
question_id
text
option_a
option_b
option_c
option_d
correct_answer
points
time_limit
category
difficulty
feedback
```

### 15.4. Pulsación

```text
device_id
team_id
question_id
server_timestamp
elapsed_time
valid
```

### 15.5. Partida

```text
game_id
game_name
teams
questions
current_question_index
current_question
state
mode
started_at
finished_at
```

### 15.6. Evento

```text
event_id
game_id
timestamp
event_type
description
metadata
```

---

## 16. Interfaz web

El sistema debería tener tres vistas principales.

---

### 16.1. Vista `/setup`

Pantalla de configuración inicial.

Debe incluir:

- Nombre de la partida.
- Carga de archivo CSV o Excel.
- Vista previa de preguntas.
- Validación del archivo.
- Selección de modo:
  - Ordenado.
  - Aleatorio.
- Tiempo por defecto.
- Puntos por defecto.
- Número de equipos.
- Controles detectados.
- Asignación control-equipo.
- Botón para probar controles.
- Botón para iniciar partida.

---

### 16.2. Vista `/host`

Pantalla del moderador.

Debe incluir:

- Pregunta actual.
- Opciones de respuesta.
- Respuesta correcta visible solo para el host.
- Temporizador.
- Botones de control:
  - Iniciar pregunta.
  - Pausar.
  - Reanudar.
  - Correcta.
  - Incorrecta.
  - Saltar.
  - Repetir.
  - Anular.
  - Finalizar partida.
- Equipo en turno.
- Cola de pulsaciones.
- Ranking.
- Estado de controles.
- Historial de eventos.

---

### 16.3. Vista `/display`

Pantalla pública para proyectar.

Debe incluir:

- Nombre del juego.
- Pregunta actual.
- Opciones.
- Temporizador grande.
- Equipo que presionó primero.
- Equipo en turno.
- Resultado de la validación.
- Ranking en tiempo real.
- Pantalla final con ganador.

Esta vista no debe mostrar:

- Respuesta correcta antes de validar.
- Botones administrativos.
- Logs técnicos.
- Configuración interna.

---

## 17. Boceto de la vista del host

```text
┌────────────────────────────────────────────┐
│ TriviaMQTT - Panel del Host                │
├────────────────────────────────────────────┤
│ Pregunta actual                            │
│ ¿Qué protocolo es común en IoT?            │
│                                            │
│ A. HTTP                                    │
│ B. MQTT                                    │
│ C. FTP                                     │
│ D. SMTP                                    │
│                                            │
│ Respuesta correcta: B                      │
├────────────────────────────────────────────┤
│ Temporizador: 18 s                         │
├────────────────────────────────────────────┤
│ Equipo en turno: Equipo Azul               │
│ Cola: Azul, Rojo, Verde                    │
├────────────────────────────────────────────┤
│ [Correcta] [Incorrecta] [Saltar] [Anular] │
├────────────────────────────────────────────┤
│ Ranking                                    │
│ 1. Equipo Azul - 300 pts                   │
│ 2. Equipo Rojo - 200 pts                   │
│ 3. Equipo Verde - 100 pts                  │
├────────────────────────────────────────────┤
│ Eventos                                    │
│ 08:10: Equipo Azul presionó                │
│ 08:12: Equipo Azul respondió correcto      │
└────────────────────────────────────────────┘
```

---

## 18. Boceto de la vista pública

```text
┌────────────────────────────────────────────┐
│                TriviaMQTT                  │
├────────────────────────────────────────────┤
│ Tiempo restante: 18                        │
│ ████████████████░░░░                       │
├────────────────────────────────────────────┤
│ ¿Qué protocolo es común en IoT?            │
│                                            │
│ A. HTTP                                    │
│ B. MQTT                                    │
│ C. FTP                                     │
│ D. SMTP                                    │
├────────────────────────────────────────────┤
│ Responde: Equipo Azul                      │
├────────────────────────────────────────────┤
│ Ranking                                    │
│ Equipo Azul: 300                           │
│ Equipo Rojo: 200                           │
│ Equipo Verde: 100                          │
└────────────────────────────────────────────┘
```

---

## 19. Reglas principales del juego

### Regla 1: Solo participan controles asignados

Si un control no está asignado a un equipo, sus pulsaciones se ignoran.

### Regla 2: Solo se registran pulsaciones durante pregunta activa

Si el juego no está en estado `RECIBIENDO_PULSACIONES`, las pulsaciones se ignoran.

### Regla 3: Un equipo solo puede presionar una vez por pregunta

Si el equipo ya está en la cola, nuevas pulsaciones no cuentan.

### Regla 4: El orden lo define el servidor

El servidor registra el tiempo de llegada de cada pulsación.

No se debe depender del reloj del ESP32.

### Regla 5: Si un equipo falla, pasa el turno

Si el equipo en turno responde mal, el sistema selecciona al siguiente equipo en la cola de pulsaciones.

### Regla 6: Si nadie más presionó, la pregunta termina

No se asignan puntos.

### Regla 7: El host tiene autoridad final

El host puede:

- Corregir puntos.
- Anular pregunta.
- Repetir pregunta.
- Saltar pregunta.
- Finalizar partida.

---

## 20. Lógica del temporizador

Cada pregunta debe tener un tiempo límite.

Prioridad del tiempo:

```text
1. Tiempo definido en la pregunta.
2. Tiempo definido en la configuración de la partida.
3. Tiempo por defecto del sistema.
```

Ejemplo:

```text
Pregunta 1: 20 segundos
Pregunta 2: 30 segundos
Pregunta 3: usa tiempo por defecto
```

Cuando el tiempo llega a cero:

- Se cierra la recepción de pulsaciones.
- Si hay cola de equipos, responde el primero.
- Si no hay cola, la pregunta termina sin respuesta.

---

## 21. Registro de puntajes

Cada equipo debe tener:

```text
Nombre
Control asignado
Puntos
Respuestas correctas
Respuestas incorrectas
Número de veces que presionó
Tiempo promedio de pulsación
```

Tabla de ejemplo:

| Equipo | Control | Puntos | Correctas | Incorrectas |
|---|---|---:|---:|---:|
| Equipo Azul | control_01 | 300 | 3 | 1 |
| Equipo Rojo | control_02 | 200 | 2 | 2 |
| Equipo Verde | control_03 | 100 | 1 | 3 |

---

## 22. Historial de eventos

Ejemplo de historial:

```text
[08:10:01] Partida creada
[08:10:10] Control control_01 detectado
[08:10:15] Control control_01 asignado a Equipo Azul
[08:11:00] Pregunta 1 iniciada
[08:11:05] Equipo Azul presionó a los 5.2 s
[08:11:07] Equipo Rojo presionó a los 7.1 s
[08:11:15] Equipo Azul respondió incorrectamente
[08:11:18] Turno para Equipo Rojo
[08:11:25] Equipo Rojo respondió correctamente
[08:11:25] Equipo Rojo gana 100 puntos
```

---

## 23. Exportación de resultados

Al final de la partida se debe poder exportar:

### 23.1. Resumen por equipo

```csv
equipo,control,puntos,correctas,incorrectas
Equipo Azul,control_01,300,3,1
Equipo Rojo,control_02,200,2,2
Equipo Verde,control_03,100,1,3
```

### 23.2. Detalle por pregunta

```csv
pregunta_id,equipo,resultado,puntos,tiempo_pulsacion
1,Equipo Azul,incorrecta,0,5.2
1,Equipo Rojo,correcta,100,7.1
2,Equipo Verde,correcta,100,3.8
```

### 23.3. Historial de eventos

```csv
timestamp,tipo_evento,descripcion
08:10:01,game_created,Partida creada
08:11:05,button_pressed,Equipo Azul presionó
08:11:25,answer_correct,Equipo Rojo respondió correctamente
```

---

## 24. Plan de desarrollo por versiones

### Versión 0.1 — Prueba MQTT básica

Objetivo: comprobar comunicación entre controles y Python.

Incluye:

- Mosquitto funcionando.
- ESP32 publica botón.
- Python recibe pulsación.
- Python enciende/apaga LED.

Resultado esperado:

```text
Presiono botón → Python lo detecta → Python responde encendiendo LED
```

---

### Versión 0.2 — Descubrimiento de controles

Incluye:

- Cada control publica estado cada cierto tiempo.
- Python detecta controles activos.
- Interfaz muestra controles disponibles.
- Host asigna control a equipo.

---

### Versión 0.3 — Motor básico de juego

Incluye:

- Cargar preguntas desde CSV.
- Iniciar pregunta.
- Temporizador.
- Registrar primer equipo que presiona.
- Validar correcta o incorrecta.
- Sumar puntos.

---

### Versión 0.4 — Cola de pulsaciones

Incluye:

- Registrar todos los equipos que presionan.
- Ordenarlos por tiempo de llegada.
- Pasar al siguiente equipo si el primero falla.
- Bloquear equipos que ya respondieron mal.

---

### Versión 0.5 — Interfaz host

Incluye:

- Panel del moderador.
- Controles de partida.
- Puntajes.
- Historial.
- Estado de controles.

---

### Versión 0.6 — Pantalla pública

Incluye:

- Vista para proyección.
- Pregunta.
- Opciones.
- Temporizador.
- Equipo en turno.
- Ranking.

---

### Versión 1.0 — MVP funcional

Incluye:

- Juego completo funcional.
- Tres controles.
- Carga CSV.
- Modo ordenado o aleatorio.
- Temporizador.
- Validación manual.
- Puntajes.
- Exportación de resultados básica.

---

### Versión 1.1 — Mejoras

Incluye:

- Carga Excel.
- Sonidos.
- Animaciones.
- Logo.
- Categorías.
- Dificultad.
- Retroalimentación por pregunta.

---

### Versión 2.0 — Sistema avanzado

Incluye:

- SQLite.
- Historial de partidas.
- Editor de preguntas.
- Modo torneo.
- Estadísticas.
- Temas visuales.
- Preguntas multimedia.

---

## 25. Prioridad de desarrollo

Orden recomendado:

```text
1. Comunicación MQTT Python ↔ controles
2. Recepción de botón
3. Control del LED
4. Descubrimiento de controles
5. Estructura de equipos
6. Carga de preguntas
7. Motor de juego
8. Cola de pulsaciones
9. Puntajes
10. Interfaz host
11. Pantalla pública
12. Exportación de resultados
```

---

## 26. MVP mínimo funcional

El MVP más pequeño que ya sería útil tendría:

```text
Un servidor Python
Un broker MQTT local
Tres controles ESP32
Una interfaz web simple
Carga CSV
Asignación control-equipo
Una pregunta en pantalla
Temporizador
Registro del primer botón
Botón de correcta/incorrecta
Puntaje acumulado
```

---

## 27. Decisión arquitectónica principal

La regla más importante del proyecto debe ser:

```text
Los controles no gestionan la lógica del juego.
Los controles solo envían eventos.
El servidor Python toma todas las decisiones.
```

Esto hace que el sistema sea:

- Más fácil de depurar.
- Más fácil de ampliar.
- Más confiable.
- Más fácil de mantener.
- Menos dependiente del firmware.

---

## 28. Resumen del proyecto

**TriviaMQTT** será un sistema interactivo de trivia desarrollado en Python, con controles físicos comunicados mediante MQTT. Cada control tendrá un botón y un LED, mientras que el servidor central gestionará la lógica completa del juego: carga de preguntas, equipos, temporizador, orden de pulsaciones, validación de respuestas, puntajes, historial y visualización web.

La primera versión debe enfocarse en lograr una experiencia funcional y estable, con una interfaz sencilla para el host y una pantalla pública atractiva para los participantes.
