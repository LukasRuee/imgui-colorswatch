/**
 * Minimal glob-to-regex conversion supporting the subset of patterns needed
 * for `imvec4Color.detectRanges` (e.g. "**\/*.cpp", "src/**\/*.h"). Not a
 * full minimatch replacement, but avoids pulling in an extra dependency for
 * a handful of simple file-extension globs.
 */
export function globToRegExp(glob: string): RegExp {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // "**" matches across path separators, including zero directories
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++; // swallow the following slash
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  re += "$";
  return new RegExp(re);
}

export function matchesAnyGlob(relativePath: string, globs: string[]): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return globs.some((g) => globToRegExp(g).test(normalized));
}
