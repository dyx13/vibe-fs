# planning — WHAT

## [001] 目标状态形式化与三样输入

当 Plan 模式会话被初始化或任期推进时，系统为该任期装配输入。

- 允许后果：跑者接收且仅接收三样输入：本规划任务范围内的全部真实用户输入原文（`U`）、上一任期的工作记录（`LWR_prev`，由 `LifecycleWorkRecord.materialize` 且 `includeOpening = false` 渲染；若为首任则此项为空）、以及通过编程面读写的 Markdown 伪文件（`P`）。
- 禁止后果：模型不得直接读写或篡改 `U` 与 `LWR_prev`。`P` 不得作为文本直接注入模型输入消息集。模型不得取得任何超出 `P`之外的仓库或工作区写权限。
- 失败后果：若输入集合包含未经任期剥除的上下文或遗漏必需事实，系统必须在消息投影阶段拒绝生成请求并终止本次调用。

## [002] 角色与严格权限投影

当调度器识别到 CanonicalRole 为 `Plan`（Wire 标识为 `plan`）时，系统投影其专属权限与工具集。

- 允许后果：Plan 角色且仅限 Plan 角色被赋予四个专属工具的访问权限：JS 编程面 `js-plan`，以及编排面工具 `ask`、`review`、`deliver`。`review` 与 Manager 共用同一工具名与同一语义（见 [022] 与 relay-assessment）。
- 禁止后果：Plan 角色禁止获得代码仓库与执行工具的权限，包括但不限于 `read`、`glob`、`grep`、`edit`、`write`、`mv`、`rm`、`run`、`open-terminal`、`send-terminal`、`read-terminal`、`signal-terminal`、`fork`、`fission`、`suicide`、`commission`。严禁向 Plan 开放任何真实 shell 或命令执行通道。`resume` 与 `handoff` 不再属于 Plan 的工具面。
- 失败后果：任何越权工具调用必须在 `ToolRegistry` 执行门禁被直接拦截（fail-closed），返回强类型拒绝错误，零副作用。

## [003] 七条轮换事实与持久化重放

Plan 的轮换生命周期完全由七条不可变 Durable 事件驱动并投影状态。

- 允许后果：状态机仅通过以下七条事件进行投影更新：
  1. `PlanWorkOpened(workId, root)`：标记规划任务开启与根路径绑定。
  2. `PlanDevOpsBound(workId, devopsId, target)`：绑定唯一的固定 DevOps 实例。
  3. `PlanIncumbencyOpened(workId, incumbencyId, stage, openingCursor)`：开启新任期并标记当前阶段。
  4. `PlanIncumbencyRetired(incumbencyId, outcome)`：标记任期退休，outcome 仅限 `Relayed` 或 `Delivered`。`Relayed` 表示接力退休（任期让位于下一任），`Delivered` 表示终态交付退休。
  5. `PlanDelivered(incumbencyId, workId, digest, path, execSessionId)`：标记终态交付，记录摘要、路径与交付时启动的执行会话（见 [023]）。
  6. `PlanReviewed(incumbencyId, stage, outcome)`：记录本任的 review 裁决，outcome 仅限 `Promoted`（晋级或授权）或 `Stayed`（留任原 stage）。
  7. `PlanReopened(incumbencyId)`：把已交付的工作回滚到 active 状态（见 [021]）。
  同一事件的重复重放必须保持幂等。
- 禁止后果：同一 workId 同时至多一个活跃任期（`Active`）。已退休任期列表（`Retired`）只增不减。`PlanReviewed` 每任至多一条；已评任期不得再次评。`PlanReopened` 清除投影中的 `Delivered` 并把 `Active` 恢复为该任期（沿用原 incumbencyId、原 stage 与原授权），不生成新任期；`Retired` 列表中的历史记录不删除。`Relayed` 退休的任期严禁复活；`Delivered` 退休的任期仅可经 `PlanReopened` 复活一次回 active。禁止在七条事实之外引入旁路状态机、内存标记或外部计数器。禁止 `PlanAskPending` 与 `PlanAskResolved`（该挂起协议已由 [009] 自然停止语义取代）。
- 失败后果：遇到同一身份但载荷不同的冲突事件（含同一任期的第二条不同 `PlanReviewed`），或检测到不合法的状态跃迁（如重复激活、幽灵任期、无 `Delivered` 时的 `PlanReopened`、`PlanReopened` 的 incumbencyId 与退休记录不匹配），系统必须抛出 `StorageInvalid` 并关闭，严禁跳过或猜测。

