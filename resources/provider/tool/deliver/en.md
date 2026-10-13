# Tool · deliver

End the current incumbency. The behavior branches on authority: without authority it is a relay; with authority it is the delivery.

## Contract and Usage

1. **Precondition**: the incumbency must hold no live blocking resources (a pending `ask`, background work, unsettled tool calls). With blockers present the call is rejected with a blocker summary; settle them first.
2. **Relay (No Authority)**: retires this incumbency and opens the next one at the same stage. Relay does not advance the stage and produces no review. The next runner starts again from `U`, `LWR_prev` and `P`.
3. **Delivery (With Authority)**: after confirming `P` is non-empty, starts a parentless Manager execution session with the full text of `P` as the init prompt, records the delivery digest and path, and presents the receipt to the user. Planning and execution separate here.
4. **Terminal**: after delivery the task is complete; no further model is invoked. Further action only follows a user reprompt and a reopen.

Delivery is forbidden while `P` is empty or missing; the delivery path is forbidden without authority.
