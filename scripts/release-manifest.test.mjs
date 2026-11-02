import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest } from "./release-manifest.mjs";
const input = {
  version: "0.1.0-testing.1",
  repo: "example/gemdrop",
  tag: "v0.1.0-testing.1",
  name: "Gemdrop_0.1.0-testing.1_beta_windows-x64_setup.exe",
  signature: "signed\n",
  date: "2026-11-02T12:00:00.000Z",
};
test("the beta pointer refers to immutable versioned assets and both Windows updater keys", () => {
  const manifest = buildManifest(input);
  assert.equal(manifest.platforms["windows-x86_64"].signature, "signed");
  assert.equal(
    manifest.platforms["windows-x86_64-nsis"].url,
    "https://github.com/example/gemdrop/releases/download/v0.1.0-testing.1/Gemdrop_0.1.0-testing.1_beta_windows-x64_setup.exe",
  );
  assert.ok(
    !manifest.platforms["windows-x86_64"].url.includes("channel-testing"),
  );
  assert.equal(manifest.pub_date, input.date);
});
test("unsigned, mismatched and noninstaller assets cannot be published", () => {
  assert.throws(() => buildManifest({ ...input, signature: "" }));
  assert.throws(() => buildManifest({ ...input, tag: "v0.2.0" }));
  assert.throws(() => buildManifest({ ...input, name: "portable.zip" }));
});
