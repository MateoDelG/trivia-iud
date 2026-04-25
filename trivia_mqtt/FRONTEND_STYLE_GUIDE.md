# Frontend Style Guide (TriviaMQTT)

## Referencias visuales consultadas

- `https://midu.dev/`
- `https://porfolio.dev/`
- `https://www.infolavelada.com/`
- `https://github.com/midudev/porfolio.dev`
- `https://github.com/midudev/la-velada-web-oficial`

> Nota: se usaron solo patrones visuales (composicion, contraste, ritmo, estados, jerarquia y animacion), sin copiar marcas, logos, textos ni assets.

## Direccion de estilo aplicada

- Dark-first con contraste alto.
- Mezcla de minimalismo developer + energia de evento.
- Superficies glass/dark elevadas con glow sutil.
- Jerarquia tipografica fuerte para secciones protagonistas.
- Componentes reutilizables por clase CSS.

## Tokens visuales (design tokens)

Definidos en `app/static/css/theme.css`:

- Fondo: `--bg-main`, `--bg-secondary`, `--bg-elevated`, `--bg-card`.
- Texto: `--text-main`, `--text-soft`, `--text-muted`.
- Bordes: `--border-soft`, `--border-strong`.
- Acentos: `--accent-primary` (ambar), `--accent-secondary` (naranja), `--accent-cyan`, `--accent-pink`.
- Estados: `--accent-success`, `--accent-warning`, `--accent-error`.
- Forma: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`.
- Profundidad: `--shadow-soft`, `--shadow-card`, `--glow-cyan`, `--glow-amber`.

## Componentes UI creados/adaptados

### Navegacion flotante

- Clases: `.floating-nav`, `.floating-nav-brand`, `.floating-nav-links`, `.nav-link`.
- Comportamiento: barra sticky tipo pildora, fondo translucido con blur, estado activo por `aria-current`.

### Hero y cabeceras

- Clases: `.hero-card`, `.hero-badge`, `.gradient-text`.
- Uso: contextualizar cada pantalla (`/setup`, `/host`, `/display`) con mensaje claro y visual protagonista.

### Superficies y tarjetas

- Clases: `.panel-surface`, `.panel`, `.team-row`, `.control-item`, `.event-item`, `.team-item`, `.option-item`.
- Regla: bordes suaves + sombra profunda + fondo oscuro translúcido.

### Botones

- Variantes: base (`button`), primario (`.btn-primary` / `.primary`), secundario (`.btn-secondary`), peligro (`.btn-danger` / `.danger`).
- Estados: hover, active, disabled, focus-visible.

### Badges y estado

- Clases: `.badge`, `.hero-badge`, `.status-dot`, `.state-badge`.
- Regla: no comunicar por color solamente; mantener etiqueta textual visible.

### Popups y feedback

- Display popup: `.display-popup`, `.display-popup-content` + variantes `success|warning|error`.
- Mensajeria de formularios: `.message-success`, `.message-error`.

## Fondo y atmosfera

- Fondo global con gradientes radiales + degradado vertical.
- Overlay de ruido ligero (`.noise-overlay`) para evitar plano uniforme.
- Glow decorativo en heroes para profundidad visual.

## Tipografia y ritmo

- Stack principal: `Onest`, `Manrope`, `Segoe UI`, sans-serif.
- Titulares con `letter-spacing` negativo y `clamp` para escalado responsive.
- Parrafos con `--text-muted` para lectura jerarquizada.

## Reglas responsive

- Contenedor base: `.container` con `min(100% - 2rem, 1120px)`.
- Grids adaptativos en `setup`, `host` y `display`.
- En movil: columnas unicas para opciones, acciones y paneles densos.

## Accesibilidad aplicada

- Foco visible en controles interactivos (`outline` contrastado).
- Contraste de texto sobre fondos oscuros.
- `aria-label` en navegacion semantica por secciones.
- Respeto de `prefers-reduced-motion` para animaciones de entrada.

## Guia de uso para nuevos elementos

1. Reutilizar tokens de `theme.css`; evitar hardcodear colores nuevos sin necesidad.
2. Priorizar `panel-surface` para nuevas tarjetas.
3. Usar `btn-primary` solo en CTA principal de cada bloque.
4. Limitar glow fuerte a elementos protagonistas (timer, CTA, titulares clave).
5. Mantener consistencia visual entre `/setup`, `/host` y `/display`.
