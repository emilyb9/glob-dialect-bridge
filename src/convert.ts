// Converts glob patterns between two dialects:
//
//   gitignore  - the syntax git uses for .gitignore / .git/info/exclude
//   minimatch  - the syntax used by minimatch, node-glob, and most JS glob
//                tooling (package.json "files", tsconfig "include", etc.)
//
// The two dialects agree on most of the basics (*, ?, [...], **) but
// disagree on what a pattern means by default:
//
//   - A bare gitignore pattern with no slash ("foo") matches at any depth.
//     A bare minimatch pattern ("foo") only matches a top-level "foo",
//     because minimatch matches the whole string, not the basename.
//   - A leading slash in gitignore ("/foo") anchors to the root. Minimatch
//     has no such marker; a leading slash there means an absolute path,
//     which has no gitignore equivalent.
//   - gitignore has no brace expansion ({a,b}) or extglob (+(...), etc.),
//     so those are literal characters there but special in minimatch.

interface ParsedGitignoreLine {
  negated: boolean;
  directoryOnly: boolean;
  body: string;
}

/**
 * Parses one line of a .gitignore file. Returns null for blank lines and
 * comments (lines starting with an unescaped '#'), matching git's own
 * behavior of skipping them entirely.
 */
function parseGitignoreLine(rawLine: string): ParsedGitignoreLine | null {
  if (rawLine.length === 0) return null;
  if (rawLine[0] === "#") return null;

  let line = rawLine;
  if (line.startsWith("\\#")) {
    line = line.slice(1);
  }

  line = trimTrailingUnescapedSpace(line);
  if (line.length === 0) return null;

  let negated = false;
  if (line.startsWith("\\!")) {
    line = line.slice(1);
  } else if (line.startsWith("!")) {
    negated = true;
    line = line.slice(1);
  }
  if (line.length === 0) return null;

  let directoryOnly = false;
  if (endsWithUnescapedSlash(line)) {
    directoryOnly = true;
    line = line.slice(0, -1);
  }

  return { negated, directoryOnly, body: line };
}

/**
 * Converts a single .gitignore pattern line into the equivalent minimatch
 * pattern. Returns null when the line is a comment or blank (there is
 * nothing to convert).
 */
export function gitignoreToMinimatch(rawLine: string): string | null {
  const parsed = parseGitignoreLine(rawLine);
  if (!parsed) return null;

  let body = parsed.body;
  // A leading slash counts as "contains a slash" for anchoring purposes,
  // so this has to be checked before it gets stripped below.
  const anchored = body.includes("/");
  if (body.startsWith("/")) {
    body = body.slice(1);
  }
  if (!anchored) {
    // Unanchored: git matches this at any depth, which minimatch only
    // does if we spell out the "any number of directories" prefix.
    body = "**/" + body;
  }

  body = escapeBraces(body);
  body = escapeExtglobTriggers(body);

  if (parsed.directoryOnly) body += "/";
  if (parsed.negated) body = "!" + body;
  return body;
}

/**
 * Converts a single minimatch pattern into the equivalent .gitignore line.
 * Throws when the pattern uses a minimatch feature with no gitignore
 * equivalent: extglob groups, brace expansion, or an absolute path.
 */
export function minimatchToGitignore(rawPattern: string): string {
  if (rawPattern.length === 0) {
    throw new Error("empty pattern");
  }

  let pattern = rawPattern;
  let leadingBangs = 0;
  while (pattern.startsWith("!")) {
    leadingBangs++;
    pattern = pattern.slice(1);
  }
  const negated = leadingBangs % 2 === 1;
  if (pattern.length === 0) {
    throw new Error(`pattern has no content after negation: ${rawPattern}`);
  }

  if (hasExtglob(pattern)) {
    throw new Error(`extglob syntax has no gitignore equivalent: ${rawPattern}`);
  }

  let directoryOnly = false;
  if (endsWithUnescapedSlash(pattern)) {
    directoryOnly = true;
    pattern = pattern.slice(0, -1);
  }

  let body = unescapeBraces(pattern);

  if (body.startsWith("/")) {
    throw new Error(`absolute glob patterns have no gitignore equivalent: ${rawPattern}`);
  }

  if (!body.startsWith("**/") && !body.includes("/")) {
    // A bare minimatch pattern only matches the exact top-level name, so
    // it needs an explicit anchor to keep that meaning in gitignore.
    body = "/" + body;
  }

  if (directoryOnly) body += "/";
  if (negated) body = "!" + body;
  return body;
}

/** Converts every line of a .gitignore file's contents into minimatch patterns. */
export function gitignoreFileToMinimatchList(fileContents: string): string[] {
  return fileContents
    .split(/\r\n|\r|\n/)
    .map(gitignoreToMinimatch)
    .filter((pattern): pattern is string => pattern !== null);
}

/** Renders a list of minimatch patterns as the contents of a .gitignore file. */
export function minimatchListToGitignoreFile(patterns: string[]): string {
  return patterns.map(minimatchToGitignore).join("\n") + "\n";
}

function endsWithUnescapedSlash(s: string): boolean {
  if (!s.endsWith("/")) return false;
  let i = s.length - 2;
  let backslashes = 0;
  while (i >= 0 && s[i] === "\\") {
    backslashes++;
    i--;
  }
  return backslashes % 2 === 0;
}

function trimTrailingUnescapedSpace(s: string): string {
  let end = s.length;
  while (end > 0 && (s[end - 1] === " " || s[end - 1] === "\t")) {
    let i = end - 2;
    let backslashes = 0;
    while (i >= 0 && s[i] === "\\") {
      backslashes++;
      i--;
    }
    if (backslashes % 2 === 1) break;
    end--;
  }
  return s.slice(0, end);
}

function escapeBraces(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      out += c + s[i + 1];
      i++;
      continue;
    }
    out += c === "{" || c === "}" ? "\\" + c : c;
  }
  return out;
}

function unescapeBraces(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length && (s[i + 1] === "{" || s[i + 1] === "}")) {
      out += s[i + 1];
      i++;
      continue;
    }
    if (c === "\\" && i + 1 < s.length) {
      out += c + s[i + 1];
      i++;
      continue;
    }
    if (c === "{" || c === "}") {
      throw new Error(`brace expansion has no gitignore equivalent: ${s}`);
    }
    out += c;
  }
  return out;
}

const EXTGLOB_TRIGGER = /(^|[^\\])[!+@?*]\(/;

function hasExtglob(s: string): boolean {
  return EXTGLOB_TRIGGER.test(s);
}

function escapeExtglobTriggers(s: string): string {
  return s.replace(/(^|[^\\])([!+@?*])\(/g, "$1\\$2(");
}
