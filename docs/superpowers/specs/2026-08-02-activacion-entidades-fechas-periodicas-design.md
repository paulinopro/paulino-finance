# Activación de entidades y fechas periódicas completas

## Objetivo

Permitir que cada usuario habilite o deshabilite sus cuentas financieras, ingresos, gastos, tarjetas de crédito, préstamos, cuentas por pagar y cuentas por cobrar sin eliminar su historial. Además, mostrar en Ingresos y Gastos la fecha completa correspondiente al período consultado en vez de mostrar solamente el día de una recurrencia mensual.

## Alcance funcional

Las siete entidades incorporarán un estado independiente `Activo/Inactivo`:

- cuentas financieras (`bank_accounts`);
- ingresos (`income`);
- gastos (`expenses`);
- tarjetas de crédito (`credit_cards`);
- préstamos (`loans`);
- cuentas por pagar (`accounts_payable`);
- cuentas por cobrar (`accounts_receivable`).

Todos los registros existentes y nuevos estarán activos de forma predeterminada. Deshabilitar un registro no lo elimina, no modifica sus pagos o cobros históricos y no revierte movimientos ni saldos bancarios ya contabilizados.

## Persistencia y API

Cada tabla tendrá una columna `is_active BOOLEAN NOT NULL DEFAULT TRUE`, agregada mediante las migraciones idempotentes de `createTables()`. Este campo no sustituirá estados de negocio como pagado, recibido, pendiente o préstamo saldado.

Cada recurso expondrá `PATCH /:id/active-status` y aceptará únicamente:

```json
{ "isActive": false }
```

El endpoint autenticará al usuario, validará que `isActive` sea booleano, limitará la actualización a un registro propiedad del usuario y responderá `404` cuando el registro no exista para ese usuario. La respuesta incluirá el identificador y el nuevo estado.

Los endpoints de listado y detalle incluirán `isActive` en su representación pública. Las operaciones de creación no necesitarán recibir el campo: todo registro nuevo comenzará activo.

## Comportamiento de registros inactivos

Los registros inactivos permanecerán visibles en su módulo para que puedan consultarse, editarse, eliminarse o reactivarse. No participarán en:

- totales, indicadores y contadores financieros;
- Dashboard y salud financiera;
- calendario financiero;
- proyecciones;
- reportes;
- generación o envío de notificaciones.

La exclusión se aplicará en el backend para que sea consistente para todos los clientes. Los listados conservarán activos e inactivos, pero las consultas agregadas usarán solamente filas activas.

Mientras un registro esté inactivo, el backend rechazará nuevas acciones financieras sobre él. Esto incluye transferencias o ajustes desde cuentas financieras inactivas, pagos de tarjetas o préstamos inactivos, cambios de pagado/recibido en ingresos y gastos inactivos, y nuevos pagos o cobros en cuentas por pagar/cobrar inactivas. La respuesta será `409 Conflict` con un mensaje de dominio claro. Editar datos descriptivos, eliminar y reactivar continuará permitido.

Cuando una cuenta por pagar o por cobrar se deshabilite, sus registros derivados de pagos o cobros anteriores en `expenses` o `income` conservarán su estado e impacto histórico. La activación del registro principal no se propagará retroactivamente a esas filas derivadas.

## Interfaz

Cada tabla o tarjeta mostrará una insignia localizada `Activo` o `Inactivo`. Los registros inactivos tendrán un tratamiento visual atenuado que mantenga legible toda la información. Junto a las acciones actuales se agregará un botón accesible para `Deshabilitar` o `Habilitar`, con icono, texto emergente y etiqueta ARIA.

Las acciones financieras no permitidas quedarán ocultas o deshabilitadas en registros inactivos. La interfaz actualizará el listado y sus resúmenes después de cambiar el estado. Los errores del endpoint se mostrarán mediante el sistema de notificaciones existente.

## Fecha completa en Ingresos y Gastos

La columna `Fecha / día` mostrará una fecha completa en formato `DD/MM/YYYY`.

Para recurrencias mensuales, el frontend combinará el día configurado con el mes y año del período consultado por la tabla. Por ejemplo:

- día 9 durante agosto de 2026: `09/08/2026`;
- día 9 durante septiembre de 2026: `09/09/2026`.

Si el día configurado supera la cantidad de días del mes, se usará el último día válido de ese mes; por ejemplo, día 31 durante febrero de 2026 se mostrará como `28/02/2026`. El cálculo usará fechas de calendario, sin conversión UTC que pueda desplazar el día.

Los registros no recurrentes seguirán mostrando su fecha real. Las recurrencias anuales conservarán la fecha anual completa configurada. Las demás frecuencias conservarán su fecha de inicio completa cuando exista. El valor usado para ordenar la columna será la misma fecha completa mostrada.

## Componentes y flujo de datos

1. `createTables()` garantiza las siete columnas con valores predeterminados compatibles con datos existentes.
2. Los controladores serializan `is_active` como `isActive` y exponen el cambio de estado.
3. Los servicios de calendario, proyecciones, reportes, Dashboard y notificaciones filtran `is_active = TRUE` en cada fuente relevante.
4. Los tipos del frontend incorporan `isActive` y las páginas llaman al endpoint de su recurso.
5. Un helper puro de fecha recibe día, mes y año del período, ajusta el fin de mes y devuelve `DD/MM/YYYY`; Ingresos y Gastos comparten ese helper.

## Manejo de errores y compatibilidad

Las migraciones serán idempotentes y no alterarán el estado de filas existentes. No se eliminarán endpoints ni campos actuales. El backend será la autoridad para impedir actividad financiera sobre inactivos, incluso si un cliente antiguo intenta ejecutarla.

Los fallos al cambiar el estado no modificarán optimistamente la fila; el estado visible se actualizará después de una respuesta exitosa. Un registro eliminado o ajeno devolverá `404`, un cuerpo inválido devolverá `400` y una operación financiera bloqueada devolverá `409`.

## Estrategia de pruebas

- Probar que la migración declare y agregue las siete columnas de forma idempotente.
- Probar cada endpoint de activación: éxito, cuerpo inválido y aislamiento por usuario.
- Probar que los listados incluyan ambos estados y que los resúmenes excluyan inactivos.
- Probar que las operaciones financieras sobre registros inactivos respondan `409` sin crear movimientos.
- Probar las consultas de Dashboard, calendario, proyecciones, reportes y notificaciones con entidades activas e inactivas.
- Probar el helper de fecha para cambio de mes/año, ceros iniciales y ajuste al último día de febrero.
- Compilar backend y frontend y ejecutar sus suites completas.

## Fuera de alcance

- Eliminación automática de registros inactivos.
- Reversión de pagos, cobros o movimientos históricos.
- Propagación retroactiva del estado a ingresos o gastos derivados.
- Activación/desactivación masiva.
- Un filtro adicional para ocultar inactivos; ambos estados permanecerán visibles en el listado.
