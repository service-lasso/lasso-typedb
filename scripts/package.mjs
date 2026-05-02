import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;

export const targets = {
  win32: { typedbVersion: "2.25.6", archiveType: "zip", vendorPath: path.join("vendor", "win32", "typedb") },
  linux: { typedbVersion: "2.22.0", archiveType: "tar.gz", vendorPath: path.join("vendor", "linux") },
  darwin: { typedbVersion: "2.22.0", archiveType: "tar.gz", vendorPath: path.join("vendor", "darwin") },
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}: ${result.error?.message ?? ""}`);
  }
}

export function assetName(platform) {
  const target = targets[platform];
  if (!target) {
    throw new Error(`Unsupported target platform: ${platform}. Supported platforms: ${Object.keys(targets).join(", ")}.`);
  }
  return `lasso-typedb-${target.typedbVersion}-${platform}.${target.archiveType === "zip" ? "zip" : "tar.gz"}`;
}

async function compressPackage(packageRoot, outputPath, archiveType) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });

  if (archiveType === "zip") {
    run("powershell", [
      "-NoLogo",
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path ${JSON.stringify(path.join(packageRoot, "*"))} -DestinationPath ${JSON.stringify(outputPath)} -Force`,
    ]);
    return outputPath;
  }

  run("tar", ["-czf", outputPath, "-C", packageRoot, "."]);
  return outputPath;
}

function assertVendorInput(platform) {
  const target = targets[platform];
  const typedbRoot = path.join(repoRoot, target.vendorPath);
  for (const requiredPath of [
    path.join(typedbRoot, "LICENSE"),
    path.join(typedbRoot, "server", "conf", "config.yml"),
    path.join(typedbRoot, "server", "lib"),
    path.join(typedbRoot, "console", "lib"),
  ]) {
    if (!existsSync(requiredPath)) {
      throw new Error(`Required TypeDB package input missing for ${platform}: ${requiredPath}`);
    }
  }
  return typedbRoot;
}

export async function packageTypeDb(platform = targetPlatform) {
  const target = targets[platform];
  if (!target) {
    throw new Error(`Unsupported target platform: ${platform}. Supported platforms: ${Object.keys(targets).join(", ")}.`);
  }

  const typedbRoot = assertVendorInput(platform);
  const outputRoot = path.join(repoRoot, "output", "package", platform);
  const packageRoot = path.join(outputRoot, "payload");
  const outputPath = path.join(repoRoot, "dist", assetName(platform));

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });
  await cp(typedbRoot, path.join(packageRoot, "typedb"), { recursive: true });
  await writeFile(
    path.join(packageRoot, "SERVICE-LASSO-PACKAGE.json"),
    `${JSON.stringify(
      {
        serviceId: "typedb",
        typedbVersion: target.typedbVersion,
        platform,
        arch: "x64",
        packagedBy: "service-lasso/lasso-typedb",
        runtimeProvider: "@java",
        excludes: ["server/data/** runtime database state", "server/logs/** runtime logs"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await compressPackage(packageRoot, outputPath, target.archiveType);
  console.log(`[lasso-typedb] packaged ${outputPath}`);
  return outputPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await packageTypeDb();
}
