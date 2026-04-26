# Paulino Finance

Aplicación web para gestión financiera personal: cuentas, tarjetas, préstamos, ingresos y gastos, presupuestos, calendario, reportes, notificaciones (incl. Telegram) y PWA.

## Características principales

- Autenticación JWT, planes de suscripción (PayPal) y panel de administración
- Dashboard, reportes, flujo de caja y proyecciones
- Multi-moneda (DOP / USD), categorías de gastos editables
- Notificaciones en app, plantillas por usuario, recordatorios vía Telegram (opcional)
- Frontend responsive, PWA (service worker / Workbox en build de producción)

## Stack

| Capa | Tecnologías |
|------|-------------|
| Frontend | React 18, TypeScript, Tailwind CSS, CRACO, React Router, Axios, Recharts, Framer Motion, Workbox |
| Backend | Node.js 18, Express, TypeScript, PostgreSQL, JWT, node-cron (notificaciones programadas) |
| Infra | Docker Compose (Postgres + backend + frontend en desarrollo) |

## Requisitos

- **Node.js 18+** y **npm** (desarrollo local)
- **PostgreSQL 15+** (si no usas solo Docker para la base de datos)
- **Docker Engine** y **Docker Compose** (plugin `docker compose` o binario `docker-compose`) para el flujo con contenedores

---

## Opción A: Docker (recomendado para probar el stack completo)

Los servicios definidos en `docker-compose.yml` son: **PostgreSQL**, **backend** (API en modo `dev` con nodemon) y **frontend** (CRA + CRACO en modo desarrollo).

### 1. Instalar Docker en Ubuntu (ejemplo)

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME:-jammy}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Añade tu usuario al grupo `docker` para no usar `sudo` (cierra sesión después):

```bash
sudo usermod -aG docker "$USER"
```

Comprueba: `docker compose version` o `docker-compose version`.

### 2. Variables de entorno (Docker Compose)

En la raíz hay **`docker.env.example`** con lo que usa `docker-compose.yml` (Postgres, puertos, JWT, Telegram, variables `REACT_APP_*` del front en contenedor).

```bash
cp docker.env.example .env
```

Edita `.env` y cambia secretos. Compose lee **`.env`** en la raíz al ejecutar `docker compose`.

- El **backend** en Docker recibe `DB_HOST=postgres` desde el compose (no va en `docker.env.example`).
- Si el navegador abre el front desde otra máquina o dominio, ajusta `REACT_APP_API_URL` a la URL pública del API.

Plantillas en la raíz para desarrollo **sin** depender solo de Docker:

| Archivo | Uso |
|---------|-----|
| **`backend.env.example`** | Copiar a `backend/.env` — mismo contenido que `backend/env.example` (API completo: CORS, SMTP, PayPal, etc.). |
| **`frontend.env.example`** | Copiar a `frontend/.env` — variables `REACT_APP_*`. |
| **`docker.env.example`** | Copiar a `.env` en la raíz — solo para `docker compose`. |

### 3. Arrancar

Desde la raíz del repositorio:

```bash
docker compose up --build
```

En sistemas antiguos puede usarse `docker-compose up --build`.

La primera ejecución puede tardar: los contenedores de **frontend** y **backend** instalan dependencias en el volumen anónimo de `node_modules` si hace falta.

### 4. URLs

| Servicio | URL típica |
|----------|------------|
| Frontend | http://localhost:3000 |
| API | http://localhost:5000/api |
| Healthcheck | http://localhost:5000/health |

Postgres queda expuesto en el host en el puerto **5432** (según el `docker-compose.yml`).

### 5. Detener y datos

```bash
docker compose down
```

Los datos de Postgres persisten en el volumen `postgres_data`. Para borrarlos (por ejemplo, empezar de cero):

```bash
docker compose down -v
```

**Advertencia:** `-v` elimina volúmenes; perderás la base de datos local.

---

## Opción B: Desarrollo local en Ubuntu (sin Docker para Node)

### 1. Node.js 18+

