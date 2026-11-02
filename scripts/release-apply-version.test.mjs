import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const script = resolve("scripts/release-apply-version.mjs");

test("release stamping preserves signing identity, lockfile dependencies and channel isolation", () => {
  const directory = mkdtempSync(join(tmpdir(), "gemdrop-release-"));
  try {
    mkdirSync(join(directory, "src-tauri"));
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ name: "gemdrop", version: "0.1.0" }),
    );
    writeFileSync(
      join(directory, "src-tauri/tauri.conf.json"),
      JSON.stringify({
        version: "0.1.0",
        bundle: {},
        plugins: { updater: { pubkey: "public-signing-key" } },
      }),
    );
    writeFileSync(
      join(directory, "src-tauri/Cargo.toml"),
      '[package]\nname = "gemdrop"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1"\n',
    );
    writeFileSync(
      join(directory, "src-tauri/Cargo.lock"),
      'version = 4\n\n[[package]]\nname = "gemdrop"\nversion = "0.1.0"\ndependencies = ["serde"]\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n',
    );
    const apply = (version, channel) =>
      execFileSync(
        process.execPath,
        [
          script,
          "--version",
          version,
          "--channel",
          channel,
          "--repo",
          "example/gemdrop",
        ],
        { cwd: directory, stdio: "pipe" },
      );
    apply("1.0.0-testing.3", "testing");
    let config = JSON.parse(
      readFileSync(join(directory, "src-tauri/tauri.conf.json"), "utf8"),
    );
    assert.equal(config.version, "1.0.0-testing.3");
    assert.equal(config.plugins.updater.pubkey, "public-signing-key");
    assert.deepEqual(config.plugins.updater.endpoints, [
      "https://github.com/example/gemdrop/releases/download/channel-testing/latest.json",
    ]);
    assert.ok(
      readFileSync(join(directory, "src-tauri/Cargo.lock"), "utf8").includes(
        'name = "gemdrop"\nversion = "1.0.0-testing.3"',
      ),
    );
    assert.ok(
      readFileSync(join(directory, "src-tauri/Cargo.lock"), "utf8").includes(
        'name = "serde"\nversion = "1.0.0"',
      ),
    );
    apply("1.0.0", "stable");
    config = JSON.parse(
      readFileSync(join(directory, "src-tauri/tauri.conf.json"), "utf8"),
    );
    assert.deepEqual(config.plugins.updater.endpoints, [
      "https://github.com/example/gemdrop/releases/latest/download/latest.json",
    ]);
    assert.throws(() => apply("1.0.0-testing.3", "stable"));
    assert.throws(() => apply("1.0.0", "testing"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