## [004] 阶段推进、授权与状态正交

规划流程的阶段（Stage）严格单向：`S1`（事实与取舍）、`S2`（理解与路径）、`S3`（流程与伪代码）。工作状态（state）为 `active | delivered`。stage 与 state 正交。

- 允许后果：阶段推进唯一由 `PlanReviewed(Promoted)` 驱动：`S1` 晋级到 `S2`；`S2` 晋级到 `S3`；`S3` 晋级即授权（`Authorized = true`，本任获得交付权，见 [008]）。接力（`deliver` 无权路径，见 [007])开出的下一任沿用退休时的 stage，不推进阶段。`state` 由 `PlanDelivered` 进入 `delivered`、由 `PlanReopened` 回到 `active`。
- 禁止后果：阶段严禁逆行、跳级或由 review 之外的任何事件推进（接力、交付、重开均不推进 stage）。未获授权（`Authorized = false`）的 `deliver` 严禁走终态交付路径，只能走接力。授权一旦授予，本任保持至退休；重开恢复的任期沿用原授权。
- 失败后果：在不满足推进条件时收到 `PlanReviewed(Promoted)`（如对已退休任期、或 stage 越界），Fold 必须返回强类型错误，底层存储零写入。

## [005] 动作许可矩阵

工具调用进入执行前，动作门必须基于当前任期、授权与工作状态进行单一判定。

- 允许后果：
  1. 仅当调用者为 `Plan` 且工作处于 `active`（有活跃任期）时放行 `js-plan`、`ask`、`review`、`deliver`；
  2. 每一任期在调用 `review` 工具之前，`js-plan` 工具是严格只读的（仅允许读操作 `read`）；若在此之前尝试写入（`edit`、`rewrite` 等修改操作），动作门与执行层均强制拦截拒绝，并向模型报错说明必须先完成 `review`。当前任期成功调用 `review` 工具之后方解锁写权限；接力（无权 deliver）开启的新任期在其成功调用 `review` 之前重新锁定为只读；
  3. 工作处于 `delivered` 时，仅允许 `js-plan` 的 `read`，`ask`、`review`、`deliver` 一律拒绝（再次动作必须先经用户 reprompt 与 `PlanReopened` 回 active，见 [021]）；
  4. `review` 为硬门：本任已有 `PlanReviewed` 事实时拒绝再次调用（每任恰好一次，见 [022]）；
  5. `ask` 在同一 work 已有一个未决委派时拒绝新委派（见 [010]）；
  6. `deliver` 要求无活跃 blocker（递归 live 资源）；行为按授权分支：持权走交付（[008]），无权走接力（[007]）。
- 禁止后果：stage 不作为动作门：任何 stage 下四个工具的许可判定一致，阶段推进完全由 review 硬门承担。禁止在未决 ask 委派悬空时开启新的外部动作。`handoff` 与 `resume` 不在许可矩阵中，任何调用一律拒绝。禁止在当前任期完成 review 之前向底稿 `P` 写入任何改动。
- 失败后果：凡不满足许可矩阵条件的调用，一律返回强类型 typed 错误，并保持原状态不变。

## [007] 接力契约（deliver 无权路径）

当跑者调用 `deliver` 且本任未获授权（`Authorized = false`）时，系统执行任期接力。`handoff` 不再是独立工具。

- 允许后果：系统首先核查当前任期的递归活跃资源（包括 child、后台作业、未决工具调用与租约）。确认无 blocker 后，以单个原子事务追加两条事件：
  1. `PlanIncumbencyRetired(incumbencyId, Relayed)`；
  2. `PlanIncumbencyOpened(workId, nextIncumbencyId, stage, openingCursor)`，其中 stage 等于退休时的 stage（接力不推进阶段）。
  退休游标取自当前 `deliver` 所属物理交互的真实 XTrace 边界，表示已消费到的最后一个语义 part；下一任的 `openingCursor` 等于该游标，首个新 part 从其后开始，不另加一。较新的用户输入或其它 provider run 不得扩大本次退休范围。
  当前活跃任期更新为新任期，阶段不变，下一次 Provider 请求触发前缀重锚并重启上下文（新任期按 [017] 过滤旧任交互、插入 `LWR_prev`，保留真实对话的因果顺序）。
