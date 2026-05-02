import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, connect } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assetName, packageTypeDb, targets } from "./package.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platforms = process.env.TARGET_PLATFORM ? [process.env.TARGET_PLATFORM] : Object.keys(targets);
const maxSingleFileBytes = 100 * 1024 * 1024;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}: ${result.stderr || result.stdout}`);
  }

  return result.stdout;
}

async function walkFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForTcp(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const socket = connect({ host: "127.0.0.1", port });
        socket.setTimeout(1000);
        socket.on("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.on("timeout", () => {
          socket.destroy();
          reject(new Error("TCP timeout"));
        });
        socket.on("error", reject);
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`TypeDB TCP readiness failed on port ${port}: ${lastError?.message ?? "timeout"}`);
}

async function extractArtifact(artifact, platform, destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  if (platform === "win32") {
    run("powershell", [
      "-NoLogo",
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path ${JSON.stringify(artifact)} -DestinationPath ${JSON.stringify(destination)} -Force`,
    ]);
    return;
  }
  run("tar", ["-xzf", artifact, "-C", destination]);
}

async function smokeCurrentPlatform(artifact) {
  const platform = process.platform;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lasso-typedb-smoke-"));
  const extractRoot = path.join(tempRoot, "extract");
  await readdir(tempRoot);
  await mkdir(extractRoot, { recursive: true });
  await extractArtifact(artifact, platform, extractRoot);

  const typedbRoot = path.join(extractRoot, "typedb");
  assert(existsSync(path.join(typedbRoot, "server", "conf", "config.yml")), "Extracted artifact missing TypeDB config.");
  assert(existsSync(path.join(extractRoot, "jobs", "init", "init.tql.template")), "Extracted artifact missing init job template.");
  assert(existsSync(path.join(extractRoot, "jobs", "sample", "basic_upload.py")), "Extracted artifact missing sample loader.");
  assert(existsSync(path.join(extractRoot, "jobs", "sample", "requirements.txt")), "Extracted artifact missing sample requirements.");
  const dataRoot = path.join(tempRoot, "data");
  await mkdir(dataRoot, { recursive: true });
  const port = await getFreePort();
  const classpath = path.join(typedbRoot, "server", "lib", "*");
  const args = [
    "-Xms256m",
    "-Xmx1024m",
    "-cp",
    classpath,
    `-Dtypedb.dir=${typedbRoot}`,
    "com.vaticle.typedb.core.server.TypeDBServer",
    `--config=${path.join(typedbRoot, "server", "conf", "config.yml")}`,
    `--storage.data=${dataRoot}`,
    "--server.address",
    `127.0.0.1:${port}`,
  ];

  const child = spawn("java", args, {
    cwd: tempRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    await waitForTcp(port);
    const jobRoot = path.join(tempRoot, "jobs", "init");
    await mkdir(jobRoot, { recursive: true });
    await writeFile(path.join(jobRoot, "schema.tql"), await readFile(path.join(repoRoot, "jobs", "init", "schema.tql"), "utf8"), "utf8");
    await writeFile(
      path.join(jobRoot, "init.tql"),
      [
        "database create service_lasso_smoke",
        "transaction service_lasso_smoke schema write",
        "source ./jobs/init/schema.tql",
        "commit",
        "",
      ].join("\n"),
      "utf8",
    );
    const consoleClasspath = path.join(typedbRoot, "console", "lib", "*");
    run(
      "java",
      [
        "-cp",
        consoleClasspath,
        "com.vaticle.typedb.console.TypeDBConsole",
        "--server",
        `127.0.0.1:${port}`,
        "--script",
        path.join(jobRoot, "init.tql"),
      ],
      { cwd: tempRoot },
    );
    const databases = run(
      "java",
      [
        "-cp",
        consoleClasspath,
        "com.vaticle.typedb.console.TypeDBConsole",
        "--server",
        `127.0.0.1:${port}`,
        "--command",
        "database list",
      ],
      { cwd: tempRoot },
    );
    assert(databases.includes("service_lasso_smoke"), "TypeDB init smoke did not create the expected database.");
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("close", resolve));
    await rm(tempRoot, { recursive: true, force: true });
  }

  console.log(`[lasso-typedb] TCP smoke passed on ${platform} port ${port}`);
  if (process.env.VERBOSE_TYPEDB_SMOKE) {
    console.log(stdout);
    console.error(stderr);
  }
}

