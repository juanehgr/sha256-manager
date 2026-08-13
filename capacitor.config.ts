import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.juanehgr.sha256manager",
  appName: "SHA-256 Manager",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
  server: {
    androidScheme: "https",
    cleartext: true,
  },
};

export default config;
