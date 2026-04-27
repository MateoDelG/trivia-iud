# TriviaMQTT (v1)

Primera base funcional de TriviaMQTT enfocada en comunicacion MQTT, configuracion de partida y panel web de verificacion de controles.

## Alcance de esta version

Incluye:

- Servidor FastAPI con vista `/host`
- Vista `/setup` para configurar partida y equipos
- API para listar controles y eventos
- API para guardar configuracion de partida (`/api/game-config`)
- API de motor de juego (`/api/game/start`, `/api/game/question/start`, `/api/game/state`, validacion de respuestas)
- API para probar controles (`/api/controls/{device_id}/test`)
- WebSocket en tiempo real (`/ws`)
- Integracion MQTT para `status`, `button` y comandos `led`
- Simulador de control MQTT por consola
- Carga y validacion de preguntas CSV/XLSX
- Pantalla publica `/display`

No incluye aun:

- Exportacion de resultados
- Persistencia en base de datos
- Modo torneo y estadisticas avanzadas

## 1) Instalar dependencias

Desde `trivia_mqtt/`:

```powershell
pip install -r requirements.txt
```

## 2) Ejecutar Mosquitto local

Si ya tienes Mosquitto instalado:

```powershell
mosquitto -v
```

Debe quedar escuchando en `localhost:1883`.

## 3) Ejecutar el servidor

Desde `trivia_mqtt/`:

```powershell
uvicorn app.main:app --reload
```

Abre en navegador:

- `http://127.0.0.1:8000/setup`
- `http://127.0.0.1:8000/host`

## 3.1) Configurar partida en /setup

En `/setup`:

- Define el nombre de la partida
- Selecciona de 1 a 10 equipos
- Asigna nombre y control a cada equipo
- Usa "Probar control" para enviar `blink_fast` al control
- Guarda la configuracion

Al guardar correctamente:

- El estado pasa a `configured`
- Se envia LED `on` a cada control asignado
- `/host` muestra la partida y equipos

## 4) Ejecutar un simulador de control

En otra terminal, desde `trivia_mqtt/`:

```powershell
python tools/simulate_control.py control_01
```

El simulador publica estado cada 2 segundos y escucha comandos LED.
Si se cierra, publica `offline` automaticamente y el control desaparece del host/setup.

## 5) Probar pulsaciones

En la consola del simulador escribe:

```text
press
```

Resultado esperado:

- Se publica un evento `button_pressed`
- El evento aparece en el historial de `/host`

## 6) Probar comandos LED

En `/host`, usa los botones `on`, `off`, `blink_slow`, `blink_fast` de `control_01`.

Resultado esperado:

- El servidor publica en `trivia/controls/control_01/led`
- El simulador muestra en consola el comando LED recibido

## 7) Checklist visual (dark mode)

Antes de cerrar cambios de interfaz, verifica:

- `/setup` y `/host` usan fondo oscuro, paneles oscuros y texto con contraste alto.
- Botones muestran estados `hover`, `active` y `disabled` sin perder legibilidad.
- Inputs y selects tienen foco visible para navegacion con teclado.
- Colores semanticos se mantienen: exito `#22C55E`, error `#EF4444`, advertencia `#F59E0B`.
- Actualizaciones por WebSocket no rompen estilos ni reemplazan contenido con bloques sin clase.

## 8) Formato del archivo de preguntas

Columnas obligatorias:

- `id`
- `pregunta`
- `opcion_a`
- `opcion_b`
- `opcion_c`
- `opcion_d`
- `respuesta_correcta`
- `puntos`

Columnas opcionales:

- `categoria`
- `dificultad`
- `explicación`

Aclaraciones:

- El tiempo por pregunta **NO** va en el archivo.
- El tiempo por pregunta se configura en `/setup` al crear la partida.
- Para compatibilidad se acepta tambien `explicacion` (sin tilde) o `retroalimentacion` como alias.

Ejemplo CSV:

```csv
id,pregunta,opcion_a,opcion_b,opcion_c,opcion_d,respuesta_correcta,puntos,categoria,dificultad,explicacion
1,¿Qué protocolo se usa comúnmente en IoT?,HTTP,MQTT,FTP,SMTP,B,100,IoT,Fácil,MQTT es un protocolo ligero basado en publish/subscribe.
2,¿Qué componente puede medir temperatura y humedad?,LED,DHT11,Relé,Buzzer,B,100,Sensores,Fácil,El DHT11 permite medir temperatura y humedad.
3,¿Qué placa es común para proyectos IoT?,ESP32,Motor DC,Resistencia,Protoboard,A,100,Microcontroladores,Fácil,El ESP32 integra WiFi y Bluetooth.
```

## 9) Flujo de partida (host + display)

1. Ejecutar Mosquitto (`mosquitto -v`).
2. Ejecutar servidor desde `trivia_mqtt/`:

```powershell
uvicorn app.main:app --reload
```

3. Ejecutar simuladores en terminales separadas:

```powershell
python tools/simulate_control.py control_01
python tools/simulate_control.py control_02
python tools/simulate_control.py control_03
```

4. Abrir `http://localhost:8000/setup`.
5. Configurar equipos, cargar preguntas y definir tiempo por pregunta.
6. Abrir `http://localhost:8000/host`.
7. Abrir `http://localhost:8000/display` en otra pestaña/pantalla.
8. En `/host`, usar:
   - `Iniciar partida`
   - `Iniciar siguiente pregunta`
   - `Iniciar temporizador`
9. En un simulador, escribir `press`.
10. Verificar equipo en turno y cola de pulsaciones.
11. Marcar `correcta` o `incorrecta` desde `/host`.
12. Verificar ranking y puntajes actualizados en `/host` y `/display`.

## 10) Experiencia visual en /display (Mision 7)

- `/display` usa una interfaz tipo show con:
  - pregunta central
  - opciones A/B/C/D en tarjetas
  - temporizador grande + barra de progreso
  - ranking en vivo
  - pantalla final con equipo ganador
- Soporte de sonido preparado (si los archivos existen) en:
  - `app/static/assets/sounds/question_start.mp3`
  - `app/static/assets/sounds/button_press.mp3`
  - `app/static/assets/sounds/correct.mp3`
  - `app/static/assets/sounds/incorrect.mp3`
  - `app/static/assets/sounds/timeout.mp3`
  - `app/static/assets/sounds/game_end.mp3`
- La pantalla no falla si faltan archivos de audio; simplemente omite ese sonido.

## 11) Configuracion visual basica

En `/setup` puedes definir apariencia basica en la partida:

- `display_title`: titulo mostrado en pantalla publica
- `theme`: `dark`, `neon`, `classic`

Estos campos se guardan en `game_config.visual_config`.

## 12) Persistencia e historial

- La base de datos SQLite se crea automaticamente en:
  - `data/database/trivia.db`
- Las partidas se juegan en memoria durante la ejecucion normal.
- Cuando la partida finaliza (`game_finished`), se guarda automaticamente un snapshot completo en SQLite.
- Historial disponible en:
  - `http://localhost:8000/history`

Endpoints de historial:

- `GET /api/history/games`
- `GET /api/history/games/{game_uid}`
- `DELETE /api/history/games/{game_uid}`
- `GET /api/history/games/{game_uid}/export/full.xlsx`

La exportacion historica (`.xlsx`) se genera desde SQLite (no desde estado en memoria).