const manifest = JSON.parse(await readFile(path.join(repoRoot, "service.json"), "utf8"));
assert(manifest.id === "typedb", `Unexpected service id: ${manifest.id}`);
assert(manifest.execservice === "@java", "TypeDB must execute through @java.");
assert(manifest.ports?.service === 8729, "Service port must default to 8729.");
assert(manifest.healthcheck?.type === "tcp", "Healthcheck must be TCP.");
assert(manifest.healthcheck?.address === "${TYPEDB_HOST}:${SERVICE_PORT}", "TCP healthcheck must use the TypeDB host and service port.");
assert(manifest.depend_on?.includes("@java"), "Missing @java dependency.");
for (const globalName of ["TYPEDB_HOST", "TYPEDB_PORT", "TYPEDB_DB", "TYPEDB_URL", "TYPEDB_DATA_PATH"]) {
  assert(manifest.globalenv?.[globalName], `Missing globalenv output: ${globalName}`);
}
assert(manifest.config?.files?.some((file) => file.path === "./jobs/init/init.tql"), "Missing generated init.tql config file.");
assert(manifest.config?.files?.some((file) => file.path === "./jobs/init/schema.tql"), "Missing generated schema.tql config file.");
assert(manifest.setup?.steps?.["init-schema"]?.execservice === "@java", "init-schema setup must run through @java.");
assert(manifest.setup?.steps?.["init-schema"]?.depend_on?.includes("typedb"), "init-schema setup must depend on typedb.");
assert(manifest.setup?.steps?.["init-schema"]?.rerun === "manual", "init-schema setup must be manual.");
assert(
  manifest.setup?.steps?.["init-schema"]?.commandline?.win32?.includes("com.vaticle.typedb.console.TypeDBConsole"),
  "init-schema setup must use the TypeDB console.",
);
assert(
  manifest.setup?.steps?.["install-sample-python-deps"]?.execservice === "@python",
  "install-sample-python-deps setup must run through @python.",
);
assert(manifest.setup?.steps?.["load-sample"]?.execservice === "@python", "load-sample setup must run through @python.");
for (const dependency of ["typedb", "typedb:init-schema", "typedb:install-sample-python-deps"]) {
  assert(manifest.setup?.steps?.["load-sample"]?.depend_on?.includes(dependency), `load-sample missing dependency: ${dependency}`);
}
for (const jobPath of [
  path.join(repoRoot, "jobs", "init", "init.tql.template"),
  path.join(repoRoot, "jobs", "init", "schema.tql"),
  path.join(repoRoot, "jobs", "sample", "basic_upload.py"),
  path.join(repoRoot, "jobs", "sample", "basic_logs.py"),
  path.join(repoRoot, "jobs", "sample", "requirements.txt"),
]) {
  assert(existsSync(jobPath), `Missing packaged job asset: ${jobPath}`);
}

for (const platform of platforms) {
  const target = targets[platform];
  assert(manifest.commandline?.[platform]?.includes("com.vaticle.typedb.core.server.TypeDBServer"), `Missing server commandline for ${platform}.`);
  assert(manifest.artifact?.platforms?.[platform]?.assetName === assetName(platform), `Unexpected artifact name for ${platform}.`);
  const vendorRoot = path.join(repoRoot, target.vendorPath);
  assert(existsSync(path.join(vendorRoot, "LICENSE")), `Missing TypeDB license for ${platform}.`);
  assert(existsSync(path.join(vendorRoot, "server", "conf", "config.yml")), `Missing TypeDB config for ${platform}.`);
  const dataFiles = await walkFiles(path.join(vendorRoot, "server", "data")).catch(() => []);
  assert(dataFiles.length === 0, `Packaged ${platform} vendor input must not include runtime database state.`);
  const logFiles = await walkFiles(path.join(vendorRoot, "server", "logs")).catch(() => []);
  assert(logFiles.length === 0, `Packaged ${platform} vendor input must not include runtime logs.`);
  for (const file of await walkFiles(vendorRoot)) {
    const info = await stat(file);
    assert(info.size <= maxSingleFileBytes, `File exceeds ${maxSingleFileBytes} byte limit: ${file}`);
  }
}

const artifacts = [];
for (const platform of platforms) {
  const artifact = await packageTypeDb(platform);
  artifacts.push({ platform, artifact });
  const info = await stat(artifact);
  assert(info.size > 0, `Artifact is empty: ${artifact}`);
}

const currentArtifact = artifacts.find((entry) => entry.platform === process.platform);
if (currentArtifact && process.env.SKIP_TYPEDB_SMOKE !== "1") {
  await smokeCurrentPlatform(currentArtifact.artifact);
}

const checksums = await Promise.all(artifacts.map(async ({ artifact }) => {
  const hash = createHash("sha256").update(await readFile(artifact)).digest("hex");
  return `${hash}  ${path.basename(artifact)}`;
}));

console.log(`[lasso-typedb] verified manifest and packaged ${artifacts.length} artifact(s)`);
console.log(checksums.join("\n"));
