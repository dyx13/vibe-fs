For ordinary edits, start with edit(path, changes).

Decision ladder:
1. For one exact replacement, insertion, deletion, or repeated replacement, use edit().
2. Put every independent change to one file in one edit call per path, using canonical
   { find, put, all? } changes.
3. Set all: true only when every exact occurrence should change.
4. For computed, reordered, or generated whole-file output, use rewrite(path, newText).

Near matches are diagnostics, never write authority. edit() stages only after exact, unambiguous,
non-overlapping hits. A failed edit stages nothing and tells you what current text to quote next.
