# 万象术 Manager 与 Plan 统一重组 · S1 事实与取舍

## 0. 任务缘起与用户意图

用户原话（U，2026-10-11）：

> 目前 Manager 和 Plan 模式有着极为相似的结构，Plan 是后加入的，更加简单也更符合逻辑。Manager 模式的隔离和用词还有实现都偏旧。与其 backport，不如直接重组——用 Plan 模式的升维后同时服务 Plan 和 Manager。Plan 本身就有 3 Phases，Manager 其实可以认为是特殊的第四 Phase，只是独立 session 而且高频使用。或者你有什么更好的主意？

- 用户已否决：backport（把 Plan 语义搬回 Manager）。
- 用户倾向：Plan 升维统一，Manager 视为特殊第四 Phase（独立 session、高频）。
- 用户开放：征求更好的主意。

用户第二段 prompt（2026-10-11，对 R1-R8 的裁决）：

> 不，Manager 完整保留物理历史是错误的历史决策，要和 Plan 模式对齐。Manager 就是 S4，是恰好只有一个 Stage 的退化情况。全部重命名成 Plan 的词汇风格。持久化迁移到 DRY 以 Plan 为底稿重新设计。证书也不要了，向 Plan 看齐。R6 真的各自保留，因为 Manager 是自动工作，Plan 是交互工作。R7 使用 KISS & DRY 原则重新设计。R8 允许重新设计。最终目标：仿佛是从一开始就设计好了 DRY 版本的基础设施，Manager 和 Plan 都是基础设施的实例化或者受益者，要看不出发展历程和痕迹。

（逐条裁决入档见第 4 节「用户裁决」。）

本底稿事实来源：2026-10-11 本任经 ask 委派固定 DevOps 的只读调查（下称「调查」），出处均为调查中亲眼读到的文件、行号与 git 记录。

## 1. 目标状态（可判定）

重组完成后，仓库应处于以下状态：

- G1 单一生命周期基础设施：唯一活跃任期、退休不可逆、每任恰好一次 findings-pairs 评审（禁自证）、接力不推进阶段、固定 DevOps 绑定、LWR 交接——六项核心机制只有一套实现。统一模型为一条生命周期：S1 事实 → S2 理解 → S3 流程 → S4 执行；Plan work 从 S1 起走，Manager work 是恰好只有一个 Stage（S4）的退化情况。
- G2 Manager 特有能力裁决：fork/resume/join 委派、Orchestrator commission、Continue 自动派发（自动工作语义）保留；QualityCertificate 退役；完整历史保留退役，对齐 Plan 的任期隔离（剥除前任消息、注入 LWR_prev）；两段式退休确认与 WorkspaceSnapshot 的去留形态由 S2 按统一契约裁定。保留项各有新锚点验收。
- G3 Plan 特有能力保留：S1/S2/S3 stage 递进、js-plan 编程面（写前 review 硬门、禁路径参数）、任期隔离+前缀重锚、自然停止（交互工作语义）、底稿 P、deliver 双路径+spawn——全部保留，各有测试锚点。
- G4 高频路径重设计许可：用户不经 Plan 直接创建 manager 会话的路径允许随统一重新设计（不要求行为不变）；「自动工作」语义（Continue 循环、无需用户逐步驱动）保留，新行为有新锚点验收。
- G5 术语归一为 Plan 风格：同一概念在全仓（代码+需求+资源）只用一套词，以 Plan 词汇为唯一风格；relay 旧词（Road、iteration、assessment、suicide、certificate 等）无残迹。
- G6 持久化 DRY 统一：以 Plan 的 EventStore+底稿设计为底稿重新设计持久化，AgentJournal durable facts 双轨消除；WorkspaceSnapshot 若保留，则成为统一事件模型内的事实。
- G7 测试资产 KISS & DRY 重设计：两套平行测试（planning 25 文件+1 canary、relay 约 30 文件）按统一后的契约重新设计，消除同构重复；无悬空锚点、无两套词指同一行为。
- G8 无考古痕迹：最终形态读起来像从一开始就设计好的 DRY 基础设施——Manager 与 Plan 都是它的实例化或受益者；目录、命名、需求条款不携带「先 Manager 后 Plan 再统一」的发展痕迹。不引入兼容层，不留过渡命名。

