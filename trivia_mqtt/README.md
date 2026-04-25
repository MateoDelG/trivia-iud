# TriviaMQTT (v1)

Primera base funcional de TriviaMQTT enfocada en comunicacion MQTT, configuracion de partida y panel web de verificacion de controles.

## Alcance de esta version

Incluye:

- Servidor FastAPI con vista `/host`
- Vista `/setup` para configurar partida y equipos
- API para listar controles y eventos
- API para guardar configuracion de partida (`/api/game-config`)
- API para probar controles (`/api/controls/{device_id}/test`)
- WebSocket en tiempo real (`/ws`)
- Integracion MQTT para `status`, `button` y comandos `led`
- Simulador de control MQTT por consola

No incluye aun:

- Preguntas
- Puntajes
- Temporizador
- Carga CSV/Excel

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
- `retroalimentacion`

Aclaraciones:

- El tiempo por pregunta **NO** va en el archivo.
- El tiempo por pregunta se configura en `/setup` al crear la partida.

Ejemplo CSV:

```csv
id,pregunta,opcion_a,opcion_b,opcion_c,opcion_d,respuesta_correcta,puntos,categoria,dificultad,retroalimentacion
1,¿Qué protocolo se usa comúnmente en IoT?,HTTP,MQTT,FTP,SMTP,B,100,IoT,Fácil,MQTT es un protocolo ligero basado en publish/subscribe.
2,¿Qué componente puede medir temperatura y humedad?,LED,DHT11,Relé,Buzzer,B,100,Sensores,Fácil,El DHT11 permite medir temperatura y humedad.
3,¿Qué placa es común para proyectos IoT?,ESP32,Motor DC,Resistencia,Protoboard,A,100,Microcontroladores,Fácil,El ESP32 integra WiFi y Bluetooth.
```
