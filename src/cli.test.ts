import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("./cli.ts", import.meta.url));

function runCli(args: string[], input: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", cliPath, ...args], {
    input,
    encoding: "utf8",
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

test("cli --to-minimatch converts a .gitignore file", () => {
  const { stdout, status } = runCli(
    ["--to-minimatch"],
    ["# build output", "/dist", "*.log", "!important.log"].join("\n"),
  );
  assert.equal(status, 0);
  assert.equal(stdout, "dist\n**/*.log\n!**/important.log\n");
});

test("cli --to-gitignore converts a list of minimatch patterns", () => {
  const { stdout, status } = runCli(["--to-gitignore"], ["dist", "**/*.log", "!**/important.log"].join("\n"));
  assert.equal(status, 0);
  assert.equal(stdout, "/dist\n**/*.log\n!**/important.log\n");
});

test("cli --to-gitignore surfaces conversion errors on stderr and exits non-zero", () => {
  const { stderr, status } = runCli(["--to-gitignore"], "*.{js,ts}\n");
  assert.equal(status, 1);
  assert.match(stderr, /brace expansion/);
});

test("cli with no arguments prints usage and exits non-zero", () => {
  const { stderr, status } = runCli([], "");
  assert.equal(status, 1);
  assert.match(stderr, /usage/);
});

test("cli --to-minimatch on an empty file prints nothing", () => {
  const { stdout, status } = runCli(["--to-minimatch"], "");
  assert.equal(status, 0);
  assert.equal(stdout, "");
});