## 2. 事实

标注：〔F〕已核实（附出处）；〔I〕推断（附依据）；〔U〕不可核实/未穷尽（附原因）。

### 2.1 文件与组织〔F〕

Plan：`src/Wanxiangshu/Mission/Planning/` 14 模块——Surface(944)、Fold(497)、PlanTools(491)、TenureIsolation(390)、Facts(167)、EventCodec(207)、PlanWorkOpen(142)、ActionGate(111)、ReviewPlanBackend(107)、Recovery(98)、Store(88)、PlanPath(120)、IntegrationRules(23)、EventVocabulary(21)。需求 `requirements/planning/`（22 条款），资源 `resources/provider/{role/plan, planning/s1|s2|s3, tool/{js-plan,ask,review,deliver}}`。

Manager：`Mission/Manager/`（Workflow 477、WorkflowSurface 47）+ `Mission/Relay/`（Fold 890、OpenCode/SuicideTool 466、OpenCode/ReviewBackendManager 460、Surface 285、OpenCode/NarrativeTransform 180、OpenCode/ReviewShell 154、OpenCode/WorkspaceSnapshot 52、Retirement/Surface 66、Assessment/{Model 76,Surface 23}、Contract 116、Facts 99、ProjectionSurface 42）。需求 `requirements/relay-{incumbency,retirement,assessment,context-projection}/`，资源 `role/manager` 与 `tool/{suicide,review,resume,fork,…}`。

已共享的代码（两模式已经在合用的部分）：`Mission/WorkRecord/`（LWR 物化，两边共用）；`Relay/OpenCode/ReviewShell.fs:13-19,144-154`（review 共享壳，按 role 分派 Plan/Manager 双后端）；`OpenCode/Plugin/PluginTransforms.fs:1147-1180`（同一 transform 管线，ApplyRelayProjection 与 ApplyTenureIsolation 按 owner role 互斥分支）；`OpenCode/Host/ProviderSystemTransform.fs`（同一系统提示装配器，Plan 与 Manager 同表注册）；`OpenCode/Tools/{ToolRegistry,StaticTools,ToolRuntimeScope}.fs`（同一注册表）。

### 2.2 五维结构对比〔F〕

| 维度 | Plan | Manager |
|---|---|---|
| prompt | PlanSystemPrompt + stage 方法行（S1/S2/S3，字节幂等替换；ProviderSystemTransform.fs:58-83） | ManagerSystemPrompt + manager-assess/work/finish 三段循环 nudge，由事实推导非程序计数器（Workflow.fs:22-29, 76-91） |
| session | 用户显式创建 plan 会话；workId=sessionId；同 session 换任期（PluginTransforms.fs:773-784 入口） | 三来源：用户直建、Orchestrator commission、Plan 持权 deliver spawn 无 parent 会话（Workflow.fs:277-302；ToolRuntimeScope.fs:747-785）；退休 Continue 同 session 自动派发后继 |
| 工具面 | js-plan、ask、review、deliver 四个（ToolRegistry.fs:601-602,714-735；planning-002） | fork、resume、join、horizon、PTY、suicide、js-manager（只读评审面）、review（ToolRegistry.fs:737-759）。重叠仅 review 一个，且是同一 ToolSpec（ReviewShell） |
| 生命周期 | 7 事件：PlanWorkOpened / DevOpsBound / IncumbencyOpened / IncumbencyRetired(Relayed\|Delivered) / PlanDelivered / PlanReviewed(Promoted\|Stayed) / PlanReopened；deliver 无权=接力、持权=交付（PlanTools.fs:60-64, 322-341） | IncumbencyOpened → AssessmentCommitted → 两段式 suicide → RetirementCommitted(Continue\|Accepted)（SuicideTool.fs:80-126）；Continue 自动派发后继（Workflow.fs:329-369） |
| 持久化 | EventStore ndjson（.git/wanxiangshu/events/<WriterId>.ndjson，canonical JSON 键 Unicode 升序）+ 底稿 P（plan/<work-key>/plan.md，排他临时文件原子替换） | AgentJournal durable facts（RelayTransaction 原子提交）+ WorkspaceSnapshot（git 状态快照）+ QualityCertificate |

