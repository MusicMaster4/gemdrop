import { readFileSync, writeFileSync } from "node:fs";
const flag = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const version = flag("--version");
const channel = flag("--channel");
const repo = flag("--repo");
if (!/^\d+\.\d+\.\d+(?:-testing\.\d+)?$/.test(version ?? ""))
  throw new Error("Provide --version with a valid Gemdrop release version.");
if (!["stable", "testing"].includes(channel))
  throw new Error("Provide --channel stable or testing.");
if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? ""))
  throw new Error("Provide --repo owner/name.");
if ((channel === "testing") !== version.includes("-testing."))
  throw new Error("Version and update channel disagree.");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
packageJson.version = version;
writeFileSync("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
const configPath = "src-tauri/tauri.conf.json";
const config = JSON.parse(readFileSync(configPath, "utf8"));
config.version = version;
config.bundle.createUpdaterArtifacts = true;
config.plugins ??= {};
config.plugins.updater ??= {};
config.plugins.updater.endpoints = [
  channel === "testing"
    ? `https://github.com/${repo}/releases/download/channel-testing/latest.json`
    : `https://github.com/${repo}/releases/latest/download/latest.json`,
];
if (!config.plugins.updater.pubkey)
  throw new Error(
    "A public updater signing key must be configured before releasing.",
  );
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
const cargoPath = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoPath, "utf8");
const name = cargo.match(/\[package\][\s\S]*?\bname\s*=\s*"([^"]+)"/)?.[1];
if (!name) throw new Error("Cargo package name is missing.");
writeFileSync(
  cargoPath,
  cargo.replace(
    /(\[package\][\s\S]*?\bversion\s*=\s*")[^"]+(")/,
    `$1${version}$2`,
  ),
);
const lockPath = "src-tauri/Cargo.lock";
const lock = readFileSync(lockPath, "utf8");
const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = new RegExp(
  `(\\[\\[package\\]\\]\\r?\\nname = "${escapedName}"\\r?\\nversion = ")[^"]+(")`,
);
if (!pattern.test(lock))
  throw new Error("The app package is absent from Cargo.lock.");
writeFileSync(lockPath, lock.replace(pattern, `$1${version}$2`));
console.log(`Applied ${version}; updater channel ${channel}.`);