Con **nvm** (recomendado):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# Cierra y abre la terminal, luego:
nvm install 18
nvm use 18
```

O instala el paquete `nodejs` desde NodeSource si prefieres el sistema.

### 2. PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createuser -P tu_usuario   # o usa el usuario por defecto
sudo -u postgres createdb paulino_finance -O tu_usuario
```

Anota usuario, contraseña y nombre de la base para el `.env` del backend.

### 3. Backend

Desde la raíz del repo puedes hacer `cp backend.env.example backend/.env` o, dentro de `backend/`, `cp env.example .env` (son equivalentes).

```bash
cd backend
cp env.example .env
# Edita .env: DB_HOST=localhost, DB_PORT=5432, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET, etc.
npm install
npm run dev
```

La API inicializa tablas y datos base al arrancar (`initializeDatabase`). Escucha en el puerto configurado (`PORT`, por defecto 5000).

### 4. Frontend

En otra terminal:

```bash
cd frontend
# Desde la raíz: cp frontend.env.example frontend/.env
cp env.example .env
# REACT_APP_API_URL debe apuntar al API, p. ej. http://localhost:5000/api
npm install
npm start
```

La app de desarrollo suele abrirse en http://localhost:3000.

---

## Build de producción (referencia)

- **Backend:** `cd backend && npm run build && npm start` (ejecuta `dist/index.js`). Requiere variables de entorno y Postgres accesible.
- **Frontend:** `cd frontend && npm run build` genera `build/`; sirve esa carpeta con un servidor estático o detrás de Nginx. Configura `REACT_APP_API_URL` en el momento del build para el dominio público del API.

---

## Notificaciones Telegram (opcional)

1. Crea un bot con [@BotFather](https://t.me/botfather) y copia el token.
2. Pon `TELEGRAM_BOT_TOKEN` en el `.env` del backend (o en la raíz si usas Docker).
3. Obtén tu **chat id** (por ejemplo con `getUpdates` tras escribir al bot) y configúralo en la aplicación (Configuración).

---

## Estructura del repositorio

```
paulino-finance/
├── backend.env.example   # plantilla → backend/.env
├── frontend.env.example  # plantilla → frontend/.env
├── docker.env.example    # plantilla → .env (solo Docker Compose)
├── backend/              # API Express + TypeScript
├── frontend/             # React + CRACO
├── docker-compose.yml
└── README.md
```

Documentación adicional en `docs/` (por ejemplo planes responsive / PWA).

---

## Seguridad (recordatorios)

- Cambia `JWT_SECRET` y credenciales de base de datos en producción.
- Define `CORS_ORIGIN` en el backend cuando el front esté en otro dominio.
- No expongas Postgres a internet sin firewall y contraseñas fuertes.

---

## Consola de super administrador (operación)

Rutas bajo el prefijo `/admin` (menú en `AdminLayout`), solo con usuario **super admin** (`is_super_admin` en base de datos o equivalente en JWT).

| Acción | Dónde |
|--------|--------|
| **Mantenimiento** (solo lectura para usuarios finales) | `/admin/settings` — activa `modo_mantenimiento`. El aviso se muestra en el layout; los super admin no se bloquean. |
| **Cerrar registro público** | `/admin/settings` — `registro_habilitado` / `registration_enabled` evita `POST /api/auth/register` (403 con mensaje en español). |
| **KPIs y tráfico agregado** | `/admin` — `GET /api/admin/stats` (caché ~15 s; incluye agregados de **cobros** `subscription_payments` últimos 30 d por moneda). |
| **Usuarios, filtros, CSV** | `/admin/users` — registro (`createdFrom`/`createdTo`) y **periodo de facturación** (`billingPeriodFrom`/`billingPeriodTo`, solapamiento en **UTC**). |
| **Planes y módulos** | `/admin/subscriptions` — cada plan exige al menos un módulo activo. |

Más detalle y estado de alcance: `docs/plan-super-admin.md`.

---

## Licencia

MIT (ver `package.json` de cada paquete).