### 2.3 骨架同构九项〔F〕（两套体系结构相似的实体证据）

1. 唯一活跃任期：relay-incumbency-001 ≈ planning-003。
2. 评审门：relay-assessment-001/006 ≈ planning-022（findings pairs、每任一次、禁自证、非空即修复义务）。
3. 接力不推进阶段：relay-incumbency-004 ≈ planning-007。
4. 固定 DevOps 绑定：relay-incumbency-010/011/012 ≈ planning-010。
5. stale 请求拦截：NarrativeTransform 的 cut ≈ planning-017 的 openingCursor。
6. 崩溃恢复不猜测：两边恢复判定同构。
7. LWR 交接：同一 LifecycleWorkRecord.materialize 两边共用。
8. 双语资源成对 fail-fast：provider-language-006 一体适用。
9. 原子事务写、幂等重放、异载荷拒绝：事件写入纪律同构。

### 2.4 独有能力〔F〕

Manager 独有：委派面（fork 仅 Engineer、resume 固定 DevOps、join、horizon）；Orchestrator commission 上游（delegation-004：commission 只委任 Manager）；两段式 suicide 退休确认；QualityCertificate；WorkspaceSnapshot；AuthorityRevision；Continue 自动派发（manager-assess loop prompt + gate nudge）；完整物理历史保留；评审期只读 js-manager 与评审接纳前禁派工（capability-enforcement-025/026）。

Plan 独有：3 Stage 递进（review 晋级是唯一推进器）；js-plan（写前 review 硬门、禁路径参数）；ask 同步委派（单未决）；任期隔离+前缀重锚（planning-017、TenureReanchored 事件）；底稿 P（唯一可写产物）；自然停止（planning-009 空停豁免，Plan 是唯一允许空停等用户 prompt 的 role）；reprompt 重开（PlanReopened 沿用原任期）；明令禁止质量证书（planning-008）。

### 2.5 语义分歧〔F〕（契约级，非实现惰性）

- 历史语义相反：Manager 完整保留物理历史给后继（relay-context-projection-001；NarrativeTransform.fs:135-138 注释「it never filters the provider message set」）；Plan 剥除前任 assistant/tool 消息、注入 LWR_prev（planning-017；TenureIsolation.assembleTenureMessages）。
- 收尾语义：Manager 两段式 suicide + 证书收尾；Plan deliver 双路径。
- 等待语义：Manager 无空停豁免；Plan 自然停止。
- 派发语义：Manager Continue 自动派发后继 prompt；Plan 接力不派发，靠下一次请求自然装配。
- 质量凭证：Manager 有证书；Plan 明令禁止。

### 2.6 git 史〔F〕

Manager/Relay：2026-08-14 起 → 2026-09-04 relay 重构三部曲（382d162b0 wip → e175b3fc6 clean break → a19309ff long-stroke）→ 09-05/06 suicide lifecycle、pure loop → 09-07/08 架构切分 → 09-13 收尾 → findings pairs（30f53445e）→ 两段式 suicide（694750f00）。

Plan：2026-10-10 20:28 `9fcc15824` 一次性全新引入整个 Mission/Planning（非复制，此前仓库无此目录）→ f0bfd802f ask 两段式挂起（后废弃，019 条款已删）→ 24babfac8 重接（四工具真实现；handoff 并入 deliver、resume 从 Plan 退役）→ ad50ddc15 js-plan 重构+写前 review 硬门 → 4f34d54e1 等修复 → 3d327213d 提示词重写。

统一重构先例：无。仅 8af4fc11c 合并重复条款（006→017、012→018）；无任何「统一两模式」的 commit 或 TODO。

### 2.7 术语对照〔F〕

