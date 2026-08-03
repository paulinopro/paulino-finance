# Diseño: notificaciones de WhatsApp con OpenWA

Fecha: 2026-08-02

## Objetivo

Agregar WhatsApp como canal opcional de recordatorios de Paulino Finance mediante OpenWA, sin modificar ni degradar Telegram, Web Push o el historial interno. Cada usuario podrá registrar su número, otorgar o retirar consentimiento, probar el canal y habilitar WhatsApp independientemente para pagos de tarjetas, pagos de préstamos y gastos recurrentes.

## Alcance

Incluye:

- Una cuenta central de WhatsApp administrada por Paulino Finance.
- OpenWA como servicio independiente del backend financiero.
- Número y consentimiento explícito por usuario.
- Habilitación de WhatsApp por tipo de recordatorio.
- Pruebas independientes de WhatsApp, Telegram y Web Push.
- Aislamiento de fallos entre canales.
- Configuración y mensajes de interfaz en español, inglés y alemán.
- Pruebas automatizadas y una prueba real posterior al enlace de la sesión central.

No incluye:

- Envío por correo electrónico.
- Una sesión de WhatsApp distinta por usuario.
- Recepción o procesamiento de mensajes entrantes.
- Administración del QR o la sesión de OpenWA dentro de Paulino Finance.
- Campañas, conversaciones o mensajería manual.

## Arquitectura

OpenWA se desplegará como un servicio separado en Docker Compose usando la imagen `ghcr.io/rmyndharis/openwa:0.12.5`. La etiqueta queda fijada para evitar cambios incompatibles de `latest`. Tendrá un volumen persistente para la base de datos, claves y sesión de WhatsApp.

El panel y API de OpenWA se publicarán sólo en `127.0.0.1:2785`. El superadministrador creará y enlazará desde ese panel una única sesión central. Los usuarios normales no podrán ver ni administrar el panel, el QR, la sesión o la clave de OpenWA.

El backend se comunicará con OpenWA exclusivamente a través de un adaptador HTTP. No importará código de OpenWA ni compartirá su almacenamiento. La configuración será:

- `OPENWA_ENABLED`
- `OPENWA_BASE_URL`
- `OPENWA_API_KEY`
- `OPENWA_SESSION_ID`
- `OPENWA_REQUEST_TIMEOUT_MS`, opcional y con un valor predeterminado conservador

Dentro de Docker, `OPENWA_BASE_URL` apuntará al nombre interno del servicio. La abstracción permitirá mover OpenWA a otro host sin cambiar la lógica de notificaciones.

## Modelo de datos

Se agregarán columnas idempotentemente:

### `users`

- `whatsapp_phone VARCHAR(20) NULL`: número normalizado como dígitos internacionales, sin `+`, espacios o signos.
- `whatsapp_consent_at TIMESTAMP NULL`: momento en que el usuario aceptó recibir mensajes.
- `whatsapp_verified_at TIMESTAMP NULL`: última prueba exitosa del número actual.

### `notification_settings`

- `whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE`: preferencia independiente por tipo de recordatorio.

No se reutilizará `email_enabled`; el correo queda fuera del alcance.

Reglas:

- Guardar un número nuevo elimina `whatsapp_verified_at`.
- Retirar el consentimiento establece `whatsapp_consent_at` y `whatsapp_verified_at` en `NULL`, y deshabilita `whatsapp_enabled` para todos los tipos del usuario.
- No se puede activar `whatsapp_enabled` sin número válido, consentimiento vigente y prueba exitosa.
- La ausencia de configuración mantiene WhatsApp deshabilitado.

## Validación del número y consentimiento

La entrada aceptará un número internacional con código de país. Se eliminarán espacios, guiones y un `+` inicial, pero se rechazará cualquier otro carácter. El valor normalizado debe contener entre 8 y 15 dígitos y no puede comenzar con cero.

La interfaz mostrará un control explícito de consentimiento. El texto dejará claro que Paulino Finance enviará recordatorios financieros al número indicado mediante su cuenta central de WhatsApp.

El número completo sólo se devolverá al propietario autenticado. Los logs deberán enmascararlo y nunca incluirán claves de OpenWA.

## Adaptadores y distribución multicanal

Se introducirá un contrato interno común para proveedores externos, con un resultado explícito de éxito o error. Los proveedores iniciales serán Telegram y WhatsApp; Web Push conservará su servicio actual, pero se invocará dentro del mismo flujo aislado.

La generación de un recordatorio ocurrirá una sola vez:

1. El scheduler encuentra un vencimiento.
2. Renderiza título y mensaje.
3. Inserta la notificación en el historial interno.
4. Intenta Web Push.
5. Intenta cada canal externo habilitado.
6. Registra fallos de proveedor sin abortar los demás canales ni todo el barrido.

Los envíos se aislarán con resultados independientes. Un error o timeout de OpenWA no impedirá Telegram, Web Push, el historial interno ni los recordatorios de otros usuarios.

El mensaje canónico seguirá admitiendo el HTML usado por Telegram y el historial. El adaptador de WhatsApp convertirá las etiquetas admitidas a texto compatible: negritas a `*texto*`, saltos preservados y etiquetas restantes eliminadas. No se enviará HTML literal a WhatsApp.

OpenWA recibirá:

- `POST /api/sessions/{OPENWA_SESSION_ID}/messages/send-text`
- Cabecera `X-API-Key`
- `chatId` en la forma normalizada requerida por el motor, inicialmente `{telefono}@c.us`
- `text` ya convertido al formato de WhatsApp

Las respuestas no exitosas, timeouts y sesión no disponible se representarán como fallos del canal, no como éxito silencioso.

## API de Paulino Finance

### Perfil/configuración de WhatsApp

