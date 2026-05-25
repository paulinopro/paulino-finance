# Diseno: Agenda Bidireccional Google/iCloud

Fecha: 2026-05-25

## Objetivo

Convertir el modulo `/agenda` en una agenda completa, independiente del Calendario financiero, con experiencia visual tipo Google Calendar/iCloud Calendar y sincronizacion bidireccional con Google Calendar e iCloud Calendar via CalDAV.

El modulo `calendar` existente se mantiene orientado a temas financieros. La Agenda sera para eventos personales/profesionales sincronizables. No debe mezclar eventos financieros automaticos con la agenda general.

## Alcance Aprobado

- Agenda separada del Calendario financiero.
- Vistas visuales Mes, Semana, Dia y Lista.
- Crear, editar, mover, redimensionar y eliminar eventos desde la UI.
- Modal/panel de detalle para eventos.
- Integracion bidireccional con Google Calendar.
- Integracion bidireccional con iCloud Calendar usando CalDAV.
- Paulino Agenda funciona como hub sincronizador.
- Conflictos: gana el cambio mas reciente.
- Al conectar proveedor, preguntar que rango importar.
- Si no hay proveedor conectado, permitir crear eventos y dejarlos pendientes de sincronizacion.
- Si Google e iCloud estan conectados, mantenerlos como espejo: evento creado o editado en un proveedor se replica al otro.

## Fuera De Alcance Inicial

- Sincronizacion de Google Tasks o Apple Reminders.
- Notas internas como entidad principal de Agenda.
- Adjuntos.
- Invitados/asistentes con RSVP completo.
- Resolucion manual de conflictos.
- Colores avanzados por calendario mas alla de una primera etiqueta visual.

La primera version se centra en eventos de calendario porque Google Calendar e iCloud Calendar comparten ese modelo de forma razonable. Tareas, notas y recordatorios de Apple/Google pertenecen a APIs distintas o modelos no equivalentes.

## Arquitectura

Paulino Agenda sera el hub local. Guardara una copia de cada evento en `agenda_items` para poder renderizar rapido, operar offline/parcialmente y reconciliar cambios entre proveedores.

Las conexiones siguen en `agenda_provider_connections`, pero deben ampliarse para sincronizacion real:

- proveedor (`GOOGLE_CALENDAR`, `ICLOUD_CALDAV`);
- cuenta conectada;
- calendario externo seleccionado;
- credenciales cifradas;
- direccion efectiva de sync;
- cursor/token de sincronizacion entrante;
- ultima sincronizacion exitosa;
- ultimo error visible para soporte/UI.

Los mapeos por proveedor viven en `agenda_item_sync_state`. Esta tabla debe evolucionar de "estado de push" a "estado de replica externa":

- `agenda_item_id`;
- `connection_id`;
- `external_uid`;
- `etag`;
- `external_updated_at`;
- `last_pulled_at`;
- `last_pushed_at`;
- `last_error`;
- estado de borrado externo/local cuando aplique.

## Modelo De Evento

`agenda_items` debe representar eventos sincronizables, no notas internas. Campos esperados:

- titulo;
- descripcion;
- ubicacion;
- inicio;
- fin;
- todo el dia;
- zona horaria cuando aplique;
- estado (`confirmed`, `tentative`, `cancelled` o equivalente interno);
- regla de recurrencia si existe;
- origen del ultimo cambio;
- timestamp del ultimo cambio local;
- timestamp externo mas reciente conocido;
- indicador de borrado/cancelacion;
- estado de sincronizacion agregado: sincronizado, pendiente, error.

El modelo actual (`EVENT`, `TASK`, `REMINDER`, `APPOINTMENT`, `NOTE`) debe migrarse hacia eventos de calendario. `APPOINTMENT` puede mapearse como evento normal. `TASK`, `REMINDER` y `NOTE` no seran entidades principales sincronizadas en esta fase.

## Flujo De Sincronizacion

La sincronizacion sera bidireccional con regla "ultima modificacion gana".

Casos:

- Creado en Paulino: se inserta en Google/iCloud conectados.
- Creado en Google: se importa a Paulino y se replica a iCloud si esta conectado.
- Creado en iCloud: se importa a Paulino y se replica a Google si esta conectado.
- Editado en cualquier lado: se compara fecha de modificacion local/externa; gana la version mas reciente.
- Eliminado en cualquier lado: se marca como eliminado/cancelado y se propaga a los otros proveedores, salvo que exista una edicion mas reciente que deba conservarse.
- Sin proveedor conectado: el evento queda pendiente y se sincroniza cuando haya conexion.

