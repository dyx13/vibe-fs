# relay-incumbency — WHAT

## [001] 唯一活跃任期

Road 承载根用户需求，Incumbency 是一次 Manager 逻辑任期。同一 open Road 至多一个 active 任期。并发 opening 从前任 RetirementId 派生同一确定身份；精确事实重放只产生一个逻辑任期和一次 manager-loop prompt，身份或载荷冲突须拒绝。

## [002] 统一 Opening

首任与后继都以同一 `IncumbencyOpened(IncumbencyId, WorkspaceSnapshotId)`、authority 校验和 AuditPending 起点开启，不按规划、T1 或序号另设状态机；首任同时建立 Road。Relay 只表达不可变领域事实，phase 仅作诊断，不作为跨模块程序计数器或效果选择接口；执行次序由 structured-workflow-003/004 的 owner 工作流掌握。

## [003] 能力与任务分开

任期开启即具备完整 Manager 管理能力，包括工作记忆、规划和委派；评审前尚未承接实现任务。信息隔离遵循 relay-assessment-008。

## [004] 评估者原位接责

含任一 REVISE 的 AssessmentCommitted 在同一事实转换中记录评分、确定对应修复义务并确立 WorkOwned，精确重放不重复派生。当前评估者负责修复，不创建返工链或新任期，也不由外部 phase 调度器推进执行。

## [005] 退休不可逆

已退休任期不得因重放、恢复、rebase、冲突或 Host crash 复活；继续工作只能开启新 IncumbencyId。每次 retirement cut 的 stale provider-run 身份永久累积，跨后续任期的迟到观测也不得触发 ordinary repair 或 continuation。

## [006] 退休结果

每次退休原子提交退休身份、任期、快照、authority revision、精确 provider-run/tool-call cut 与唯一结果 `Continue | Accepted certificateId`。Continue 保持 Road 的 LogicalRun 开放并自动续发；Accepted 关闭本任，证书有效与否都不再阻止普通 ContinueLoop 开启新任。两类后继均保留完整物理历史；LatestRetirement cut 只识别 stale 请求，不过滤历史。

Continue 携带退休时快照，可不同于评审快照；Accepted 不再要求退休快照精确匹配评审或证书快照。循环信号只从 outcome 派生。物理 SessionId 可复用，逻辑任期和 provider context 必须重开；循环决策与派发由 Manager owner 掌握，不得内联在 composition root。

## [008] 证书只作历史

AuthorityRevision、WorkspaceSnapshotId、requirement digest 或 target/base horizon 变化不再触发运行时失效或阻断后继。证书仍记录评估事实与 target horizon 供历史与发布门使用；后继一律按普通 ContinueLoop 独立评估，不因旧证书有效而被拒。

## [009] 权威修订

活跃任期接纳追加需求，须在同一 durable update 中绑定 expected previous revision、精确任期、新 revision、实际 accepted authority message 和新快照，原子推进 Road/任期并使旧证书失效。精确重放幂等，旧 revision、错误任期、冲突重放或退休目标均拒绝；普通 continuation 不构成修订。

## [010] 固定 DevOps 控制权

每条 open Road 只有一个逻辑 DevOps，当前有效 Manager 持有其 resume、join、horizon 控制权。交接时新任取得调用权，退休或失效的旧任立即失去新派工与调用权。

## [011] 跨任期执行连续性

固定 DevOps 的执行事实、终端状态、环境和未决后台进程跨任期保留；assignment 与进程始终有明确 owner，完成记录不得丢失或误归新任务。故障可替换物理会话，但同一逻辑 DevOps 不得同时拥有两个可执行权威。

## [012] DevOps 绑定幂等

Road 首次绑定一个逻辑 DevOps 后持久化，之后只可 resume，不可 fork 第二个。初始化、晚到结果、接收未知和崩溃恢复均保持唯一性与幂等；接收未知保留原 PromptKey 和恢复权，不盲目重发或重建。不支持并发 Manager 共享 DevOps。

## [013] 任期序号

序号只按 committed opening 计数：首任为 1，精确重放不增加，provider 请求、nudge 和恢复不改变，无 active 任期时不可读。中英文评估请求须告知序号及“前任可能做过或完成工作，以本任调查为准”。序号只作介绍，不决定执行分支或恢复。
