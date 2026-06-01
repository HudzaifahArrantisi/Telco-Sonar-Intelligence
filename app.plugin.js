const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

const splashVector = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="108dp"
  android:height="108dp"
  android:viewportWidth="108"
  android:viewportHeight="108">
  <path android:fillColor="#061017" android:pathData="M0,0h108v108h-108z" />
  <path android:fillColor="#40E0C9" android:pathData="M54,18a36,36 0,1 0,0.1 0M54,25a29,29 0,1 1,-0.1 0" />
  <path android:fillColor="#061017" android:pathData="M50,33h8v42h-8z" />
  <path android:fillColor="#40E0C9" android:pathData="M34,72h40v7h-40zM40,62h28v7h-28zM46,52h16v7h-16z" />
</vector>
`;

module.exports = function withTelcoRfAndroidResources(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const drawableDir = path.join(modConfig.modRequest.platformProjectRoot, "app", "src", "main", "res", "drawable");
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.writeFileSync(path.join(drawableDir, "splashscreen_logo.xml"), splashVector);
      return modConfig;
    }
  ]);
};
