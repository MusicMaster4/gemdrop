import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function buildManifest({
  version,
  repo,
  tag,
  name,
  signature,
  notes = "",
  date = new Date().toISOString(),
}) {
  if (!/^\d+\.\d+\.\d+(?:-testing\.\d+)?$/.test(version))
    throw new Error("Invalid release version.");
  if (tag !== `v${version}` || !/^[\w.-]+\/[\w.-]+$/.test(repo))
    throw new Error("Invalid release destination.");
  if (!name.endsWith("_setup.exe") || !signature.trim())
    throw new Error("A signed Windows installer is required.");
  const entry = {
    signature: signature.trim(),
    url: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`,
  };
  return {
    version,
    notes,
    pub_date: date,
    platforms: { "windows-x86_64": entry, "windows-x86_64-nsis": entry },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const flag = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? fallback : process.argv[index + 1];
  };
  const directory = flag("--dir", "release-assets");
  const signatures = readdirSync(directory).filter((name) =>
    name.endsWith("_setup.exe.sig"),
  );
  if (signatures.length !== 1)
    throw new Error("Expected exactly one signed Windows installer.");
  const name = signatures[0].slice(0, -4);
  if (!existsSync(join(directory, name)))
    throw new Error("The signed installer is missing.");
  const manifest = buildManifest({
    version: flag("--version"),
    repo: flag("--repo", process.env.GITHUB_REPOSITORY),
    tag: flag("--tag"),
    name,
    signature: readFileSync(join(directory, signatures[0]), "utf8"),
    notes: flag("--notes", "Uma nova versão do Gemdrop está disponível."),
  });
  writeFileSync(
    join(directory, "latest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`Updater manifest generated for ${manifest.version}.`);
}
