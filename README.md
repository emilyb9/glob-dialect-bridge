# glob-dialect-bridge

Converts glob patterns between two dialects that look almost identical but
disagree on the details:

- **gitignore** syntax — what git uses for `.gitignore` and `.git/info/exclude`.
- **minimatch** syntax — what most JS tooling uses (`node-glob`, `fast-glob`,
  the `files` field in `package.json`, tsconfig `include`, etc).

I kept hitting the same problem: I'd copy a `.gitignore` pattern into a glob
option somewhere in a build script and it would silently match the wrong
things, because the two formats don't mean the same thing by default. This
is a small library that does the translation correctly instead of by hand.

## Why they don't just work interchangeably

- A bare gitignore pattern (`foo`) matches at any depth. A bare minimatch
  pattern (`foo`) only matches a path that is *exactly* `foo`, because
  minimatch matches the whole string, not the basename.
- A leading slash in gitignore (`/foo`) anchors the pattern to the root.
  Minimatch has no such marker — a leading slash there means an absolute
  filesystem path, which has no gitignore equivalent.
- gitignore has no brace expansion (`{a,b}`) or extglob (`+(...)`, `!(...)`,
  etc.) — those characters are just literal text there, but they're special
  in minimatch.
- A trailing slash means "directories only" in both, but only gitignore
  treats a *lone* leading `!` as negation; minimatch keeps toggling on every
  leading `!` (`!!foo` cancels out).

## Usage

```ts
import {
  gitignoreToMinimatch,
  minimatchToGitignore,
  gitignoreFileToMinimatchList,
} from "./src/convert.ts";

gitignoreToMinimatch("node_modules/");
// "**/node_modules/"

gitignoreToMinimatch("/dist");
// "dist"

minimatchToGitignore("src/**/*.test.ts");
// "src/**/*.test.ts"

// Turn a whole .gitignore file into patterns for a JS glob library:
const patterns = gitignoreFileToMinimatchList(
  ["# build output", "/dist", "*.log", "!important.log"].join("\n"),
);
// ["dist", "**/*.log", "!**/important.log"]
```

Patterns that only make sense in one dialect throw instead of guessing:

```ts
minimatchToGitignore("+(foo|bar).ts"); // throws: extglob has no gitignore equivalent
minimatchToGitignore("/etc/passwd");   // throws: absolute paths have no gitignore equivalent
minimatchToGitignore("*.{js,ts}");     // throws: brace expansion has no gitignore equivalent
```

## Command line

`src/cli.ts` converts a whole file from stdin to stdout, in either direction:

```
node --experimental-strip-types src/cli.ts --to-minimatch < .gitignore > patterns.txt
node --experimental-strip-types src/cli.ts --to-gitignore < patterns.txt > .gitignore
```

`--to-minimatch` reads a `.gitignore` file (comments and blank lines are
skipped) and prints one minimatch pattern per line. `--to-gitignore` reads
one minimatch pattern per line and prints the equivalent `.gitignore` file.
A pattern with no gitignore equivalent aborts the whole run: the error goes
to stderr and the process exits with status 1.

## Known limitations

- Round trips aren't always byte-for-byte identical. `minimatchToGitignore`
  keeps an explicit `**/` prefix as-is rather than trying to figure out
  whether it's safe to drop (it usually isn't once there's more than one
  path segment after it) — the result is always correct, just sometimes
  longer than a human would write by hand.
- Brace expansion and character classes aren't brace-aware of each other:
  literal `{`/`}` inside a `[...]` bracket expression aren't special-cased,
  matching a known rough edge in real glob libraries rather than fixing it.

## Running the tests

Requires Node 22.6+ (pass `--experimental-strip-types`) or Node 23.6+
(works without a flag):

```
npm test
```

There are no dependencies to install first.