- 禁止后果：若存在活跃阻塞资源（blocker），禁止退休任期；系统必须记录 `CleanupBlocked` 并向模型返回 blocker 摘要。接力严禁改写 `stage`、严禁产生 `PlanReviewed`、严禁影响 `Delivered` 投影。禁止在未成功持久化新任期前注销当前任期。禁止使用固定增量、消息数组下标或缺省值伪造退休游标。
- 失败后果：退休边界不可证明时，在追加 Plan 事件之前拒绝接力；事务写入失败时，当前任期保持活跃，不产生状态漂移。

## [008] deliver 契约（持权交付路径）

当跑者调用 `deliver` 且本任已获授权（`Authorized = true`）时，系统建立终态交付。

- 允许后果：系统首先核查当前任期无活跃 blocker，随后读取 `P` 文件内容并确认其非空。计算内容哈希（`sha256`）与字节长度。启动一个无 parent 的 Manager 执行会话（init prompt = `P` 全文，见 [023]）并取得 `execSessionId`。以单个原子事务追加两条事件：
  1. `PlanIncumbencyRetired(incumbencyId, Delivered)`；
  2. `PlanDelivered(incumbencyId, workId, digest, path, execSessionId)`。
  成功后归还本会话占用的 provider 额度，向用户呈现最终产物路径与回执（含执行会话已启动的事实），规划宣告完成，不再调用任何模型。
- 禁止后果：`P` 为空或不存在时严禁交付。无授权时严禁走本路径（走 [007] 接力）。禁止引入质量证书（QualityCertificate）或事后复核机制。`execSessionId` 严禁进入 provider 可见面。交付完成后，本任期内严禁再调用模型；再次 `deliver` 只可能由用户 reprompt 触发，且必须先经 `PlanReopened` 回 active（见 [021]），严禁绕过重开直接复用 delivered 投影。
- 失败后果：若文件读取失败、为空、执行会话启动失败或持久化出错，交付调用必须失败，当前任期保持不退休状态，底层存储零写入。

## [009] 自然停止

当 Plan 跑者需要用户输入时，模型自然停止本轮输出并等待下一条用户 prompt。Plan 是唯一允许空停等用户 prompt 的 role。

- 允许后果：Plan 会话的空停（finish = stop 且正式文本无效）收敛为普通回合完成（`TurnCompleted`），不触发 continuation、不触发 interaction repair、不占用重试预算。用户下一条 prompt 按普通新输入进入本任期。provider error、abort、length 截断等非空停失败仍走既有失败恢复路径，不受本条豁免。
- 禁止后果：严禁为 Plan 空停发起 continuation 或 repair 请求。严禁引入两段式 ask 挂起状态机（`PlanAskPending`/`PlanAskResolved`）或 Continuation 回送协议——问用户就是自然停止。严禁对其它 role 的空停应用本豁免（其它 role 的空停行为保持字节不变）。
- 失败后果：若实现把 Plan 空停误判为需要 continuation，或把其它 role 的空停误判为自然完成，均为违反本合同的缺陷，对应回归测试必须红。

## [010] ask 契约（同步委派固定 DevOps）

当跑者调用 `ask(intent)` 时，系统把调查意图同步委派给本 work 绑定的固定 DevOps。

- 允许后果：系统查询本规划任务绑定的唯一固定 DevOps 实例；若未绑定则由运行时 single-flight 创建并持久化 `PlanDevOpsBound` 绑定事实。将 `intent` 作为调查目标投递给该 DevOps 做只读调查（含真实 bash 执行，只读约束由 office 提示词承担，不做运行时门）。等待本次调用的完成事实，确认收敛后把 DevOps 的生命周期工作记录（LWR，子→父方向，`includeOpening = false`）完整交回 Planner。
- 禁止后果：模型在调用参数中只传 `intent`，不得传递 DevOps 的 id、role、model 等底层拓扑标识。系统严禁对 DevOps 的返回结果做二次模型摘要，必须完整交付。同一规划任务同时至多运行一个未决 ask 委派；已有未决委派时再次调用必须返回强类型拒绝。返回材料不得携带底层 id（SessionId/AgentId/PtyId）。
- 失败后果：若固定 DevOps 处于忙碌状态或响应失败，返回强类型错误，不静默丢弃，不新建替代操作员。

