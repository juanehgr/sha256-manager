const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const version = require("../package.json").version;
const android = path.join(root, "android");
const keystoreDir = path.join(android, "keystore");
const keystore = path.join(keystoreDir, "upload.jks");
const keyProps = path.join(android, "key.properties");
const storePass = "sha256-manager-local";
const alias = "sha256";

function ensureKeystore() {
  if (fs.existsSync(keystore) && fs.existsSync(keyProps)) return;
  fs.mkdirSync(keystoreDir, { recursive: true });
  const keytool =
    process.platform === "win32"
      ? path.join(process.env.JAVA_HOME || "C:\\Program Files\\Java\\jdk-17", "bin", "keytool.exe")
      : "keytool";
  const r = spawnSync(
    keytool,
    [
      "-genkeypair",
      "-v",
      "-keystore",
      keystore,
      "-storepass",
      storePass,
      "-keypass",
      storePass,
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "10000",
      "-alias",
      alias,
      "-dname",
      "CN=SHA-256 Manager, OU=juanehgr, O=juanehgr, C=ES",
    ],
    { stdio: "inherit" }
  );
  if (r.status !== 0) process.exit(r.status || 1);
  fs.writeFileSync(
    keyProps,
    [
      `storePassword=${storePass}`,
      `keyPassword=${storePass}`,
      `keyAlias=${alias}`,
      `storeFile=keystore/upload.jks`,
      "",
    ].join("\n")
  );
}

ensureKeystore();

const gradle = path.join(android, process.platform === "win32" ? "gradlew.bat" : "gradlew");
const r = spawnSync(gradle, ["assembleRelease"], {
  cwd: android,
  stdio: "inherit",
  env: {
    ...process.env,
    ANDROID_HOME: process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk"),
    ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk"),
  },
  shell: process.platform === "win32",
});
if (r.status !== 0) process.exit(r.status || 1);

const signed = path.join(android, "app", "build", "outputs", "apk", "release", "app-release.apk");
const unsigned = path.join(android, "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk");
const src = fs.existsSync(signed) ? signed : unsigned;
const destDir = path.join(root, "release");
fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, `SHA-256-Manager-${version}.apk`);
fs.copyFileSync(src, dest);
console.log(dest);
