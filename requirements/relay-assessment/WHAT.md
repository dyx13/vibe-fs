# relay-assessment — WHAT

## [001] 三问与 pairs

`review` 必填 `findings`，它是 `[(acceptance_criteria, work_plan), …]` 的数组。评审者先形式化目标状态、指出当前与目标的 GAP、判断 GAP 是否为空集；每个非空 GAP 对应一条 `acceptance_criteria`（目标状态的形式化）与一条 `work_plan`（弥合该 GAP 的工作计划）。`findings` 为空数组表示 GAP 为空集、目标已达成。可选字符串 `note` 只作文本说明，不返回或参与其他行为。不得缺项、增加未知字段、使用数值或总评分。八维——语言与算法、简单性、结构、粒度、测试与事实、逻辑可靠性与边界、调用方使用体验、完整性——只是找出 GAP 的观察抓手，不是必填评分。

## [002] 同任一次评估

每个 IncumbencyId 至多一个 semantic AssessmentId。身份、binding、snapshot、authority、findings 全部相同的重放幂等返回原结果；同任第二次不同评估返回 AssessmentAlreadySubmitted，同 ToolCallId 异载荷返回 AssessmentReplayConflict。不得覆盖首次结果或跨任期重放。

## [003] 精确证据绑定

Accepted assessment 绑定 Road、Incumbency、WorkspaceSnapshot 与 AuthorityRevision，以及 PhysicalUserMessage、ProviderRun、ToolCall 和同一 assistant message 中调用前公开评审文本的摘要。隐藏 reasoning 与调用后文本不属于评审证据。

## [004] 非空 findings 即修复义务

findings 非空即不通过；每条 finding 直接定义一项修复义务，空 findings 不产生义务。义务从唯一 findings 集合查询，不另存第二份状态。AssessmentCommitted 同时确立 WorkOwned；后续账目推进属于执行行为。

## [005] 末任收尾

findings 为空时本任即成为末任，生成证书并立即失去开新工作的能力：只能读、清理和 suicide，明知后继无人，负责把工作收口。证书仍记录 assessment、root request digest、requirement set digest、narrative digest、evidence frontier 和 target horizon，供历史与发布门使用，但不再以「证书有效期间禁止新任」约束后继；运行时一致性由流程与 fast-check 承担。

## [006] 禁止同任自证

Assessment 一旦 accepted，本任永久失去 review 能力。修复质量由下一任独立评估，不得通过第二 review、reverify 或 challenge 自证。

## [007] 拒绝不占名额

Schema、范围、narrative 或精确 binding 校验失败不得写入 assessment 或消耗本任名额。提交取当前最新工作区快照；同 idempotency key 的异载荷须拒绝。

## [008] 信息时域隔离

评审前只提供当前独立只读评估要求，不泄露低分接责、满分退场或后继循环。评审后恰好选择一条指令：findings 非空为修复，findings 为空为关闭退场。`manager-assess`/review 描述与 `manager-work`/`manager-finish` 的可见时机必须遵循此边界，循环机制不进入 provider 文本。

## [009] 独立调查

Manager 可亲自使用评审专用只读工具，也可委派只读 Engineer 建立事实；评审期不得修改评估对象。findings 由当前评估者基于当前快照独立作出，实现者或 DevOps 的报告只作待核查线索，不代替调查或决定 findings。

## [010] 改动使旧证据过期

DevOps 验证可包含其角色授权内的非架构源码修复，不得假定其只读。工作区改变后，旧测试结果与评估不再代表当前工作区；发布门仍比对当前快照与评估快照，退休匹配仍要求当前证书。不再以「快照一变旧评估立即失效」在运行时阻断评审与收口；并发一致性由流程与 fast-check 承担。