## [011] P 路径推导与编程面工具

底稿 `P` 是模型唯一可读写的持久化文件产物，其路径由系统确定性派生。

- 允许后果：系统以 `workId` 派生安全编码的 `canonical-work-key`，路径固定为 `<git-common-dir>/wanxiangshu/plan/<canonical-work-key>/plan.md`。`js-plan` 是标准的 JS 编程面工具（接受单一参数 `program: string`，在沙箱中执行继承自 `JsProgram` 的类并实现 `async run()`），仅作用于该单一底稿 `P`。它直接模仿其它 `js-*` 工具的锚点编辑法，但因为作用域严格限定于单一底稿 `P`，严禁且无需传入任何路径参数：提供 `file(matches)` 读快照与锚点切片、`edit(changes)` 局部修改与 `rewrite(newText)` 全量覆盖能力；无 `glob`/`grep` 仓库检索能力。写入采用排他临时文件写入、flush 后原子替换的方式发布。
- 允许后果：交给模型的 `js-plan` 工具描述复用其它 `js-*` 的同一套教程面：有序锚点、`text(from, to)`、精确 `edit`、结构重组，以及一份按底稿职责成形的样例。教程按本工具的无路径签名填写：`file(matches = [])`、`edit(changes)`、`rewrite(newText)`。`P` 的单一作用域、禁路径和写前评审只作为作用域约束放在教程前面，不另写一套锚点用法。
- 禁止后果：模型不得在工具参数中使用多余字段，只传递 `program`。在 `JsProgram` 的 `file`、`edit`、`rewrite` 方法中严禁传入任何路径参数，若调用时尝试传入路径参数，沙箱必须直接报错拒绝。严禁路径穿越（path traversal）、符号链接逃逸、不安全 ID 注入或根目录漂移。`js-plan` 严禁提供任何超出 `P` 之外的文件系统能力，严禁暴露目录列表或仓库文件读写。写盘完成后取消读回校验。
- 禁止后果：工具描述不得另写精简教程替代共享教程，不得在教程或样例中教模型传入路径参数，不得把运行时内部对象暴露给模型。
- 失败后果：检测到路径异常、传入路径参数、尝试访问 `P` 之外的文件或目标文件被外部非法篡改时，操作必须立即拒绝。

## [013] 工具注册与分类

系统启动时，必须显式注册 Plan 相关的工具与参数规范。

- 允许后果：在 `ToolRegistry` 中登记 `js-plan`（作为 JS 编程面）、`ask`、`review`、`deliver`（作为编排面 ToolSpec）。在静态工具名单（`StaticTools.fs`）与投机调查分类器（`InvestigationEstimateContract.classifyTool`）中显式登记上述四个工具名称。`review` 与 Manager 共用同一 ToolSpec（共享壳按角色换目标，见 [022]）。
- 禁止后果：严禁使用前缀匹配、通配符或模糊规则对工具进行分类或准入。未显式登记的工具不得进入 Plan 的工具列表。`handoff` 与 `resume` 不得作为 Plan 工具登记或注册。
- 失败后果：若工具名称或分类缺失，系统在启动静态校验或工具构建期必须报错阻断。

## [014] 阶段资源、语言对等与真注入

Plan 角色与各阶段使用的指导文档必须在资源目录中中英双语严格成对提供，并经系统提示转换器真正装配进 Plan 会话。

