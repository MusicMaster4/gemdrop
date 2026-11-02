import test from "node:test";
import assert from "node:assert/strict";
import { resolveRelease } from "./release-version.mjs";
const resolve = (branch, tags = [], packageVersion = "0.1.0", bump = "patch") =>
  resolveRelease({ branch, tags, packageVersion, bump });

test("initial releases use the project version and stay in their channel", () => {
  assert.deepEqual(resolve("main"), {
    version: "0.1.0",
    tag: "v0.1.0",
    channel: "stable",
  });
  assert.deepEqual(resolve("testing"), {
    version: "0.1.0-testing.1",
    tag: "v0.1.0-testing.1",
    channel: "testing",
  });
});
test("betas never become the source of the stable version", () => {
  const tags = [
    "v0.1.0",
    "v0.1.1-testing.1",
    "v0.1.1-testing.9",
    "channel-testing",
  ];
  assert.equal(resolve("main", tags).version, "0.1.1");
  assert.equal(resolve("testing", tags).version, "0.1.1-testing.10");
});
test("the beta counter restarts for the next stable version", () => {
  assert.equal(
    resolve("testing", ["v0.1.0", "v0.1.1", "v0.1.1-testing.18"]).version,
    "0.1.2-testing.1",
  );
});
test("numeric sorting, explicit bumps and package version overrides work", () => {
  assert.equal(resolve("main", ["v0.1.9", "v0.1.10"]).version, "0.1.11");
  assert.equal(resolve("main", ["v0.1.10"], "0.1.0", "minor").version, "0.2.0");
  assert.equal(
    resolve("testing", ["v0.1.10"], "2.0.0").version,
    "2.0.0-testing.1",
  );
});
test("other branches and malformed inputs cannot publish", () => {
  assert.throws(() => resolve("feature/test"));
  assert.throws(() => resolve("main", [], "0.1.0-beta.1"));
  assert.throws(() => resolve("main", [], "0.1.0", "invalid"));
});
