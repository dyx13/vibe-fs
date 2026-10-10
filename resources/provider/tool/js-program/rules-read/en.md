file(path, matches = []) reads this transaction's immutable UTF-8 snapshot,
optionally resolves ordered anchors, and returns an immutable FileView.

matches is Array<[beginAnchor, endAnchor, pattern]> where pattern is a non-empty
string or a RegExp. Anchors are position names, not the matched text.
Every FileView has built-in anchors ^ (file start) and $ (file end). Do not
declare ^ or $ as custom names.

Ordered matching: each pattern is searched from the current cursor; after a match,
cursor = match.end. Duplicate source text does not need to be globally unique.
Caller RegExp g/y flags and lastIndex are ignored; matching uses its own forward
search. Zero-width RegExp is allowed (begin offset may equal end offset); begin
and end names must still differ.

Anchor declaration refusals: empty names; reserved ^/$; duplicate names; begin == end
in one declaration; empty string pattern. Pattern not found in declaration order fails.

file.text(from, to) — default text(from = "^", to = "$") — returns the exact original
substring between two resolved anchors. String pattern content must be non-empty.
Reverse slices fail. FileView is immutable: rewrite() does not change a previously
returned view.

from/to may be a declared name, ^, $, or a temporary shift name+N / name-N
(example: h1+200, h1-40, $+0). N is a JS string index delta — the same unit as
String.length / slice — not a line number and not a UTF-8 byte count.
file_len is source.length. Shifts are not stored. If the full string is a
declared name, that exact name wins. Otherwise the last [+-]digits is the delta;
the base name is resolved recursively. The resulting caret is clipped to
[0, file_len] inclusive, so $+N and ^-N stay at EOF / start.

Recommended workflow:
1. Declare the minimal begin/end anchors needed to locate spans (read or edit).
2. Let Host resolve those positions.
3. Read with text(from, to). Adjacent headers make a body slice:
   text("h1end", "h2"). A window around a hit is text("h1", "h1+200")
   (200 string indices, not 200 lines).
4. For edits, build the complete resulting file from text(...) slices plus new content.
5. Use indexOf / replaceAll only when anchor-and-splice is genuinely inconvenient.

I have already paid for this mistake. I once treated a roughly 8k lines file
reorganization as manual string surgery: indexOf, substring, then join. One run
turned it into roughly 31k lines. The ugly part was not one bad output; I then
spent more calls guessing at the damage, using grep to stare at repeated
headings and replace to scrape away leftovers. grep was finding candidates, not
owning structure. The generated API had already given me an immutable snapshot,
ordered anchors, and exact text() slices; by calculating the boundaries myself I
threw those guards away and recreated the bugs they exist to prevent.

So when the job is structural — keep these spans, drop those spans, reorder these
sections — declare the structure first, then splice only the slices that belong
in the target file. Do not make "load everything, then keep deleting what looks
wrong" your default plan. Raw string search is useful inside a known slice; it is
not a reason to reimplement structural location.

Do not let familiarity impersonate facts. indexOf feels "simple" because you
have seen it thousands of times; that familiarity says nothing about whether it
owns this file's structure. The primitive with the stronger contract gets the
presumption. The lower-level technique carries the burden of proof.

Prefer:
  f.text("^", "begin") + "newString" + f.text("end", "$")