- 允许后果：以下资源必须同时存在 `en.md` 与 `zh-CN.md` 且内容语义对等：
  - `resources/provider/role/plan/`
  - `resources/provider/planning/s1/`
  - `resources/provider/planning/s2/`
  - `resources/provider/planning/s3/`
  - `resources/provider/tool/js-plan/`
  - `resources/provider/tool/ask/`
  - `resources/provider/tool/review/`
  - `resources/provider/tool/deliver/`
  系统提示转换器在 `experimental.chat.system.transform` 挂钩中真正装配 Plan 提示：`catalogPrompt` 对 `Role.Plan` 返回 Plan 的 role law（`PlanSystemPrompt` 进入 PromptCatalog），`activeRoles` 包含 `Plan`，替换逻辑与其它 office 角色同规则（字节识别自己的段落、按当前全局语言本地化）。在 Plan 会话的系统提示中，按当前任期的 `stage` 以稳定字节幂等追加对应阶段的方法说明（S1 对应事实与取舍，S2 对应理解与路径，S3 对应 Knuth 伪代码）；stage 变化时下一次请求呈现新 stage 方法。
- 禁止后果：任何资源缺失单侧语言文件均属于非法状态。`resources/provider/tool/resume/` 与 `resources/provider/tool/handoff/` 不再属于 Plan 工具面，不得保留为可加载的工具资源。系统不得在 Plan 提示缺失时静默降级为无提示或单侧语言。严禁在 system transform 之外用消息注入代替系统提示装配。
- 失败后果：装载期发现任何双语不对等或缺失，系统必须在 Boot 阶段触发致命失败（fail fast），拒绝启动。

## [015] 非 Plan 路径行为不变

Plan 机制的引入不得对既有系统角色与流程产生任何侵入或行为改变。

- 允许后果：既有角色（Manager、Orchestrator、Engineer、DevOps、Blogger）的权限投影、工具注册、生命周期转换、消息变换逻辑保持字节级行为一致。Manager 的 `review` 字节行为不变（共享壳分派不改变 Manager 后端语义，见 [022]）。
- 禁止后果：非 Plan 角色严禁获取 Plan 专属工具。Plan 的 Baton 隔离逻辑严禁污染非 Plan 会话的消息集。Plan 的自然停止豁免严禁应用于其它 role（见 [009]）。
- 失败后果：任何非 Plan 回归测试失败均表明破坏了全局不变量，改动必须判定为不合格。

## [016] Plan 事件持久化、Canonical 序列化与投影集成

Plan 的生命周期事实接入 EventStore 统一持久化存储与 CanonicalIntegrator 投影体系。

- 允许后果：七条 Plan 事件按规范化 JSON 序列化并以自包含的 EventEnvelope 形式写入 `.git/wanxiangshu/events/<WriterId>.ndjson`。JSON 对象键必须按 Unicode 代码点严格升序排列，游标以 64 位整数无损保存。写入路径由 `PlanEventStore.append` 统一提供，在提交到底层存储前必须先以 `PlanFold.applyWorkEvent` 校验当前工作状态的合法性。读取路径由 `ICanonicalIntegrator` 与 `IEventStore` 的统一 `Current "Plan"` 导出 `PlanState`，并按 `PlanWorkId` 派生 `PlanWorkView`。
- 禁止后果：严禁在状态机规则校验失败时向 EventStore 追加事件。严禁使用非规范化、键序混乱或篡改字段的 JSON 格式。严禁绕过 CanonicalIntegrator 私自全量扫描历史文件或在内存中维护第二份状态。
- 失败后果：若追加前 Fold 规则校验失败，返回带具体原因的强类型错误，底层存储零写入；遇到标识碰撞或损坏的事件信封，Integrator 必须 fail-closed 拒绝并进入安全关闭。

## [017] 任期隔离与前缀重锚（openingCursor 形式）

当为处于活跃任期的会话组装 Provider 请求消息集时，系统应用通用的 Baton 隔离策略。

- 允许后果：先以稳定 Host 消息及 part 身份捕获本次请求中新观察到的真实交互，再按原消息顺序执行任期过滤：
  1. 当前规划任务因果范围内的全部真实用户输入原文（U）完整保留；
  2. 保留本任期真实 assistant 与 tool 交互，不把用户回答移动到它所回答的 assistant 或工具交互之前；
  3. 非首任存在上任有效范围时，由 `LifecycleWorkRecord.materialize` 且 `includeOpening = false` 渲染 `LWR_prev`，在首条本任期物理消息之前插入一次；尚无本任期消息时，置于保留的历史 U 之后。
  `openingCursor` 表示已消费到的边界。物理消息的任期归属取其稳定身份在 XTrace 中的首次观察游标，跨前缀 epoch 不变；后续追加的 part 或重锚后的重复捕获不得把旧消息变成新任消息。工具调用及结果按完整物理交互保留或剥除，不切半。
  每个任期的首条请求按持久化的 `TenureReanchored` 事实触发一次前缀重锚（reanchorRequested = true）；必须等待该事实提交后才继续请求组装。重复请求、空停后的追问和进程重启不得为同一任期重复重锚。
