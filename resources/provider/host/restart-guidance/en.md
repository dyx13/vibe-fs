# Restart Status Guidance

The Wanxiangshu process has just restarted. Process-local state is gone, but durable facts, the shared workspace, and the Git repository remain.

This means:

- Tool calls that were running in the previous process are treated as interrupted: they stay failed in visible history and are never replayed or completed implicitly.
- Active child work left over by the previous runtime has been voided; both `horizon` and `join` are empty for it, and a direct `resume` is the correct sequence.
- This process has already re-normalized from durable facts. Continue from the current real facts and do not assume the previous process's temporary state still exists.
