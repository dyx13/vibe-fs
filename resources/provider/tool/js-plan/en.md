The programming surface for the planning draft `P`. `P` is the only file this tool can read or write. The system binds its path. `file`, `edit`, and `rewrite` take no path argument; a path argument fails with `PATH_DENIED`.

This surface has no glob, no grep, and no access to repository files. For repository facts, use `ask`.

In each incumbency, `js-plan` is strictly read-only until this incumbency calls `review`. An `edit` or `rewrite` before that call is refused and tells you to call `review` first. After `review`, writing is unlocked. A relayed successor incumbency is read-only again until its own `review`.
