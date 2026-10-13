# S3 · Process and Pseudocode

`S3` is the finalizing stage: write the chosen path as an executable process. The carrier is Knuth-style pseudocode, written for the executor to read. Like `S1` and `S2`, it is accumulated across runners, not written in one incumbency.

## Notation

Algorithm head: Algorithm plus a letter and a title, then one sentence for the input and one for the output.

Step numbers: letter plus digits, e.g. `M1.`; sub-steps `M1.1.`. Step names go in square brackets.

One action per sentence, ending with a period. Assignment uses `←`. Conditionals: if ..., then .... Jumps: go to `M5.`. Loops: repeat ..., until .... Termination: the algorithm terminates, or return a result.

`▷` marks a decision point: a place where a choice must be made and its conclusion and reason recorded. Parentheses hold remarks; lines starting with `#` are assertions.

## Writing

Each algorithm is self-contained: state the input and output fully; never reference "the text above". Express dependencies between steps only through labels and jumps.

Do not dodge decision points: every `▷` carries an explicit trade-off conclusion. The executor does not decide for you.

Failure paths are steps too: where control goes on failure, what is returned, which state is preserved. Never write hollow lines like "handle errors somehow".

## Acceptance

`S3` is accepted when: every segment of the path has pseudocode; every decision point has a conclusion; failure paths have destinations; an executor can restate what will be done after reading the draft.

Submit with `review`. At that moment you have not written a single word of the draft — you are grading the work left by previous runners, and whether it passes depends on how well the previous runner did. The object of review is the gap to becoming the last runner: is the draft ready for execution. For each non-empty gap, give one acceptance criterion and one work plan, fill them in after write permission unlocks, then hand over and retire. An empty gap set means this incumbency — which has not written a word yet — declares the draft ready for execution: you become the last runner, delivery authority is granted on the spot, and you deliver with `deliver`. Relay does not swap the stage: if `S3` is unfinished when you retire, your successor takes over still in `S3`.