| 概念 | Manager 侧（2026-09 relay 词汇） | Plan 侧（2026-10 新词） |
|---|---|---|
| 任务载体 | Road | Work |
| 任期 | Incumbency / iteration（序号 ordinal） | Incumbency / tenure（任期、一棒） |
| 评审 | assessment（工具名已统一 review，后端仍叫 AssessmentCommitted） | review（PlanReviewed） |
| 评审结果 | PERFECT/REVISE（已退役）→ findings 空/非空 | Promoted / Stayed |
| 结束动作 | suicide（两段式） | deliver |
| 退休结果 | Continue / Accepted certificateId | Relayed / Delivered |
| 质量凭证 | QualityCertificate | 无（planning-008 禁止） |
| 接力材料 | 完整物理历史 + 快照 | LWR_prev + U + 当前任交互（剥除前任） |
| 阶段 | assess → work → finish（事实推导循环） | S1 → S2 → S3（显式 stage，review 推进） |
| 交接工具 | fork / resume / commission | 无（deliver 双路径内嵌） |

同一个「每任一次评审门」在需求里一处叫 relay-assessment-002，一处叫 planning-022——两套词汇指同一族概念。

### 2.8 调用关系与频率〔F+I〕

〔F〕Manager session 三来源：用户直建；Orchestrator commission（delegation-004）；Plan 持权 deliver spawn 无 parent manager 会话（planning-023，PlanTools.fs spawn "manager"）。Plan session 唯一来源：用户显式创建（agent=plan）。Plan 的交付产物必须交给 Manager 会话执行。

〔I〕「Manager 高频使用」：从调用拓扑推断（Manager 是执行主干、Plan 无任何自动入口、Orchestrator 只委任 Manager）；仓库无明文「默认走 Manager」。README 无 Plan 使用说明，CHANGELOG 把 Plan 列在 Unreleased。规划若以此为前提，需用户确认。

### 2.9 测试覆盖〔F〕

planning：25 个 .test.mjs + host-canary-plan-relay（L4 真宿主 relay canary）。锚点 001-005、007-011、013-018、020-023，另 024-027 为补测（复用 017/018 锚点）。006/012/019 条款已删无测试。

relay：assessment 001-010；incumbency 001-006+008-013（无 007 条款）；retirement 001-005+007-009（无 006 条款）；context-projection 001-009。

测试内已标 GAP todo：GAP-192（并发 opening 未测）、GAP-193（narrative 证据提取需独立观测）、GAP-197（Manager terminal workflow 全路径与资源阻塞矩阵未覆盖）。

### 2.10 遗留残留〔F〕

`assembleAskContinuation`：Surface.fsi:62 导出、TenureIsolation.fs:378-390 实现，源码中无任何调用方——已废弃的 ask 两段式挂起协议（planning-019，已删条款）的残留导出。统一重组时应一并清理（此处仅记录，本阶段不动手）。

### 2.11 不可核实/未穷尽〔U〕

- `proposals/` 归档目录未逐个展开搜索统一重构提案（本次仅确认 manager-review canary 相关日志存在）。
- 「Manager 高频」无仓库明文（见 2.8〔I〕）。

## 3. 根因

Q1 为什么两套结构并存？
时序根因：Manager/Relay 于 2026-09 relay 重构先成型；Plan 于 2026-10-10 由 9fcc15824 全新引入在后。引入时没有复制 Manager 代码（无共同文件祖先），但语义上大量借用 relay 词汇与合同（Incumbency/Retirement/Relayed/findings pairs/固定 DevOps）——概念同源、实现分叉。

Q2 平行重复从哪里来？
Plan 全新成域时，把与 relay 同构的骨架机制（状态机、评审门、接力、DevOps 绑定、恢复）各自重新实现了一遍；LWR 例外，直接共用。重复不是复制粘贴，是同一语义的两份独立实现。

Q3 哪些已自然合流、哪些没有、为什么？
已合流：review 工具壳（relay-assessment-011，共享壳+按 role 分派双后端——这是本仓库已有的统一先例）、LWR、PluginTransforms 管线（双分支）、PromptCatalog、ToolRegistry。未合流：状态机（Relay/Fold 890 行 vs Planning/Fold 497 行）、持久化（AgentJournal vs EventStore+P）、术语、退休动作（suicide vs deliver）、历史语义。
为什么：合流都发生在「外围工具与装配层」——改动局部、风险低；未合流的都在「状态与语义核心」——尤其历史语义两边契约方向相反（保留 vs 剥除），不是没人想合，是不裁决语义就合不了。

