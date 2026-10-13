# Tool · ask

Synchronously delegate an investigation intent to this task's bound fixed DevOps, wait for completion, and receive its complete work record back.

## Contract and Usage

1. **Fixed Binding**: the system delivers the intent to this task's single fixed DevOps instance; you pass no ids, roles or models.
2. **Read-only Investigation**: the DevOps investigation includes real bash execution; read-only discipline is carried by its office prompt, not by a runtime gate. You are buying facts, not changes.
3. **Verbatim Return**: the DevOps lifecycle work record returns complete; the system never summarizes it a second time. The material carries no low-level session identifiers.
4. **Single Pending**: at most one pending `ask` per task. Further calls while one is in flight are rejected with a typed error.
5. **Synchronous Wait**: the call waits for this investigation to finish. Failure or a busy DevOps returns an explicit error; nothing is silently dropped and no replacement operator is created.

Asking the user is not this tool: when you need user input, simply stop naturally and wait for the next prompt.
