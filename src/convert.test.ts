import { test } from "node:test";
import assert from "node:assert/strict";
import { gitignoreToMinimatch, minimatchToGitignore } from "./convert.ts";

// Each row is a matched pair: the gitignore form and the minimatch form
// that should convert into each other. Not every row round-trips back to
// its exact original text: whenever the minimatch side already has an
// explicit "**/" prefix, minimatchToGitignore keeps it rather than trying
// to figure out whether it could be dropped (see the dedicated test below
// for why that would be unsafe). Those rows set skip: "toGitignore" and
// are only checked in the gitignoreToMinimatch direction.
const PAIRS: Array<{
  name: string;
  gitignore: string;
  minimatch: string;
  skip?: "toMinimatch" | "toGitignore";
}> = [
  { name: "bare pattern matches at any depth", gitignore: "foo", minimatch: "**/foo", skip: "toGitignore" },
  { name: "leading slash anchors to root", gitignore: "/foo", minimatch: "foo" },
  { name: "internal slash auto-anchors", gitignore: "src/foo.ts", minimatch: "src/foo.ts" },
  { name: "trailing slash marks directory-only", gitignore: "build/", minimatch: "**/build/", skip: "toGitignore" },
  { name: "leading bang negates", gitignore: "!foo.log", minimatch: "!**/foo.log", skip: "toGitignore" },
  { name: "explicit leading globstar passes through", gitignore: "**/*.log", minimatch: "**/*.log" },
  { name: "middle globstar passes through", gitignore: "a/**/b", minimatch: "a/**/b" },
  { name: "trailing globstar passes through", gitignore: "abc/**", minimatch: "abc/**" },
  {
    name: "escaped leading bang is a literal character",
    gitignore: "\\!important",
    minimatch: "**/!important",
    skip: "toGitignore",
  },
  {
    name: "escaped leading hash is a literal character",
    gitignore: "\\#notacomment",
    minimatch: "**/#notacomment",
    skip: "toGitignore",
  },
  {
    name: "bracket negation passes through untouched",
    gitignore: "[!abc].txt",
    minimatch: "**/[!abc].txt",
    skip: "toGitignore",
  },
  {
    name: "literal braces are escaped for minimatch",
    gitignore: "file{1}.txt",
    minimatch: "**/file\\{1\\}.txt",
    skip: "toGitignore",
  },
  {
    name: "trailing unescaped whitespace is trimmed",
    gitignore: "foo.txt   ",
    minimatch: "**/foo.txt",
    skip: "toGitignore",
  },
  {
    name: "trailing escaped whitespace is kept literal",
    gitignore: "foo\\ ",
    minimatch: "**/foo\\ ",
    skip: "toGitignore",
  },
];

for (const { name, gitignore, minimatch, skip } of PAIRS) {
  if (skip !== "toMinimatch") {
    test(`gitignoreToMinimatch: ${name}`, () => {
      assert.equal(gitignoreToMinimatch(gitignore), minimatch);
    });
  }
  if (skip !== "toGitignore") {
    test(`minimatchToGitignore: ${name}`, () => {
      assert.equal(minimatchToGitignore(minimatch), gitignore);
    });
  }
}

test("gitignoreToMinimatch: comment lines convert to nothing", () => {
  assert.equal(gitignoreToMinimatch("# a comment"), null);
});

test("gitignoreToMinimatch: blank lines convert to nothing", () => {
  assert.equal(gitignoreToMinimatch(""), null);
  assert.equal(gitignoreToMinimatch("   "), null);
});

test("gitignoreToMinimatch: a lone bang with no pattern converts to nothing", () => {
  assert.equal(gitignoreToMinimatch("!"), null);
});

test("minimatchToGitignore: an explicit **/ prefix is kept rather than collapsed", () => {
  // Dropping "**/" would only be safe when nothing after it contains a
  // slash (a multi-segment case like "**/src/*.ts" is NOT the same
  // pattern as "src/*.ts", which is root-anchored). Rather than special
  // case that, the prefix is always preserved: valid, just not minimal.
  assert.equal(minimatchToGitignore("**/foo"), "**/foo");
  assert.equal(minimatchToGitignore("**/src/*.ts"), "**/src/*.ts");
});

test("minimatchToGitignore: double negation cancels out (unlike gitignore's single toggle)", () => {
  // In minimatch, "!!foo" negates twice, i.e. it is not negated at all.
  // gitignore only ever recognizes one leading '!', so this lands on a
  // plain anchored pattern rather than a literal "!!foo".
  assert.equal(minimatchToGitignore("!!foo"), "/foo");
});

test("minimatchToGitignore: triple negation stays negated", () => {
  assert.equal(minimatchToGitignore("!!!foo"), "!/foo");
});

test("minimatchToGitignore: a leading '!(' is read as negation, not extglob", () => {
  // "!(foo)" is genuinely ambiguous: minimatch treats a leading "!(" as
  // its "not this" extglob group, but gitignore has no such thing and
  // would read the same text as "negate the pattern (foo)". This
  // converter always resolves a leading '!' as negation first, since
  // that is the only reading gitignore has.
  assert.equal(minimatchToGitignore("!(foo)"), "!/(foo)");
});

test("minimatchToGitignore: extglob elsewhere in the pattern has no gitignore equivalent", () => {
  assert.throws(() => minimatchToGitignore("+(foo|bar)"), /extglob/);
  assert.throws(() => minimatchToGitignore("backup.@(bak|old)"), /extglob/);
});

test("minimatchToGitignore: absolute paths have no gitignore equivalent", () => {
  assert.throws(() => minimatchToGitignore("/etc/passwd"), /absolute/);
});

test("minimatchToGitignore: real brace expansion has no gitignore equivalent", () => {
  assert.throws(() => minimatchToGitignore("*.{js,ts}"), /brace expansion/);
});

test("gitignoreToMinimatch: a magic char before '(' is escaped so minimatch does not read it as extglob", () => {
  // "foo!(bar)" is just a filename to git (a '!' only means negation at
  // the very start of a line), but "!(" would trigger minimatch's
  // extglob syntax if it were passed through unescaped.
  assert.equal(gitignoreToMinimatch("foo!(bar)"), "**/foo\\!(bar)");
});