Debe existir un servicio central, por ejemplo `agendaSyncService`, que coordine:

- pull de proveedores conectados;
- merge con eventos locales;
- push a proveedores restantes;
- registro de errores por proveedor/evento;
- sincronizacion manual desde UI;
- sincronizacion periodica en backend.

## Google Calendar

El push actual se conserva y se completa con pull.

Implementacion esperada:

- OAuth existente con refresh token cifrado.
- Permiso suficiente para listar calendarios y leer/escribir eventos.
- Importacion inicial por rango elegido al conectar.
- Sincronizacion incremental usando `syncToken` cuando sea posible.
- Fallback por rango si el token expira o Google devuelve token invalido.
- Mapeo de `event.id`, `etag`, `updated`, `status`, `summary`, `description`, `location`, `start`, `end`, `recurrence`.

## iCloud CalDAV

El push actual por ICS se conserva y se completa con lectura CalDAV.

Implementacion esperada:

- Apple ID + contrasena de app cifrada.
- Seleccion de coleccion/calendario DAV.
- Importacion inicial por rango elegido al conectar.
- Polling por rango y comparacion por `etag`/`UID`/`LAST-MODIFIED` cuando exista.
- Parseo de `.ics` para `VEVENT`.
- Escritura por `PUT`/actualizacion del objeto `.ics`.
- Manejo de borrados cuando el recurso desaparece o responde 404/410.

## Experiencia De Usuario

La pantalla `/agenda` debe dejar de ser lista simple y convertirse en una agenda visual.

Se usara FullCalendar, ya disponible en el frontend, para:

- Mes;
- Semana;
- Dia;
- Lista;
- seleccion de rango/hora para crear;
- click en evento para abrir detalle;
- drag and drop;
- resize.

Controles principales:

- anterior / hoy / siguiente;
- selector de vista;
- boton "Nuevo evento";
- boton "Sincronizar ahora";
- panel de conexiones Google/iCloud;
- indicadores de estado de sincronizacion por evento.

Modal de evento:

- titulo;
- inicio;
- fin;
- todo el dia;
- descripcion;
- ubicacion;
- recurrencia basica si se soporta en la fase;
- estado de sincronizacion;
- acciones guardar/eliminar.

## Flujo De Conexion

Al conectar Google o iCloud:

1. El usuario elige calendario externo.
2. La UI pregunta rango de importacion:
   - desde hoy en adelante;
   - ultimos 12 meses y proximos 24 meses;
   - rango personalizado.
3. Se importa el rango.
4. Si el otro proveedor ya esta conectado, los eventos importados se replican tambien hacia ese proveedor.
5. La UI muestra resumen de resultado: importados, actualizados, omitidos, errores.

## Errores Y Estados

Estados visibles:

- sincronizado;
- pendiente;
- error Google;
- error iCloud;
- proveedor no conectado;
- importacion en progreso;
- sincronizacion en progreso.

Los errores deben guardarse en base para no perder diagnostico al recargar. La UI no debe bloquear toda la agenda si un proveedor falla; debe mostrar eventos locales y permitir reintentar.

## Testing Y Verificacion

Verificacion minima:

- TypeScript backend.
- TypeScript frontend.
- Crear evento sin proveedores: queda pendiente.
- Conectar Google e importar rango.
- Conectar iCloud e importar rango.
- Crear en Paulino y confirmar que aparece en Google/iCloud.
- Crear en Google y confirmar que aparece en Paulino/iCloud.
- Crear en iCloud y confirmar que aparece en Paulino/Google.
- Editar en dos lados y verificar que gana la modificacion mas reciente.
- Eliminar en un lado y verificar propagacion.
- Drag/drop y resize desde UI.
- Rango de importacion personalizado.
- Estados de error si credenciales fallan.

## Riesgos

- Google e iCloud tienen modelos de recurrencia y borrado distintos.
- iCloud CalDAV puede variar en `etag`, URLs y respuesta DAV segun cuenta/calendario.
- La sincronizacion bidireccional puede crear duplicados si no se normaliza bien `UID`/`external_uid`.
- El calendario financiero no debe contaminarse con eventos de agenda.
- Sin una cola persistente real, los jobs periodicos deben ser idempotentes y recuperables.

## Decision Final

Implementar Agenda como modulo independiente, visual y sincronizable, con Paulino como hub bidireccional entre Google Calendar e iCloud Calendar. La primera version se enfoca en eventos de calendario completos y deja fuera tareas/notas/recordatorios no equivalentes entre proveedores.
