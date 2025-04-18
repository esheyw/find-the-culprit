import * as fs from "fs";
import path from "path";

console.log("Reforging Symlinks");

const configFileName = "foundry-config.json";

if (fs.existsSync(configFileName)) {
  let fileRoot = "";
  try {
    const fc = await fs.promises.readFile(configFileName, "utf-8");

    const foundryConfig = JSON.parse(fc);

    // As of 13.338, the Node install is *not* nested but electron installs *are*
    const nested = fs.existsSync(path.join(foundryConfig.installPath, "resources", "app"));

    if (nested) fileRoot = path.join(foundryConfig.installPath, "resources", "app");
    else fileRoot = foundryConfig.installPath;
  } catch (err) {
    console.error(`Error reading foundry-config.yaml: ${err}`);
  }

  try {
    await fs.promises.mkdir("foundry");
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }

  // Javascript files
  for (const p of ["client", "common", "tsconfig.json"]) {
    try {
      await fs.promises.symlink(path.join(fileRoot, p), path.join("foundry", p));
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }

  // Language files
  try {
    await fs.promises.symlink(path.join(fileRoot, "public", "lang"), path.join("foundry", "lang"));
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
} else {
  console.log("Foundry config file did not exist.");
}
