# Miner Connection Manager

Gestor **local** de ASICs SHA-256. Descubre mineros en la LAN, guarda pools y wallets, y cambia de stratum con un clic. La misma config se puede aplicar a alquileres de [Mining Rig Rentals](https://www.miningrigrentals.com/).

**v0.2.6** · Electron / web en `http://127.0.0.1:3847` · APK Android · SQLite en el dispositivo (sin nube ni cuentas).

[English](README.md)

![Panel con mineros y cambio de pool](docs/screenshots/01-dashboard.png)

---

## Qué resuelve

En una flota pequeña (NerdQAxe, Open ASIC, Antminer, Whatsminer y otros SHA-256) cambiar de pool suele ser entrar uno a uno en la web del minero. Esta app:

1. Encuentra equipos en el `/24` (HTTP JSON y API cgminer/Whatsminer en el puerto **4028**).
2. Reúne **pools**, **wallets** y **configs** (pool + wallet + worker + contraseña).
3. Aplica host, puerto, usuario y password a los mineros seleccionados o a todos los que estén en línea.
4. Muestra hashrate, temps de placa/VR, shares, uptime, pool activo, stats de red y alquileres MRR.

Todo corre en tu PC o móvil. Las API keys de MRR van en la base local, no en variables de entorno del sistema.

---

## Requisitos

- Node.js **22+** (`node:sqlite`).
- Red local con los mineros.
- Opcional: cuenta MRR con API key + secret.

```bash
git clone https://github.com/juanehgr/sha256-manager.git
cd sha256-manager
npm install
npm run build
npm run server
```

Abre **http://127.0.0.1:3847**. Escritorio (desarrollo): `npm start`.

### Windows

`npm run dist` deja en `release/` el portable `SHA-256-Manager-0.2.6-portable.exe` y el instalador NSIS (**Miner Connection Manager**). Datos del `.exe`: `%APPDATA%\sha256-manager\data\`.

### Android

El APK es **standalone** (escanea la Wi‑Fi del teléfono). `npm run android:apk` → `release/SHA-256-Manager-0.2.6.apk`. Play Protect bloqueará el sideload: instalar de todos modos.

---

## Funcionalidades

- **Panel:** detectar (mDNS + HTTP + 4028), mineros **persistidos**, cards con pool, hashrate, temp, **VR**, **uptime**, **shares enviados/válidos/inválidos**, gráfica. En pantalla estrecha los mineros van primero y las configs de pool en **slider** horizontal. El aviso de actualización **solo** si hay versión nueva.
- **Pools / wallets / configs / programación / MRR:** igual que en el README en inglés (formularios, import por URL, HMAC MRR).
- **Sincronizar configuraciones:** hash/JSON o **IP local** (`:3847`) para traer la config de otro PC, luego combinar o reemplazar.

Capturas (datos de ejemplo, no de una flota real): ver `docs/screenshots/`.

---

## Privacidad y licencia

Escucha en **0.0.0.0:3847**. Sin telemetría. Ver [LICENSE](LICENSE): uso personal; no redistribuir ni modificar ni monetizar sin permiso de **juanehgr**.

Detalle completo: [README.md](README.md) (inglés).
