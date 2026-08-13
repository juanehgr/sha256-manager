# SHA-256 Manager

**Gestor local de mineros SHA-256.** Descubre ASICs en tu LAN, guarda pools y wallets, y cambia de stratum con un clic. También aplica la misma configuración a alquileres de [Mining Rig Rentals](https://www.miningrigrentals.com/).

Versión **0.1.0** · Electron + web en `http://127.0.0.1:3847` · Datos en SQLite local (no hay nube ni cuentas).

![Panel con mineros y cambio de pool](docs/screenshots/01-dashboard.png)

---

## Qué resuelve

En una flota pequeña (NerdQAxe, Open ASIC, Antminer, Whatsminer y otros SHA-256) cambiar de pool suele ser entrar uno a uno en la web del minero. Esta app:

1. Encuentra los equipos en el `/24` (HTTP JSON y API cgminer/Whatsminer en el puerto **4028**).
2. Reúne **pools**, **wallets** y **configuraciones** (pool + wallet + worker + contraseña).
3. Aplica host, puerto, usuario y password a los mineros seleccionados o a todos los que estén en línea.
4. Muestra hashrate, temperatura, pool activo, dificultad de red y alquileres MRR en el mismo panel.

Todo corre en tu PC. Las API keys de MRR van en la base de datos de la app, no en variables de entorno del sistema.

---

## Requisitos

- Node.js **22+** (usa `node:sqlite`).
- Red local con los mineros (mismo segmento o enrutado).
- Opcional: cuenta MRR con API key + secret.

```bash
git clone https://github.com/juanehgr/sha256-manager.git
cd sha256-manager
npm install
npm run build
npm run server
```

Abre **http://127.0.0.1:3847**. Escritorio:

```bash
npm start
```

Los datos viven en `data/data.sqlite` (junto al proyecto). No se suben al repositorio.

---

## Funcionalidades

### 1. Panel — mineros LAN y cambio de pool

![Panel](docs/screenshots/01-dashboard.png)

- **Detectar mineros:** mDNS + barrido HTTP y TCP 4028.
- **Tarjetas de equipo:** pool activo, hashrate, temperatura, shares, firmware, gráfica con ejes y valor actual.
- **Moneda:** se infiere del **pool** (host, puerto y nombre), no de la dirección `bc1` (BTC y Fractal Bitcoin comparten formato).
- **Red:** dificultad y hashrate de red (SHA-256 / minerstat / mempool). Los recuentos de mineros son una **estimación** (~equivalentes a 200 TH/s).
- **Configuraciones:** rejilla de tarjetas (hasta 4 por fila). Un clic aplica stratum a LAN y, si hay MRR activo, a los alquileres.
- **Reiniciar al aplicar:** interruptor junto al título de cambio de pool.
- Idioma **ES / EN** en la barra superior. Los avisos se cierran solos o con ×.

### 2. Pools — biblioteca e importación por URL

![Pools](docs/screenshots/02-pools.png)

- Alta manual: nombre, host, puerto, moneda, password (por defecto `x`).
- **Importar desde una web de pool:** pega la URL (molepool, solopool, public-pool, etc.). El servidor recorre guía, APIs y scripts en busca de `host:puerto` stratum.
- Agrupación por sitio, búsqueda y edición.
- Reimportar **vuelve a crear** los que hayas borrado; no duplica el mismo `host:puerto`.

### 3. Carteras

![Carteras](docs/screenshots/03-wallets.png)

- Nombre, dirección y moneda (opcional).
- No se asume BTC solo por `bc1`. La moneda de minado la marca el pool.

### 4. Configs — recetas de un clic

![Configs](docs/screenshots/04-configs.png)

Cada fila une:

| Campo | Uso |
| --- | --- |
| Pool | Host y puerto stratum |
| Wallet | Dirección de pago |
| Worker | Sufijo (opcional) |
| Contraseña | Stratum, por defecto `x` |
| Fallback | Pool de reserva (firmware que lo soporte) |

El usuario de stratum queda `dirección` o `dirección.worker`.

### 5. Programación

![Programación](docs/screenshots/05-schedules.png)

Cambia de configuración a una hora, en días de la semana o en una fecha concreta (reloj del PC). Puede aplicarse a todos los mineros en línea o a uno por MAC, con reinicio opcional.

### 6. Mining Rig Rentals (MRR)

![MRR](docs/screenshots/06-mrr.png)

- Varios usuarios, cada uno con su **API key y secret** en SQLite.
- Activa una cuenta y lista alquileres (pool actual, hashrate, fin).
- Aplica la misma config de pool que a los ASICs locales (`PUT /rental/{id}/pool`).
- Los alquileres también aparecen en el **Panel**.

### 7. Donar

![Donar](docs/screenshots/07-donate.png)

Dirección BTC on-chain y QR, sin intermediarios.

---

## Cómo se habla con los mineros

| Tipo | Cómo se detecta | Cambio de pool |
| --- | --- | --- |
| Firmware HTTP JSON (p. ej. AxeOS) | `GET /api/system/info` | `PATCH /api/system` |
| cgminer / Antminer | TCP **4028** `summary` / `pools` | `addpool` + `switchpool` |
| Whatsminer | TCP **4028** (`cmd` / `command`) | Misma API cgminer cuando el firmware lo permite |

Identidad por MAC cuando el equipo la expone; si no, un identificador derivado de la IP.

---

## Privacidad y seguridad

- Solo escucha en **127.0.0.1:3847**.
- No hay cuentas remotas ni telemetría de esta app.
- Keys MRR: tabla `mrr_users` en SQLite. No las subas a git (`data/` está en `.gitignore`).
- Aplicar pool **escribe en el minero**. Revisa la config antes de pulsar.

---

## Stack

React + Vite (UI) · Express (`server/`) · SQLite (`node:sqlite`) · Electron opcional · HMAC-SHA1 para la API v2 de MRR.

---

## Licencia y estado

Proyecto en **v0.1**, repositorio privado. Uso en tu propia red y hardware.