- 禁止后果：上一任期及更早任期的全部 assistant 消息与 tool 消息必须全部剥除，不得进入消息集。规划底稿 P 的正文严禁直接拼装入消息集。用户消息 U 严禁压缩、重排、重编码或篡改。禁止依赖 Host 消息上并不存在的 `cursor` 字段；缺少稳定归属证据时，禁止静默删除交互或放行旧交互。对于非 Plan 角色或无活跃任期的普通会话，严禁触发隔离与剥除。
- 失败后果：若任期消息装配失败、游标越界、非空上任范围的记录不可得或必需的重锚提交失败，系统必须停止当前请求组装，拒绝发送残缺或受污染的上下文。

## [018] 崩溃恢复判定与位置重绑

系统在进程重启或插件重新加载时，遵循算法 J 执行 Plan 崩溃恢复判定（`planRecoveryPosition`）。恢复仅依据 CanonicalIntegrator 导出的持久化 `PlanWorkView` 与确切的底稿文件存在性检查，绝对不按底稿正文猜测阶段，亦不凭同名 session 识别 DevOps。

- 触发条件：进程启动激活持久化层后，对已存在的全部 Plan 工作视图进行状态判定与恢复。
- 允许后果：
  1. 若工作视图标记为 `Delivered`（且持有合法的交付凭据与摘要），恢复位置为 `Delivered`，幂等呈现交付回执与底稿路径，绝不再调用模型，亦不开启新任期；此后用户 reprompt 经 `PlanReopened` 回 active（[021]），该路径属于运行时交互，不属于恢复；
  2. 若工作视图处于 `Active(incumbencyId, stage)` 且底稿文件（`plan.md`）存在，恢复位置为 `Active`，准确重绑当前任期、阶段与授权（`Authorized`），并将底稿存在标志设为 true；
  3. 若工作视图处于 `Active(incumbencyId, stage)` 但底稿文件尚未创建，恢复位置仍为 `Active` 并标记底稿不存在，系统视为可继续推进（模型可从头编写底稿），绝对不得凭空假定已交付；
  4. 若工作视图既无活跃任期亦未交付，恢复位置为 `Nothing`，系统不执行猜测与推断。
  5. ask 为同步委派（[010]），不存在悬挂的 ask 状态，恢复判定无需处理 ask。
- 禁止后果：严禁根据底稿文件内部的文本内容、标题或关键词推测任期阶段。严禁在恢复期间无故创建新任务、私自开启新任期、自动派发 DevOps 命令或自动执行 `PlanReopened`。严禁在恢复路径把 `Delivered` 工作重新激活为 `Active`（重开只由用户 reprompt 触发）。
- 失败后果：若视图数据损坏或出现冲突（例如 Delivered 状态与 Active 任期同时并存），恢复函数必须 fail-closed 返回 `Conflict` 错误状态，保留原始证据，拒绝进入任何执行分支。

## [020] 入口：首 prompt 开 work

当用户在 Plan mode 会话中敲入首条 prompt 时，系统开启规划任务。

- 允许后果：系统读取会话 sessionId，核验 owner role 为 `Plan`，以 single-flight 方式追加三条事件：
  1. `PlanWorkOpened(workId, root)`，其中 `workId = sessionId`，root 为 `<git-common-dir>/wanxiangshu`；
  2. `PlanDevOpsBound(workId, devopsId, target)`（devopsId 由运行时解析）；
  3. `PlanIncumbencyOpened(workId, incumbencyId, S1, openingCursor = 0)`。
  首任任期始于 `S1`。若该 work 已有活跃任期，入口幂等返回，不重复追加。入口挂点在消息 transform pipeline 的 Plan 分支（`resolveTenure` 之前）。
