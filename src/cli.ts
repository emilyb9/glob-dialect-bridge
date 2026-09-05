#!/usr/bin/env -S node --experimental-strip-types

// Reads patterns from stdin, converts them, writes the result to stdout.
//
//   node src/cli.ts --to-minimatch < .gitignore > patterns.txt
//   node src/cli.ts --to-gitignore < patterns.txt > .gitignore
//
// --to-minimatch treats stdin as a whole .gitignore file (comments and
// blank lines allowed) and prints one minimatch pattern per line.
// --to-gitignore treats stdin as one minimatch pattern per line and prints
// the equivalent .gitignore file.

import { gitignoreFileToMinimatchList, minimatchListToGitignoreFile } from "./convert.ts";

function printUsage(): void {
  process.stderr.write(
    "usage: cli.ts --to-minimatch|--to-gitignore < input > output\n",
  );
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "--to-minimatch" && mode !== "--to-gitignore") {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const input = await readStdin();

  if (mode === "--to-minimatch") {
    const patterns = gitignoreFileToMinimatchList(input);
    process.stdout.write(patterns.length > 0 ? patterns.join("\n") + "\n" : "");
    return;
  }

  const patterns = input.split(/\r\n|\r|\n/).filter((line) => line.length > 0);
  process.stdout.write(minimatchListToGitignoreFile(patterns));
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
