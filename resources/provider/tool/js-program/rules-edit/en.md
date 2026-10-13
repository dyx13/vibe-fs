## Editing existing files

### Default: {{editCall}}

Use edit() when you can state both the current text and the final text. It reads one immutable
snapshot of the existing UTF-8 target, plans every change against that same snapshot, and stages
at most one Rewrite intent. It never writes immediately.

Canonical shape:

```js
this.edit({{editTarget}}{
  find: "const timeout = 1000;",
  put: "const timeout = 5000;",
});
```

changes may be one object or a non-empty array. Each canonical change is
{ find, put, all? }:

- find: a non-empty string or a non-zero-width RegExp describing current text.
- put: the complete final text for that matched span. It is always a string.
- all: false by default. Omit it for exactly one match; use true only when every exact,
  non-overlapping match should receive the same put text.

The four common forms are deliberately mechanical:

```js
// Replace one exact span.
this.edit({{editTarget}}{
  find: "const timeout = 1000;",
  put: "const timeout = 5000;",
});

// Insert after an anchor: repeat the kept anchor in put, then add final text.
this.edit({{editTarget}}{
  find: 'import { load } from "./load.js";',
  put: 'import { load } from "./load.js";\nimport { save } from "./save.js";',
});

// Delete: put is the empty string. Include the newline when deleting a whole line.
this.edit({{editTarget}}{
  find: "const obsolete = true;\n",
  put: "",
});

// Replace every exact occurrence. all, not the RegExp g flag, owns multiplicity.
this.edit({{editTarget}}{
  find: /\boldApi\b/,
  put: "newApi",
  all: true,
});
```

Put independent changes to one file in one call:

```js
const report = this.edit({{editTarget}}[
  { find: "const timeout = 1000;", put: "const timeout = 5000;" },
  { find: "const retries = 2;", put: "const retries = 3;" },
]);
// report = { path, changed, operations, replacements }
```

All changes address the original snapshot, never text produced by an earlier array element. Thus
the second change cannot find text created by the first. Changes may appear in any order when their
original spans do not overlap. If two changes overlap, merge them into one change that states the
final text for the combined span.

Exactness and line endings:

- String find is exact. A consistently-CRLF file may be quoted with normal LF newlines; edit()
  restores CRLF in the result. Mixed line endings remain byte-exact.
- RegExp flags such as i, m, s, u, and sticky y are preserved. g does not choose multiplicity;
  all does. A sticky RegExp starts at offset 0 in the immutable snapshot.
- put is literal final text, not JavaScript replacement syntax. `$1` is written as `$1`; for
  capture-dependent or computed output, compute the complete text in JavaScript and use rewrite().
- oldText/newText and search/replace are accepted as unambiguous recovery aliases, but always author
  new code with canonical find/put.
- Unknown fields and exotic change objects fail INVALID_EDIT instead of being ignored. This catches
  misspellings such as `al: true` before they can silently change multiplicity. Declaration shape is
  validated before the target is read, so a malformed change is not masked by a path failure.

Failure is conservative and copy-oriented:

- INVALID_EDIT: wrong shape or types. Use { find, put, all? }.
- EDIT_NOT_FOUND: zero exact matches. The reason includes current numbered context near the closest
  string candidate and, only when confidence is conservative and unique, a copy-ready corrected
  change. The corrected find is an exact current subspan, not an approximate whole line. That
  suggestion repairs find; it is never applied automatically.
- EDIT_AMBIGUOUS: more than one match without all: true. The reason lists candidate lines. Add
  surrounding text that only the intended location has, or set all: true only when all are intended.
- EDIT_OVERLAP: planned original spans overlap. Merge them; array order is never a hidden priority.

Every one of these failures occurs before this edit call stages anything. Near matches are useful
diagnostics, never permission to mutate. A successful no-op returns changed: false and stages no
write. Diagnostic windows and copy-ready payloads are bounded; a huge line or put cannot turn a
normal mismatch into an oversized failure. Because one program may mutate a path only once, do not
call edit()/rewrite() twice for the same path.

### Advanced escape hatch: {{rewriteCall}}

Use rewrite() when the final file is computed, reordered, generated, or otherwise cannot be stated
as a few independent exact spans. newText is the complete resulting file, not a patch. The target
must already exist or the call fails FILE_NOT_FOUND. The call stages one Rewrite intent; it does not
write immediately. Build and validate the complete newText in memory, then call rewrite() exactly once.
