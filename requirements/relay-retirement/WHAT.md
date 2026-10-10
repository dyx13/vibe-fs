# relay-retirement — WHAT

## [001] 正常退出

正常 assistant stop 不构成退休；模型正常退场只由 accepted suicide 产生。权威撤销、session 删除、fatal 和 provider capacity exhaustion 是独立异常终态，不伪造 suicide。

## [002] 评级前提

Suicide 前须提交 assessment；尚未提交时返回先调用 review 的明确提示。提交后，REVISE、测试失败、未结义务、dirty 或 unmerged 工作区均不得成为退场阻塞项。

## [003] 资源阻塞

唯一业务 blocker 是当前任期直接或递归拥有的 live child、background job、PTY/process、active tool、side-effect/execution lease、同步 descendant provider work，以及尚未观察到 terminal 的 cancel/join。跨任期道路资源按 [009] 处理。

## [004] Freeze-before-check

先冻结本任新工作准入，再读取精确递归 ownership。冻结前已接受资源须纳入检查，冻结后创建须被 fence 拒绝。Fence 绑定 IncumbencyId，不随复用 SessionId 传给后继；阻塞时只恢复本任清理能力，不恢复新工作准入。

## [005] 两段式结束确认

正常退休须经两次 `suicide` 调用。已提交 assessment 后，第一次调用不退休：它返回本任评审承诺（`findings` 的 `(acceptance_criteria, work_plan)` 对）与尚未消费的 `DeferredWork` 待办，供调用方核对，并追加 durable `RetirementConfirmationCommitted`。同一精确 `(providerRun, toolCall)` 的重放幂等返回同一确认；同一 `toolCall` 的异 `providerRun` 拒绝。第二次以不同 `toolCall` 调用才进入正常退休流程，资源阻塞检查在此时进行。确认不解除义务、不改变 office 权限，也不构成退休。

## [007] 原子退休

同一 durable transaction 提交不可逆退休事实与闭合记录：任期、快照、authority revision、精确 provider-run/tool-call cut 和 `Continue | Accepted certificateId`。崩溃后不得永久处于已退休但缺 outcome/cut 的状态；循环信号仅从 outcome 派生。

Continue 保持 Road 的 LogicalRun 开放，并将退休时快照交给后继，可不同于评审快照。Accepted 仅接受属于本任、有效且匹配评审/退休快照的证书；两类 authority revision 均须等于当前 revision。CleanupBlocked 的通过任期可在清理后重试 Accepted。证书有效时禁止后继，显式失效后可普通重开。

退休出清本任义务，新任按最新物理世界与输入建立自己的义务。系统不再维护同 session 持久认知画板；历史上下文是否 raw/LWR 由 context-compression 的 todowrite checkpoint 决定，不构成义务继承。

## [008] 物理中断边界

Suicide 工具体只提交退休并返回，不执行 session 级 interrupt/abort。两种 outcome 的退休后请求均在 transform 边界按精确 cut 与 manager-loop gate 身份拦截：清空旧请求、释放其 exact provider-step admission，并等待旧 attempt 中断完成。Continue 才自动派发后继；Accepted 不自动派发，显式证书失效后的普通重开仍使用 LatestRetirement cut。

不得在后继派发后补发旧任的 session abort。迟到旧 run 身份由 durable cut 识别，退休者失去工具权；历史完整保留给后继，既不复活旧任，也不结束承载 Road 的 active authority。

## [009] 道路资源交接

Continue 只注销旧 Manager 的派工/控制租约，固定 DevOps、已接收工作及其持久后台进程继续运行，保留给后继接管，不得隐式孤儿化或强制销毁。Road 最终关闭、Accepted 终结或致命异常时，按资源责任规则完成物理收束；不得遗留无主资源或假定并发 Manager 分身。
