# SHA-256 Manager

**Gestor local de mineros SHA-256.** Descubre ASICs en tu LAN, guarda pools y wallets, y cambia de stratum con un clic. También aplica la misma configuración a alquileres de [Mining Rig Rentals](https://www.miningrigrentals.com/).

Versión **0.2.3** · Electron + web en `http://127.0.0.1:3847` · Datos en SQLite local (no hay nube ni cuentas).

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

Abre **http://127.0.0.1:3847**. Escritorio (desarrollo):

```bash
npm start
```

### Ejecutable de Windows

```bash
npm install
npm run dist
```

En `release/` quedan:

- **`SHA-256-Manager-0.2.3-portable.exe`** — no instala nada; doble clic y abre la ventana.
- **Instalador NSIS** — acceso directo en escritorio y menú inicio.

Los datos del `.exe` se guardan en `%APPDATA%\sha256-manager\data\`.

### Android (APK)

El APK es **standalone**: escanea la Wi‑Fi del móvil, guarda pools/wallets en el teléfono y aplica stratum directo a los mineros. No hace falta el PC.

```bash
npm install
npm run android:apk
```

El archivo queda en `release/SHA-256-Manager-0.2.3.apk` (firmado).

Google **no lo va a “confiar”** porque no está en Play Store. En el móvil:

1. Desinstala cualquier SHA-256 Manager anterior.
2. Ajustes → Aplicaciones → Acceso especial → **Instalar apps desconocidas** → Files / Chrome / Drive → permitir.
3. Abre el APK. Si sale **Play Protect**: Más detalles → **Instalar de todos modos**.

### Actualizaciones

El dashboard comprueba [GitHub Releases](https://github.com/juanehgr/sha256-manager/releases) al abrir y cada 10 minutos. Si hay una versión más nueva, aparece **Actualizar ahora**. El instalador **NSIS** también puede descargar e instalar; el portable no se auto-reemplaza bien.

En **web** (`npm run server` desde un clon git), el mismo aviso ofrece `git pull` + `npm install` + build y recarga.

Publicar una versión (sube el número en `package.json` antes):

```bash
npm run release
```

Usa `gh` / `GH_TOKEN` con permiso `repo`. Crea el release con el `.exe` y `latest.yml` para electron-updater.

Los datos viven en `data/data.sqlite` si arrancas con `npm run server` (junto al proyecto). No se suben al repositorio.

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

- Escucha en **0.0.0.0:3847** para que el móvil en la misma Wi‑Fi pueda conectar. El escritorio sigue abriendo `http://127.0.0.1:3847`.
- No hay cuentas remotas ni telemetría de esta app.
- Keys MRR: tabla `mrr_users` en SQLite. No las subas a git (`data/` está en `.gitignore`).
- Aplicar pool **escribe en el minero**. Revisa la config antes de pulsar.

---

## Stack

React + Vite (UI) · Express (`server/`) · SQLite (`node:sqlite`) · Electron opcional · HMAC-SHA1 para la API v2 de MRR.

---

## Licencia y estado

Proyecto en **v0.2.3**. Ver [LICENSE](LICENSE).

**No es Creative Commons.** CC (incluso BY-NC-ND) permite compartir copias; tú no quieres redistribución ni derivados ni uso comercial. Por eso es **todos los derechos reservados**: se puede descargar y usar en equipos propios; no se puede compartir, modificar ni monetizar sin permiso de **juanehgr**.
