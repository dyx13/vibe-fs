# 2026-10-08 read-only diagnostic and Git batch review

No repository changes, test/build runs, cleanup, or compiler re-execution were performed. The only external fetch was the public Fable source file pinned by the installed package's PDB and nuspec, saved under `/private/tmp`.

## Confirmed Fable evidence loss

The installed `Fable@5.13.0` nuspec and `fable.pdb` SourceLink both identify upstream commit `234f19b2632d1fb0e9f773dbf9f042c55b1f4bc9`. Its [MSBuildCrackerResolver.fs](https://github.com/fable-compiler/Fable/blob/234f19b2632d1fb0e9f773dbf9f042c55b1f4bc9/src/Fable.Compiler/MSBuildCrackerResolver.fs#L63-L70) reads nested MSBuild stdout and stderr, waits for exit, and on a nonzero result throws an exception containing only stderr. The actual exit code and captured stdout are omitted. This is a concrete explanation for the missing diagnostics, not an explanation for the actual failing MSBuild operation.

Local preserved source `/private/tmp/vibe-fs-oct8-fable-5.13-MSBuildCrackerResolver.fs`, SHA256 `12bcb3d6fd06d084e3db1d651d63f7d46e79f560500c3587fa45c61df70a9fbc`. Installed PDB SHA256 `b7ec9753a0d426fb4f25efd06896b2eca1cba70e92c3567f217d8566d239bc93`.

This repository's `scripts/lib/owner-compile.mjs:1481–1486` already returns outer Fable code, signal and both streams. The failing durable-events/022 positive assertion prints only the streams, omitting existing code/signal/elapsed/project identity. The smallest local diagnostic improvement is to print those existing fields along with both complete streams when a compile fails. It does not recover nested stdout that Fable already discarded.

Existing formal coverage at `requirements/structured-workflow/tests/012.test.mjs` under the failure lifecycle test injects a real process-shaped EventEmitter and checks exit codes and cleanup. Extend that test with split stdout/stderr chunks and a signal outcome, asserting the exact retained streams, status and cleanup. No compiler startup is needed for these boundary tests. A small shared failure assertion can be tested with a controlled failing result so that code/signal/streams appear in the actual thrown assertion, while retaining every positive and negative compile assertion.

To retain actual nested MSBuild stdout, capture it during the original nested invocation; it cannot be reconstructed afterward by the outer Node helper. The smallest upstream fix is to include nested exit code, stdout and stderr in Fable's existing nonzero exception branch. An updated selected artifact would need its own explicit package identity. A local exact-bound launcher that tees the original nested process could also capture it, but adds PATH/tool-selection and process-ownership concerns; it is a separate change requiring formal actual-process proof, not a harmless message tweak. Neither repeated compilation nor a diagnostic-only second MSBuild run proves the original failure.

The original durable022 cause remains unknown: the log proves the positive journal-outcome-contract compile failed, but contains only MSB4011 warnings from nested stderr. It does not prove warnings-as-errors, resource contention, an OOM, a timeout or an architectural compile error.

## Confirmed Git batch capture limit

`scripts/lib/verification-source-candidate.mjs` calls `execFileSync` with a fixed `256 * 1024 * 1024` capture limit, then collects all unique blobs through `cat-file --batch`. The current physical016 log reports `spawnSync git ENOBUFS` at that exact batch call. Parent's preserved selected-tree accounting gives 346865632 unique blob bytes, exceeding the 268435456-byte limit before protocol headers. This is a concrete failed precondition; increasing the arbitrary limit is unnecessary.

The proposed minimal repair is sound: preserve the synchronous public API and current complete parser, direct only batch stdout to an exclusively opened owned spool fd, close it, reopen by path to read from offset zero, remove it, then retain all existing header, requested-id, object-hash, exact-trailer and reconstructed-tree checks. All other Git calls retain their current pipe behavior.

Keep the spool out of selected ordinary paths. Move the existing `git init` into the beginning of the already-owned source-root try, and place the exclusive spool inside its fresh `.git` namespace; selected entries already forbid every case-insensitive `.git` segment. Remove the spool before captured inventory. Child writes advance the shared fd offset, so reading the same fd directly without positional reads would incorrectly see EOF. Closing first and reading by pathname avoids that bug. Close before root disposal on any failure, preserve the original error, and preserve both causes through the existing AggregateError path if cleanup also fails. Numeric Node stdio fds avoid shell or platform-specific `/dev/fd` assumptions.

Formal016 red/green can use one isolated Node child with an `execFileSync` hook and `syncBuiltinESMExports`. Build a real Git fixture with one 4KiB binary blob; change only the actual batch call's maxBuffer to 1024, preserving stdio. The existing implementation fails with ENOBUFS; fd stdout must succeed with exact bytes, tree, executable mode, entry SHA256, revalidation and empty parent after disposal. A second child-hook case throws a unique sentinel during batch admission and verifies identical error plus complete private-root cleanup; optionally verify an observed fd is closed with EBADF. No production test-only cap option or 257MiB fixture is needed.

The proposed repair still reads the whole spool into memory. It closes the proven child-process capture limit, not overall memory bounds or integration throughput. Metadata command limits, disk capacity and RAM remain separate boundaries.

Do not conflate the two failures. Repository npm/NuGet/Fable tests under016 all prepare a Git candidate and can share the ENOBUFS precondition. Durable022 directly materializes a workspace closure through owner-compile and does not call prepareGitSourceCandidate. Git spooling does not explain or close its original ProjectCracker failure.
