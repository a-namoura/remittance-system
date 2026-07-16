import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = process.cwd();
const projects = ["backend", "frontend", "contracts"];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const inventory = {
  schemaVersion: 1,
  description: "Direct Node.js dependencies. CycloneDX release SBOMs contain the full transitive graph.",
  projects: projects.map((project) => {
    const packagePath = resolve(root, project, "package.json");
    const lockPath = resolve(root, project, "package-lock.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    const dependencies = Object.entries(packageJson.dependencies ?? {})
      .map(([name, version]) => ({ name, version, scope: "production" }))
      .concat(
        Object.entries(packageJson.devDependencies ?? {}).map(([name, version]) => ({
          name,
          version,
          scope: "development",
        })),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    return {
      project,
      packageManager: "npm",
      manifest: `${project}/package.json`,
      lockfile: `${project}/package-lock.json`,
      lockfileSha256: sha256(lockPath),
      dependencies,
    };
  }),
};

process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