Q4 「隔离与用词偏旧」的根因？
用词偏旧：Manager 侧词汇冻结在 2026-09 relay 重构期；Plan 引入时换了新词，两边各说各话。这是词汇演化时差，属惰性重复，可归一。
隔离偏旧：Manager 的「隔离」是四件真实契约（评审信息时域隔离 relay-assessment-008、stale cut 拦截、评审期只读+禁派工、固定 DevOps 控制权）加一条与 Plan 相反的历史语义（完整保留 vs 剥除）。前四件是真实责任差异，统一时应保留；历史语义是契约级分歧，必须显式裁决，不能顺手抹平。

结论：重复分两类。惰性重复（状态机双实现、术语分岔、退休动作外形）可以统一；语义分歧（历史保留 vs 剥除、证书 vs 无证书、自动派发 vs 自然停止、两套持久化）是统一方案必须逐条裁决的硬分岔。

## 4. 取舍

### 选项 A：Plan 升维为统一生命周期，Manager 作为执行段的宿主（用户倾向方向）

形态：把「任务生命周期」统一为一条阶段流水——S1 事实 → S2 理解 → S3 流程 → S4 执行。S1-S3 同 session、任期隔离、剥除历史、review 晋级；S4 即现在的 Manager：独立 session、完整历史、委派循环。入口两个：S1 入口（显式规划）与 S4 直入口（高频执行，即现在的直接开 manager 会话）。

与事实的相容点：
- Plan S3 持权交付已 spawn 无 parent manager 会话（planning-023）——「S3 毕业 → S4 入学」的接缝已经存在，A 只是把它升格为显式模型。
- ReviewShell 已是「共享契约 + 按 role 分派后端」的先例——统一生命周期可沿用同一模式。
- 骨架同构九项提供语义对齐表。

冲突点与代价：
- Manager 无 stage 递进语义（assess/work/finish 是事实推导的循环，非 stage）——把 S4 塞进 Plan 的 stage 枚举会扭曲 Manager 语义。修正：S4 不是 stage 枚举的第四个值，而是统一生命周期的执行段，宿主是 Manager 角色。统一的是生命周期模型与核心契约，不是把 Manager 变成 Plan 的一个 stage。
- 历史语义分歧必须裁决（见 R2）。
- 两套持久化要统一或桥接（见 R4）。
- relay-* 约 30 个测试锚点的迁移策略（见 R7）。
- 高频路径不能被统一拖复杂（见 R8）。

### 选项 B：backport（把 Plan 的隔离/deliver/新词搬回 Manager）

用户已否决。代价备档：Manager 完整历史保留契约（relay-context-projection-001）与剥除冲突；relay 测试资产大改；Plan 的 stage 模型对 Manager 无意义；方向是让新的向旧的看齐，与演化方向相反。

### 选项 C：抽共享核心层，两模式保留各自外壳

形态：六项骨架机制抽成 Mission 核心层（任期状态机、评审门、接力、DevOps、恢复），Manager/Plan 各留 session 拓扑、工具面、术语。
代价：只修实现重复，不修术语与语义分岔——用户指出的「用词偏旧」原样保留；两套需求包继续并存；核心层若两边 invariant 必须一起改，形式分层就是假边界（boundary-collapse 警告直接适用）。为什么不是它：用户要的是重组，不是分层。

### 选项 D：维持两套，继续点状合流（现状惯性）

代价：术语分岔扩大、双份状态机维护、每次改骨架机制要改两处。收益：零迁移风险。为什么不是它：用户已明确要重组；惰性重复会继续累积。

### 对用户提议「Manager 作为特殊第四 Phase」的评估

与事实相符：Plan 的终点已是 Manager 的起点（spawn 接缝存在）；Manager 独立 session、高频直入，与前三段的同 session 模式确实构成「特殊」。
需要修正：Manager 不是 Plan stage 枚举的第四值——它没有 review 晋进、没有 stage 方法行、循环是事实推导的。更准确的建模是「统一生命周期的执行段（S4）+ Manager 作为该段宿主角色」：统一的是任期/评审/接力/DevOps/LWR 核心契约与术语，而不是把 Manager 塞进 Plan 的三段式。

