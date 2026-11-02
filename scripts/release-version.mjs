import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const stablePattern = /^v(\d+)\.(\d+)\.(\d+)$/;
const compare = (left, right) =>
  left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
const parse = (version) => version.split(".").map(Number);

export function resolveRelease({
  branch,
  tags,
  packageVersion,
  bump = "patch",
}) {
  if (!["main", "testing"].includes(branch))
    throw new Error("Releases require main or testing.");
  if (!["patch", "minor", "major"].includes(bump))
    throw new Error("Invalid version increment.");
  if (!/^\d+\.\d+\.\d+$/.test(packageVersion))
    throw new Error("package.json must contain a stable semantic version.");
  const stable = tags
    .filter((tag) => stablePattern.test(tag))
    .map((tag) => parse(tag.slice(1)))
    .sort(compare)
    .at(-1);
  let next = parse(packageVersion);
  if (stable) {
    const increment = [...stable];
    if (bump === "major") {
      increment[0]++;
      increment[1] = 0;
      increment[2] = 0;
    } else if (bump === "minor") {
      increment[1]++;
      increment[2] = 0;
    } else increment[2]++;
    if (compare(next, increment) < 0) next = increment;
  }
  const base = next.join(".");
  const channel = branch === "main" ? "stable" : "testing";
  let version = base;
  if (channel === "testing") {
    const prefix = `v${base}-testing.`;
    const counter = Math.max(
      0,
      ...tags
        .filter((tag) => tag.startsWith(prefix))
        .map((tag) => tag.slice(prefix.length))
        .filter((value) => /^\d+$/.test(value))
        .map(Number),
    );
    version = `${base}-testing.${counter + 1}`;
  }
  return { version, tag: `v${version}`, channel };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const flag = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? fallback : process.argv[index + 1];
  };
  const result = resolveRelease({
    branch: flag("--branch", process.env.GITHUB_REF_NAME),
    tags: execFileSync("git", ["tag", "--list"], { encoding: "utf8" })
      .trim()
      .split(/\r?\n/),
    packageVersion: JSON.parse(readFileSync("package.json", "utf8")).version,
    bump: flag("--bump", "patch") || "patch",
  });
  for (const [key, value] of Object.entries(result)) {
    console.log(`${key}=${value}`);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}