La API autenticada de usuario permitirá leer y actualizar:

- `whatsappPhone`
- `whatsappConsent`
- Estado derivado `whatsappVerified`

El servidor, no el cliente, establecerá las marcas de tiempo.

### Preferencias de recordatorios

`GET /notifications/settings` incluirá `whatsappEnabled` por tipo.

`POST /notifications/settings` aceptará `whatsappEnabled` y validará los prerrequisitos. Los campos existentes conservarán su semántica y valores por defecto.

### Pruebas por canal

- `POST /notifications/test/telegram`
- `POST /notifications/test/whatsapp`
- `POST /notifications/test/push`

La ruta existente `POST /notifications/test` se conservará como alias temporal de Telegram.

La prueba de WhatsApp validará configuración del servidor, número, consentimiento y disponibilidad de la sesión. Enviará un mensaje real y, si tiene éxito, establecerá `whatsapp_verified_at`. No creará un recordatorio financiero ficticio ni habilitará automáticamente ningún tipo.

Cada endpoint devolverá errores accionables y específicos: servidor no configurado, número inválido, consentimiento ausente, sesión desconectada, timeout o rechazo del proveedor.

## Interfaz

Configuración tendrá una tarjeta de WhatsApp junto a Telegram con:

- Campo de número internacional.
- Ayuda y ejemplo de formato.
- Consentimiento explícito.
- Guardado o retiro de configuración.
- Estado: no configurado, pendiente de prueba o verificado.
- Botón de prueba con estado de envío y resultado.

Cada bloque de `CARD_PAYMENT`, `LOAN_PAYMENT` y `RECURRING_EXPENSE` tendrá un interruptor `WhatsApp`, además del interruptor Telegram y los días de anticipación existentes.

El interruptor estará deshabilitado con explicación cuando falte número, consentimiento o verificación. Web Push continuará administrándose por dispositivo y conservará su prueba actual.

## Operación de OpenWA

El superadministrador realizará una sola vez:

1. Abrir el panel local de OpenWA.
2. Obtener la clave inicial o crear una clave dedicada.
3. Crear la sesión central.
4. Iniciar la sesión y enlazar el número mediante QR o código.
5. Copiar la clave y el identificador de sesión al entorno de Paulino Finance.
6. Ejecutar una prueba de WhatsApp desde una cuenta de usuario.

El volumen persistente deberá conservar la sesión tras recrear los contenedores. OpenWA tendrá `restart: unless-stopped` y healthcheck. El backend dependerá de OpenWA sólo para WhatsApp; su indisponibilidad no impedirá iniciar Paulino Finance.

## Seguridad y riesgos

- OpenWA es un gateway no oficial y no está afiliado con Meta.
- WhatsApp puede limitar o bloquear el número central. Este riesgo se documentará para operación.
- No se enviarán mensajes sin consentimiento explícito.
- La clave API sólo estará disponible en el backend y el entorno Docker.
- El panel se enlazará a loopback y no se expondrá públicamente por defecto.
- Los logs enmascararán números y secretos.
- Se aplicará timeout a cada solicitud y no habrá reintentos automáticos que puedan duplicar mensajes en esta fase.
- La aplicación enviará únicamente recordatorios transaccionales solicitados por el usuario; no campañas.

## Manejo de errores

- Una respuesta HTTP no exitosa de OpenWA se tratará como fallo.
- Un timeout se cancelará y reportará sin detener el scheduler.
- Una sesión desconectada producirá un error accionable en la prueba y un log estructurado en recordatorios.
- Un fallo de un canal no cambia las preferencias ni invalida los demás canales.
- La verificación sólo se marca después de una respuesta exitosa de envío.
- Cambiar el número obliga a probar nuevamente antes de reactivar WhatsApp.

## Estrategia de pruebas

Backend:

- Normalización, validación y enmascarado de teléfonos.
- Formateo de HTML a WhatsApp.
- Adaptador OpenWA: éxito, autenticación fallida, sesión no disponible, respuesta inválida y timeout.
- Consentimiento, cambio de número, retiro y verificación.
- Rechazo al habilitar WhatsApp sin prerrequisitos.
- Lectura y escritura de `whatsapp_enabled` sin alterar Telegram/email.
- Pruebas independientes de Telegram, WhatsApp y Web Push.
- Scheduler: envío a uno o varios canales, aislamiento de fallos y continuidad entre usuarios.

Frontend:

- Renderizado y validación de la tarjeta WhatsApp.
- Estados no configurado, pendiente y verificado.
- Activación por tipo y controles deshabilitados.
- Pruebas de cada canal y mensajes de error.
- Traducciones completas en español, inglés y alemán.

Infraestructura:

- Validación de Docker Compose.
- Healthcheck de OpenWA.
- Persistencia del volumen tras recreación.
- Smoke test del backend y frontend sin una sesión de WhatsApp.
- Prueba real de envío después de que el superadministrador enlace el número central.

## Criterios de aceptación

1. Telegram, Web Push e historial funcionan igual que antes cuando WhatsApp está deshabilitado o caído.
2. Un usuario puede registrar su número, consentir, probarlo y habilitar WhatsApp por tipo.
3. Un usuario puede retirar el consentimiento y todos sus envíos WhatsApp quedan deshabilitados.
4. Un recordatorio puede enviarse simultáneamente por Telegram y WhatsApp.
5. Cada canal puede probarse independientemente desde Configuración.
6. Un fallo de OpenWA no impide los demás canales ni el barrido de otros usuarios.
7. OpenWA conserva la sesión al recrear contenedores.
8. Ningún secreto ni número completo aparece en logs.
9. Las pruebas automatizadas y compilaciones de backend/frontend pasan.
10. La prueba real llega al número configurado después de enlazar la sesión central.