### 用户裁决（2026-10-11 第二段 prompt，八条全答）

- R1 统一深度：采纳 A 并更彻底——Manager 就是 S4，是恰好只有一个 Stage 的退化情况；不做「执行段+宿主」的区分建模。统一对象是单一生命周期模型本身，Manager 与 Plan 都是它的实例。
- R2 历史语义：全局统一为剥除。Manager 完整保留物理历史被判定为「错误的历史决策」，与 Plan 对齐（剥除前任消息、注入 LWR_prev）；relay-context-projection-001 契约推翻。
- R3 术语：全部重命名成 Plan 的词汇风格。
- R4 持久化：迁移到 DRY，以 Plan 为底稿重新设计（统一重设计，非桥接）。
- R5 证书：退役，向 Plan 看齐（planning-008 禁令全局化）。
- R6 等待/派发语义：各自保留——Manager 是自动工作（Continue 自动派发），Plan 是交互工作（自然停止）。按工作性质保留，非按历史保留。
- R7 测试迁移：KISS & DRY 原则重新设计。
- R8 高频路径：允许重新设计。

总目标（用户原话）：「仿佛从一开始就设计好了 DRY 版本的基础设施，Manager 和 Plan 都是基础设施的实例化或者受益者，要看不出发展历程和痕迹。」

规划者推荐与用户裁决的差异（记录在案）：本棒原推荐保守方案（按段裁决历史语义、持久化先桥接、relay 锚点改名不重写、高频路径行为不变）；用户裁决全部取彻底方向（全局剥除、统一重设计、测试重设计、路径可重设计）。迁移面更大，但目标形态更纯粹。以用户裁决为准。

## 5. 本棒结论与移交

S1 四项验收已满：目标状态（G1-G8，含用户裁决）、事实（三类标注入底）、根因（四问四答）、取舍（A-D 评估 + R1-R8 全部裁决入档）。

移交 S2（理解与路径）的展开问题清单，继任者从这里接：

- Q-S2-1 S4 单 Stage 退化模型的形态：统一生命周期的 Stage 语义（review 晋进）对 S4 意味着什么；Manager 的 assess/work/finish 事实推导循环在单 Stage 模型里如何表达；Plan work（S1→S3，交付 spawn）与 Manager work（直接 S4）在统一事件词表下如何同构；「Manager 恰好只有一个 Stage」与「S4 是四段流水的第四段」两种读法如何统一（候选：Stage 是 work 的属性序列，Plan work = S1,S2,S3，Manager work = S4；Plan 交付 spawn 的 Manager work 从 S4 开始）。
- Q-S2-2 剥除语义对 Manager 侧的推翻清单：relay-context-projection-001 及其 9 个测试锚点重写；NarrativeTransform 的 stale cut（「never filters the provider message set」前提消失，cut 只剩请求身份判定）；恢复逻辑；Continue 自动派发与剥除装配的相互作用——后继不再看到前任消息、靠 LWR_prev 接力，自动循环在新语义下如何保持连贯。
- Q-S2-3 持久化统一设计：以 Plan EventStore+底稿为底稿吸收 Manager 侧事实；WorkspaceSnapshot、AuthorityRevision 的去留与载荷形态；证书退役后事件族裁剪；统一事件词表（Plan 7 事件 + Relay 事件族 → 一套）。
- Q-S2-4 术语映射落地：Road→Work、iteration→tenure、assessment→review、suicide→deliver、Continue/Accepted→Relayed/Delivered；需求包收敛形态（relay-* 四包 + planning 一包 → 统一包）；资源目录归一。
- Q-S2-5 测试重设计锚点方案：统一契约的锚点编号空间；两套平行测试合并去重清单；GAP-192/193/197 处置。
- Q-S2-6 模块级迁移路径：合并/重写/退役模块清单（含 assembleAskContinuation 残留清理）；迁移顺序（先核心后外围）；每步验收门。

S2 继任者注意：用户已把「无考古痕迹」定为最终判据——不引入兼容层、不留过渡命名、不为旧测试保留旧语义入口。
