#!/usr/bin/env node
/**
 * Spins one Docker container per refresh token from tokens.txt.
 * Builds the shared image ONCE, then `docker run`s it for each user (env only).
 *
 * Usage:
 *   node scripts/launch.js
 *   MATCH_LOOPS=3 node scripts/launch.js
 */
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);
const BOT_IMAGE = process.env.BOT_IMAGE || "matik-fk-bot:latest";
const tokensPath = path.resolve(process.env.TOKENS_FILE || "tokens.txt");
const finding = path.resolve("finding.txt");

if (!fs.existsSync(tokensPath)) {
  console.error(
    `Missing ${tokensPath}. Copy tokens.txt.example → tokens.txt and add tokens.`
  );
  process.exit(1);
}

const tokens = fs
  .readFileSync(tokensPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

if (!tokens.length) {
  console.error("No refresh tokens found in tokens.txt");
  process.exit(1);
}

let hasImage = false;
try {
  await execFileAsync("docker", ["image", "inspect", BOT_IMAGE]);
  hasImage = true;
} catch {
  hasImage = false;
}

if (hasImage) {
  console.log(`Cache hit — reusing ${BOT_IMAGE}`);
} else {
  console.log(`Building shared image ${BOT_IMAGE} once…`);
  await run("docker", ["build", "-t", BOT_IMAGE, "-f", "Dockerfile", "."], {
    DOCKER_BUILDKIT: "1",
  });
}

console.log(`Launching ${tokens.length} container(s) from cached image…`);
const children = tokens.map((token, index) => {
  const label = `user${index + 1}_${token.slice(0, 8)}`;
  const name = `matik-bot-${index + 1}`;
  const args = [
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "--shm-size",
    "1g",
    "--add-host",
    "host.docker.internal:host-gateway",
    "-v",
    `${finding}:/app/finding.txt:ro`,
    "-e",
    `REFRESH_TOKEN=${token}`,
    "-e",
    `BOT_LABEL=${label}`,
    "-e",
    `MATCH_LOOPS=${process.env.MATCH_LOOPS || "1"}`,
    "-e",
    `KEEP_OPEN=${process.env.KEEP_OPEN || "0"}`,
    BOT_IMAGE,
  ];
  console.log(`→ starting ${name} (${label})`);
  return run("docker", args).then(() => name);
});

const names = await Promise.all(children);
console.log("\nContainers started:");
for (const name of names) {
  console.log(`  docker logs -f ${name}`);
}
console.log("\nStop all: docker rm -f", names.join(" "));

function run(cmd, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}
