# Bitaxe Connection Manager

App de escritorio local para detectar Bitaxes en la LAN, guardar pools/wallets/configuraciones y cambiar de pool con un clic.

## Arranque

```bash
npm install
npm start
```

Se abre una ventana de escritorio. Si no, entra en el navegador a http://127.0.0.1:3847 (con `npm run server` si solo quieres la web). Los datos se guardan en `%APPDATA%\bitaxe-manager\data.sqlite`.

1. **Detectar Bitaxes** (mDNS AxeOS + barrido del `/24`).
2. Crea pools y wallets.
3. Crea una **configuración** (pool + wallet + worker).
4. En el dashboard, selecciona mineros y pulsa el botón de esa configuración.