- 禁止后果：非 Plan 会话严禁触发本入口。严禁凭同名物理会话或自然语言内容猜测已有 work。严禁在入口之外的位置追加首条 `PlanWorkOpened` 或首个 `PlanIncumbencyOpened`。
- 失败后果：同一身份重放幂等；异载荷拒绝。若 store 不可得或写入失败，入口必须失败并保持零写入，严禁伪造 S1 兜底状态。

## [021] 工作状态机与 reprompt 重开

Plan 工作的状态（state）为 `active | delivered`，由 Durable 事实驱动，与 stage（[004]）正交。

- 允许后果：`PlanDelivered` 把 state 置为 `delivered`；`PlanReopened` 把 state 回滚为 `active`。处于 `delivered` 的 work 收到用户新 prompt（reprompt）时，系统追加 `PlanReopened(incumbencyId)`（incumbencyId 取自该 work 的 `Delivered` 退休记录）：投影清除 `Delivered`，并把 `Active` 恢复为该任期——沿用原 incumbencyId、原 stage、原授权，不生成新任期、不重置阶段。恢复后模型在原任期上继续工作（可修改 `P`、可再次 `deliver`）。该任期开任时继承的上任记录范围保持不变；不能把它自己的 `Delivered` 退休记录误当成上一任期。
- 禁止后果：严禁在无 `Delivered` 事实时追加 `PlanReopened`。严禁借重开推进或回退 stage、生成新任期、清除 `Reviewed` 历史或重置授权。严禁在非 reprompt 场景（如恢复、调度）自动触发重开。`Retired` 列表的历史记录严禁删除。
- 失败后果：同一身份重放幂等；载荷或 incumbencyId 与 `Delivered` 退休记录不符时拒绝；底层存储零写入。

## [022] review 晋级门

Plan 的阶段推进由 `review` 硬门承担。`review` 与 Manager 共用同一工具名、同一 schema 与同一三问语义（findings 为 `(acceptance_criteria, work_plan)` pairs，空集表示 GAP 为空，详见 relay-assessment-001），按角色换评审目标。

- 允许后果：Plan 后端的评审目标 = 下一里程碑，由当前 stage 推出：`S1` 的目标是 `S2`（理解与路径就绪）；`S2` 的目标是 `S3`（流程与伪代码就绪）；`S3` 的目标是「成为最后一任」（获得交付授权）。评审对象是「离目标的 gap」，第一任与后任同一标准。findings 为空集时，系统追加 `PlanReviewed(incumbencyId, stage, Promoted)`：非 S3 任期晋级到下一 stage，S3 任期置 `Authorized = true`。findings 非空时，系统追加 `PlanReviewed(incumbencyId, stage, Stayed)`，本任留在原 stage，gaps 作为修复义务返回模型。每任恰好一次 review：已评任期再次调用返回强类型拒绝。
- 禁止后果：严禁第二评审、reverify 或自证（对齐 relay-assessment-006）。严禁向评审者泄露晋级后的流程编排（对齐 relay-assessment-008）。严禁以数值评分或八维必填代替 findings pairs。严禁在无活跃任期或已 delivered（未重开）时调用 review。
- 失败后果：同任第二条不同载荷的 `PlanReviewed` 必须拒绝（`StorageInvalid`）；工具门禁对已评任期的调用返回强类型拒绝错误，不消耗 provider 请求。

## [023] deliver 起执行会话

持权交付（[008]）时，系统启动一个无 parent 的 Manager 执行会话来承接规划产物。

- 允许后果：会话以 `agent = manager` 创建，不带 `parentID`（与用户手动新建 Manager 会话等效，role law 由其自身配置提供）。init prompt 为 `P` 的全文（逐字节，不做摘要或改写）。启动成功取得 `execSessionId` 并记入 `PlanDelivered`。该 Manager 会话即规划产物的执行者，其后续生命周期由既有 Manager 体系管理，与 Plan work 不再耦合。
- 禁止后果：严禁以有 parent 的会话或其它角色承接交付。严禁对 `P` 做模型摘要后再投递。`execSessionId` 严禁进入 provider 可见面（工具参数、消息文本、schema）。启动失败时严禁追加 `PlanDelivered`。
- 失败后果：会话创建或 prompt 投递失败时，交付调用整体失败，任期保持活跃，等待模型重试或接力。
