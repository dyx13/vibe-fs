# 222 Long Stroke readonly declaration drift

Input: 222c3b29a6e7f599e648542a761b4ec562962917. Repository remains unchanged. These drafts have not been applied or executed; the physical red receipt is independent-e2e.log:30–34.

Apply long-stroke-readonly-tests-red.patch first using apply_patch. Build through the normal Fable entry after unfreezing input, then run numbered 014 at the ordinary tier to retain the formal assertion failures. Its first new assertion requires the current registered language resource and exact registered readonly tool map to select strength-readonly-replica.0; the old scenario has no such match. The second regression also reaches that failed boundary before calling the new binder, so missing binder is not substituted for the actual red cause.

After preserving red, apply long-stroke-readonly-scenario-green.patch. Both files contain apply_patch-format patches, not git diff patches. They are review drafts, not claimed green receipts.

## Cause and minimal boundary

The physical request lastUser is the current delegation/readonly-investigation resource and its only tool is js-predictor. Strength/Replica/Runtime.fs bootstrapDetachedSend renders that resource; Transform.fs withContinuationTurn appends the same resource after an assistant-ended mirror/completed batch. StrengthReplicaTools.exactReadonlyHostToolMap denies all and admits only js-predictor. Registered LanguageSurface.replicaConstraintFor and StrengthSurface.exactReadonlyHostToolMap expose those current contracts without test-only API.

The two old replica declarations incorrectly expected the owner's original prompt to remain last user, native read to be callable, and the second replica request to retain semantic step 1. Both current replica situations instead share the same last user and tools. Two rewritten identical declarations would be ambiguous; fresh closing user turns also reset semantic step to 0.

The draft therefore merges the two obsolete matchers into one strict canonical declaration. It retains both physical cases: the estimate-2 normal owner, real probe then plain-text early end; the estimate-1 recovery owner, real probe then N+1 refused before send, with its original owner 500 retry. The original provider-retry continue.0 matcher and the exact 400 consecutive-failure pair remain unchanged.

The existing consume-binder pattern chooses only this request's response. It reads callId-paired js-predictor results from the current body and requires actual probe material; it has no delivery counter, session cursor, inferred owner label, or matcher fallback. Repeated identical requests choose identical responses. The file is read through this.file('large_probe.txt').text('^', '$'), not fabricated marker output.

Existing exact two Bound facts, [1,2] replica requests, [3,4] owner requests, two owners' actual returned material, capacity, fault, model target and protocol oracles remain. The draft strengthens tools to exactly ['js-predictor']; it proves the preflow first request precedes its own result and the second contains exactly one completed probe; exactly the normal owner must later receive the actual plain-text early-end body.

## Inventory of all internal declarations

| Declaration | Current source/contract | Assessment |
| --- | --- | --- |
| protocol-repair | Enforcer/Repair.fs RepairInstruction starts Protocol repair through LlmFacing.renderInstructions | Prefix remains current. No change. |
| orch-join-guard | runtime/background-join/en.md, orchestrator commission/horizon/join surface | Resource prefix remains current. No change. |
| manager-t1-commitment | Old account-not-ready text has no current source/resource producer found; relay-incumbency WHAT rejects a separate T1 phase | Retained as old internal declaration in this narrow draft; no evidence receipt may rely on it. Current manager-work path is separately verified. Do not claim this stale inventory item has been cleaned. |
| manager-reopened-loop | runtime/manager-assess/en.md, Manager.Workflow assessPath | Current resource retains both ordered fragments. Registered-resource regression added. |
| manager-join-guard | runtime/background-join/en.md, Manager surface | Prefix remains current; registered-resource regression added. |
| continue | runtime/provider-retry/en.md | Remains current; this request is not its replacement. Registered-resource and exact 400 pair regression retained. |
| manager-current-action | runtime/manager-work/en.md, Manager.Workflow workPath | Prefix remains current; registered-resource regression added. |
| engineer-resolve | Exact charge created by existing bindManagerLoopSequence fork response; OfficeCapability Engineer still includes Write and Read | Harness-owned assignment remains current. No speculative JS-only conversion. |
| blogger | Registered Companion ProjectionSurface normal/squash/newWork instructions | Already corrected in 222; existing current-production regression retained. |
| strength-canary-owner | Exact preFlowCanaries prompt, Manager js-manager | Harness-created owner remains current. No change. |
| strength-canary-replica | Production readonly resource and exact js-predictor | Confirmed obsolete matcher/tool/step assumption, merged as described above. |
| strength-recovery-replica | Same production readonly resource and exact js-predictor | Same confirmed drift, same matcher merge; physical recovery case retained. |

## Remaining boundaries

- No repository changes or tests were run by this read-only task. Red/green counts, eventual physical acceptance and resource cleanup must come from the parent run after applying and freezing the new input.
- This Long Stroke has two fresh replica owners, not multiple resident decisions on one owner. The response binder is scoped to this fixture and is not evidence for resident reuse or old decision material isolation; the separate resident-predictor formal integration remains the authority.
- The original large probe fixture is preserved. Marker survival alone does not prove actual truncation occurred through the new JS tool path; do not report a new truncation receipt without inspecting the genuine result.
- The old manager-t1-commitment declaration is an identified stale inventory item; it is not removed to make this physical case pass.
- durable-events/022 nested Fable/MSBuild failure and full integration throughput remain unknown/unresolved. Nothing in these scenario patches diagnoses or closes them.
