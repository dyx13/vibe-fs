# speculative-investigation — WHY

## 不可替代的存在理由

主模型在动手修改代码或做出重大判断之前，常常需要先进行一系列机械的只读查证：读接口定义、查调用点、检索关联实现、核对已有测试。这些查证动作本身并不复杂，却往往需要经过多轮往返，频繁打断思考流，消耗高价值的主模型推理资源。

早先的探索试图让系统在幕后去猜测主模型的意图：通过统计画像、特征桶、成本模型与对照组来计算期望收益，再决定是否在后台启动只读调查。实践证明，系统在外部永远无法可靠获知主模型当前到底已经掌握了什么、脑中正在怀疑什么、下一步准备核对哪里。这种“替模型猜意图”的机制不仅带来了沉重的预测器养护成本，更模糊了责任边界。

随后的第一版显式委托协议，虽然将决策权交还给了主模型，却把协议包装成了“委托他人 / 同伴”、“建立信任”以及“每个工具都要表态是否放权”的叙事结构。这引发了新的实际问题：在模型可见层面引入了复杂的执行意向与控制权保留考量；每个可见工具（无论是否适合后续查证）都被迫加上了参数；短记也因为缺乏明确用途和条件约束，容易退化为空泛表态。

当前合同实现了一次彻底的语义澄清：**将任务所处位置的事实性估计与执行分工意向彻底分离**。
主模型不再需要权衡“是否信任他人”或“是否保留控制权”，而仅仅就当前整批工具完成后客观需要多少轮连续只读查证给出事实估计。系统将这一事实估计通过一次显式转换作为内部只读执行的安全上限。

## 为什么将工作位置估计与执行意愿分离

在旧协议下，字段名为 `delegate_readonly_rounds`，附带大段关于“了解同伴、建立信任、需要亲自判断时填 0 保留控制权”的说明。用户实际观察到当前主流 LLM 在面对此类表述时，在绝大多数场景下均填 0。模型之所以普遍填写 0，有一种有待实验进一步支持的合理解释：模型可能将“delegate”和“保留控制权”联想成了将主导权完全转交给不受控的子代理（subagent），出于谨慎决策倾向而倾向于拒绝委托。必须注意，这是一种有待实验证据检验的假说，并非已被完全证实的确定心理结论。

无论模型的心理机制究竟如何，从系统设计来看，将“任务客观还需要多少只读查证”与“是否愿意委托他人执行”搅在一起，本质上是把调度决策的负担硬塞给了正在推理业务代码的模型。
通过将字段改名为事实性的 `estimated_readonly_rounds`，并彻底剔除所有关于分工动机、信任博弈和控制权保留的叙事，模型只需专注于回答客观事实：**“当前批次完成后，还需要几轮连续的只读查证才能到达下一个不可仅靠查证推进的步骤？”** 宿主则依据自身配置与权限，纯机械地将该估计转换为执行上限。

## 为什么采取逐工具判定并减少无意义工具入参

在旧方案中，要求主模型可见的“每一个工具”都必须携带协议字段。这在实际工程中带来了严重的认知噪音与边界扭曲：
- 在 `fork`、`join`、`commission` 等任务分配与协调工具上，询问后续代码调查轮数毫无业务意义；
- 在 `chronicle`（Blogger 日志工具）等具有单一专职用途的工具上，注入调查参数完全违反了其生命周期契约；
- 在终端类工具（`open-terminal` / `read-terminal` / `send-terminal`）上，由于其操作对象是活跃进程而非稳定静态文件，强加只读文件查证估计破坏了终端交互边界。

新合同改为严格的**逐工具判定表（第 5.2 节参与工具，共 12 个）**：只有在调用后确实合理存在连续文件系统查证展望的工具（如 read/glob/grep、文件编辑修改 edit/write/mv/rm、综合操作 js-manager/js-engineer/js-devops、案例检索 fetch 与 DevOps 命令 run），才装饰估计协议。其余所有未参与工具保持原定义完全无增量，也不截取其同名业务字段。这大幅降低了模型的输入负担与注意力分散。

## 为什么短记改为建议性未来调查展望

在旧方案中，`self_note` 带有严格的成对条件：估计为 0 时必须不存在，估计为正数时必须是非空白展望。这把一个纯建议性的线索字段变成了硬校验目标——模型该填不填、不该填填了，都会让整批调用失败，短记本身却并不承载任何权限或预算事实。

新合同把 `self_note` 定为纯建议性字段：该填不填、不该填填了、填空白或非字符串，一律不视为失败。字符串短记原样保留，非字符串按缺失读取。建议在估计为正数时用一至三句说明准备核对的材料、关系及停点，使短记仍能作为有效的自省线索与排查依据，随原始调用自然进入对话历史。

短记依然保持单路传递：原始工具调用记录 → 冻结 owner 对话 → ID 重定位 → 同伴可见对话。严禁将其提取或复制到 system prompt、bootstrap、新 hint 事件或指令通道，确保其始终作为线索而非特权指令存在。

## 为什么同伴共享同一身份、只读且防递归靠身份

同伴不是另立门户的新代理，而是同一位当事人在同一上下文下的受限只读执行形态：保持 owner 的 participant、Role、Persona、版本与语言不变。
只读边界是绝对的铁律：仅允许 read/glob/grep。
旧方案曾规定“副本执行时必须固定填写 0 以防递归”，这是一种把系统防线寄托于模型配合的虚假约定。新方案彻底废除这一假条件：同伴在共享 schema 下按相同的事实性含义填写；防递归完全由宿主依据调用方的真实身份（Replica 身份在准入端无权发起新委托）进行刚性拦截。

## 为什么删除字节上限，保留完整性

调查事实的价值不能由文本长度来度量。强行设定专属的字节配额或过大归零规则，只会粗暴破坏真实的证据链。
真正必须保留的是完整性凭证：digest、byteLength 与 payload_refs。它们负责证明回传的工具交互未被篡改、真实发生并可精确回放。上下文大小的控制完全交由既有的通用工具截断与主模型压缩机制处理。

## 为什么历史分界与迁移必须清晰

协议的更迭不能以篡改或覆盖既有历史为代价：
1. 古老 K1/K2 预测时代的材料通过离线一次性迁移导入为历史材料事实，不补发主模型从未发过的授权；
2. 本次从旧协议向新协议（v1→v2）升级时，已持久化的历史事件和调用记录原样保留旧字段名与数据，禁止就地重写；运行时新输入则严格执行新协议，拒绝新调用中的旧字段与混合字段。

## 架构裁量与反事实知识

以下记载本协议设计与实现过程中的关键裁决。每项记录回答：约束是什么、选了什么、有哪些看似合理的替代方案、各自为什么不成立，以及什么新证据出现时才该重新考虑。

### 为什么 E2E Oracle 保持硬编码，严禁改为从编译产物动态计算？

- **约束**：端到端（E2E）长 stroke 测试必须充当无偏私的黑盒检查员，在真实 provider wire 字节层面上检验工具描述、参数模式与契约落地情况。
- **选择**：`requirements/verification-system/tests/e2e/support/long-stroke-oracles.mjs`（约 L1075-1078）中的参与工具集合 `PARTICIPATING_TOOLS` 显式字面量硬编码列出全部 12 个工具名，严禁通过导入 `dist/` 或调用 `InvestigationEstimateContract.js` 的分类函数来动态生成该集合。
- **替代方案**：像 `run-readonly-delegation-schema-canary.mjs` 那样从编译产物动态算出参与工具名单，以消除测试与实现间的字面量同步成本。
- **否决理由**：从被测系统内部逻辑派生自己的预期是纸糊的假验证。如果 `PARTICIPATING_TOOLS` 从 `InvestigationEstimateContract.js` 动态计算，一旦分类逻辑发生严重退化（例如将写工具 `run` 错误划分为 `NoEstimate`），被测系统与 oracle 会同时把参与集合算成 11 个工具，E2E 门禁将自欺欺人地绿灯通过，导致核心安全不变量被静默击穿。E2E 的身份是黑盒观察者，字面量漂移的防护应当且已经由前置阶梯承担：016 测项中的三消费端一致性循环比对，以及 canary 中 `EXPECTED_PARTICIPATING_NAMES` 的硬核对。
- **重新考虑的条件**：除非测试框架引入了完全独立于主系统源码、拥有自身双重输入源验证的独立第三方规范定义系统，否则 E2E 测试中的断言基准必须维持独立硬编码。

### 为什么 Replica §7.4 执行约束走 system transform 追加，而不走 bootstrap 消息注入？

- **选择**：启动消息与 system 约束都读取 `delegation/readonly-investigation`。前者让子会话显示实际工作指令；后者保证镜像替换消息流水之后，provider 仍能看到只读边界与停点要求。实际工具权限另由精确能力门禁执行。
- **Host 边界**：OpenCode 保留传入钩子的 `system` 数组，之后仍读取该数组。只赋值 `output.system` 会让单元测试看到新数组，却让 provider 看不到约束；必须原地修改。真实 Host canary 与原始数组回归测试共同验证这一点。
- **启动与预算分开**：常驻副本已有历史响应，不能把每次启动都记成“无历史响应”的 provider 请求，再让 transform 用真实历史身份重复扣轮数。启动防重发独立认领，轮数只在外发准入处扣除。
- **角色集合唯一**：旧能力白名单漏掉 Manager，导致准入成功后在 live registration 以 `RoleIneligible` 拒绝。准入与能力都读取 `Roles.all`，不再另列一份名单。

### 为什么协议版本升级不补专用替换理由码，而是复用 `CannotContinue`？

- **约束**：根据 DELEGATE §12.4，当主会话升级到新协议版本，而存储中存在旧版协议未完成的孤儿委托请求时，系统必须优雅关闭旧请求，不启动旧协议子进程，且主会话必须正常继续。
- **选择**：在 `Strength/OpenCode/Delegate.fs` 中，遇到版本不匹配的待处理请求时，记录终态事实 `DelegationClosedReason.CannotContinue`，随后主流程平稳继续。
- **替代方案**：为 `DelegationClosedReason` 新增 `SupersededBecauseUnbound` 或 `IncompatibleVersion` 等专用的细分变体。
- **否决理由**：`DelegationClosedReason` 是定义在 `src/Wanxiangshu/Strength/Delegation.fs` 中且由 `Store.fs` 与 `Surface.fs` 进行编解码保护的已落盘事件枚举。增补新变体必须修改持久化序列化与反序列化逻辑，甚至引发历史事实的迁移负担，这是典型的将偶然复杂度误当成本质复杂度。§12.4 要求的本质行为是“不启动旧协议子进程、主会话正常继续”，而不是在存储层发明一个生命周期极其罕见的枚举标签。当前四条终端分支完全涵盖了语义闭环：权威变更触发 `Superseded`，熔断触发 `failClosed`，而版本不匹配、未配置 Predictor、角色无权限均一致收敛到 `CannotContinue`。
- **重新考虑的条件**：仅当审计或下游消费方有明确法律/审计诉求，必须区分“因不可抗力崩溃”与“因离线版本迁移而放弃”，且该诉求被正式纳入核心事件规范时，才考虑扩充枚举。

### 为什么已退役工具 query-shell 不发协议分类，且未判定工具差集门禁以 `knownToolNames` 为唯一权威？

- **约束**：系统必须对所有当前暴露给 Provider 的工具完成完备的分类覆盖，差集门禁必须能严格拦截任何未判定工具。
- **选择**：`query-shell` 不进入 `classifyTool` 分类，也不发任何协议定义；同时，差集门禁以 `StaticTools.knownToolNames` 为唯一权威输入源，不包含 `ExecutorTool.fs` 中的历史定义。
- **替代方案及其反驳**：
  1. *为 `query-shell` 发送 `NoEstimate` 分类*：`query-shell` 已从 `ExecutorTool.fs` 与 `ExecutorToolSurface.fs` 彻底移除，也早已从静态工具清单 `StaticTools.knownToolNames` 中剔除；其准入权限曾绑定在已退役的 `query-shell-worker` 角色上，当前 Provider 根本不可见该工具。为不存在的工具添加协议分类，是给死代码发门禁通行证。
  2. *将 `query-shell` 加入 `knownToolNames` 以平息全仓字面量扫描*：这是本末倒置。差集门禁的职责是防腐烂——防止“新增工具进入系统名册却遗漏分类”，它的权威边界是“当前可暴露的已知工具名册”，而不是去穷举全仓所有历史遗留字符串。把已退役符号重新塞入名册会严重污染当前系统的权限与能力底账。
- **重新考虑的条件**：若未来业务需要重新启用轻量级只读查询工具，且将其正式注册回 `StaticTools.knownToolNames` 时，必须在第一优先级同步为其定义明确的只读估计分类。

### 为什么机器可判稳定标识（errorCode）与给人看的规则说明必须彻底解耦？

- **约束**：工具参数校验失败时，既要向上层提供可精准断言、不易受文案变化影响的机器错误码，又要向模型/用户提供通俗易懂的自然语言指引。
- **选择**：在 `InvestigationEstimateContract.fs` 中，明确区分机器标识 `errorCode`（如 `NotePresentWhenZero`、`MissingOrBlankNoteWhenPositive`、`MissingEstimate`、`NoteNotString`）与自然语言说明 `describeArgumentError`。
- **反事实禁令**：**严禁从 Fable 编译后的判别联合（DU）对象上通过 `.tag` 数值或 `.name` 属性反射抓取错误类型**。此前测试曾花一整轮代价从 `002.test.mjs` 与 `012.test.mjs` 中剔除对 `res.fields[0].name` 与 `.tag` 的脆弱依赖。编译期生成的 tag 编号极不稳定，只要 DU 新增分支或改变声明顺序，tag 就会整体偏移；而 `.name` 在压缩或不同 target 下亦无稳定保证。
- **重新考虑的条件**：除非项目完全放弃跨语言交互与单向数据绑定，且运行时由统一的原生反射框架全权接管，否则这一层显式解耦的协议字面量不可动摇。

### 为什么场景六（Blogger）的无增量断言直接扩充现有 schema canary，而非另立独立 canary？

- **约束**： 要求验证在真实的 OpenCode 运行环境中，Blogger 的专用工具（如 `chronicle`）在实际暴露给 Provider 的 schema 中不包含 `estimated_readonly_rounds` 字段。
- **选择**：在既有的 `requirements/host-boundary/tests/support/run-readonly-delegation-schema-canary.mjs` 中直接追加对 `chronicle` 的断言，复用同一进程与启动上下文。
- **替代方案**：为 Blogger 或非参与工具新建一个独立的 canary 测试脚本。
- **否决理由**：启动一个真实的 OpenCode 进程具有相当的时间与资源开销。现有 schema canary 已经在完整装载宿主环境并遍历非参与工具，追加一条断言几乎是零额外边际成本。若为了单一工具另起一套独立 canary 进程，不仅让回归测试变慢，而且分散了契约失败时的排查入口。
- **重新考虑的条件**：若 Blogger 的工具加载机制与生命周期从 OpenCode 扩展体系中剥离为独立的守护进程或远程微服务，既有 canary 无法触达其加载阶段时，才应当为之建立独立的集成验证管道。

### 为什么崩溃恢复（crash-reconciliation）不接管未 Bound 的 delegation 请求？

- **约束**：`crash-reconciliation` 的 Load Phase（`requirements/crash-reconciliation/WHAT.md` 条款 [018]、[020]）在加载阶段必须一次性结算上一 runtime 遗留且本进程无法继续持有的 durable 未决工作：仍活跃的子工作 run（写入 `ExecutionFactCases.ChildRunVoided`，测试佐证见 `requirements/crash-reconciliation/tests/020.test.mjs` L36-52）与仍开着的 Blogger 请求（写入 `BloggerRequestAbandoned`，reason `stale-open-at-load`）。但对于未 Bound 的 `DelegationRequested` 请求，Load Phase 并不扫描也不关停。
- **选择**：委托冷启动恢复的唯一入口由主模型 session 准入期的 `StrengthDelegate.tryCaptureAndStart` 触发。捕获与启动已在这一次调用中合并完成，不再作为两个跨请求阶段存在：捕获成功（`Captured`）时本次决策就地启动；未捕获（`Skipped`）时经 `executeSkippedRecovery` → `applyOnSurface` 的 `StartPending` 分支进入 `startPendingRequest`（`src/Wanxiangshu/Strength/OpenCode/Delegate.fs` L1305-1346），由它扫描持久投影中属于当前主会话与权威逻辑 run 的 `Requested` 记录，并在 `startRequest` 中集中裁决：若遇到契约版本不符（`request.ContractRevision <> contractRevision`，例如历史 v1 请求在 v2 运行时相遇）、Predictor 未配置或当前角色无权限，则在主会话上下文下直接追加 `Closed`（来源 `DelegationClosedFrom.Requested`，理由 `DelegationClosedReason.CannotContinue`；测试断言见 `requirements/speculative-investigation/tests/010.test.mjs` L166-198），主模型平稳继续，绝不发起旧协议子执行。
- **被否决的替代方案**：让 `crash-reconciliation` 的 Load Phase 也全局扫描 `DelegationRequested` 并就地关闭未绑定的旧请求。
- **否决理由**：
  1. *双重写者与决策竞争*：Load Phase 与随后唤醒的主模型会话若两处都在未加互斥锁的情况下探测旧请求，会在同一决断点上形成第二个写者，极易对同一次委托决策追加两次冲突事件；
  2. *权责与 Scope 缺失*：Load Phase 是全局恢复管线，执行时并不持有特定 owner 会话的完整上下文（如 `surface.Authority`、`PluginStrengthScope` 与 `OwnerSurface`），根本无法构造出合法的持久化闭合事件（`appendClosed` 依赖于明确的 `surface.Authority.AuthorityRootUserMessageId` 和会话归属）。
- **后果与前提假设（Consequences）**：这一裁量成立的根本前提是“委托冷启动必定会由主模型准入（`StrengthDelegate.tryCaptureAndStart`）经过”。由于委托必须依赖主模型的外发推理动作，未 Bound 的请求在主会话启动前处于纯静态持久事实状态，不会自行泄漏并发起外部请求；主模型冷启动时统一结算能保证所有事件拥有合法的 owner scope。后果是：如果存在一条不进入主模型准入却仍能直接读取并消费旧持久事件的绕行物理路径，该前提将失效，需要重新审视。
- **重新考虑的条件**：在多进程崩溃或重启场景中，若出现旧未 Bound 请求未被 `startRequest` 扫描结算、却在 durable 投影中滞留并干扰了后续主模型全新委托决策的可复现场景。

### 为什么配置存在性查询对非法配置直接抛错而非返回 false？

- **约束**：`requirements/execution-model-routing/WHAT.md` 条款 [020] 与 `requirements/speculative-investigation/WHAT.md` 条款 [014] 明文规定：启用状态从模型配置的 Predictor 槽位派生；槽位存在且候选非空即已配置；配置结构非法属于配置错误，必须明确报告，严禁静默变成“未配置”。
- **选择**：在 `src/Wanxiangshu/OpenCode/Plugin/PluginHooks.fs`（L277-286）中，`readonlyDelegationPredictorConfigured()` 匹配到 `ModelRouting.PredictorConfiguration.ConfigurationInvalid reason` 时，直接 `raise (InvalidOperationException(sprintf "execution-model-routing: Predictor model configuration is invalid: %s" reason))`。在 `src/Wanxiangshu/OpenCode/Plugin/PluginTransforms.fs`（L294-305）的 `predictorConfigured()` 中保持了完全相同的抛错实现；独立测试断言见 `requirements/execution-model-routing/tests/020.test.mjs` L59-62。
- **被否决的替代方案**：在配置非法时宽容处理，静默返回 `false`（等同于 `NotConfigured`），让系统装载假意通过并回退为未装饰状态。
- **否决理由**：静默返回 `false` 会向宿主和用户掩盖致命的配置破坏。当用户在配置中明确书写了 Predictor 槽位但结构写错或导出损坏时，若静默返回 `false`，宿主会看起来一切正常，工具 schema 悄悄退回不带协议参数的旧状态，导致只读委托功能神不知鬼不觉地失效。把配置错误伪装成“用户未配置”，是对契约的掩耳盗铃，属于破坏性的 silent fail-open。
- **后果与已知代价（Consequences）**：`toolDefinition` 在装载阶段命中非法配置时会当场 fail-closed 抛错中断。其已知代价是 `speculative-investigation/WHAT.md` [§5.5] 中所阐明的：“未参与工具不得被迫感知本协议”，但因为配置存在性查询在 `toolDefinition` 顶层统一执行，当配置结构非法时，即使调用的是未参与工具（如 fork、join、chronicle），也会被这道顶层硬门禁阻断，无法借短路避开这次失败。这是保证配置契约严肃性的必要代价。
- **重新考虑的条件**：若宿主（OpenCode）上游框架将模型配置的校验职责完全提升到加载前的静态 schema 验证期，并且在运行时模型查询接口中正式将“配置非法”定义为带有结构化诊断的良性只读查询结果（而非异常崩溃），则此处的即时抛错应改为向下显式传递诊断状态。

### 为什么持久化 Commit 对 Unknown 与 Conflicts 判定为 FailClosed 而非 Absent？

- **约束**：`requirements/durable-events` 与 `speculative-investigation/WHAT.md` 要求持久化事实必须具备严格因果性，重放与崩溃恢复绝不得产生幽灵凭证或非确定性前滚。
- **选择**：在 `src/Wanxiangshu/Strength/Replica/Commit.fs`（L42-55）中，`preparedUnknown` 与 `promotionUnknown` 在持久化结果为 `CommitUnknown` 并强制重读耐久投影证据（`StrengthDurableEvidence`）时，对 `Conflicts` 与 `Unknown` 一律返回 `StrengthCommitDecision.FailClosed`。只有确凿证明为 `Absent` 时，才允许降级：`resolvePrepared` 降为 `FallBackNoDelegation`（L45），`resolvePromotion` 转为 `RetryAppend`（L52）。对外契约映射见 `src/Wanxiangshu/Strength/Surface.fs` L619-650，基础类型定义见 `src/Wanxiangshu/Foundation/Outcome.fs` L98-117。
- **反事实知识与不对称性**：
  1. *Unknown 是未知，绝非不存在*：持久化写盘返回 `CommitUnknown` 意味着 IO 超时、进程中断或通信悬决，底层字节可能已经落盘，也可能尚未落盘。如果将其轻率视作 `Absent`，在 `Prepared` 阶段会导致系统误以为委托未发生而让主模型直接继续，随后迟到的落盘事件可能凭空唤醒一个未获准的副本；在 `Promotion` 阶段更会导致重复消费同一个 Candidate。
  2. *Prepared 与 Promotion 对 Absent 的刻意不对称*：`preparedUnknown` 在重读确凿为 `Absent` 时判定为 `FallBackNoDelegation`，因为此时尚未发生真实干预，放弃委托退回主模型执行是安全的；而 `promotionUnknown` 在重读确凿为 `Absent` 时判定为 `RetryAppend`，因为 Candidate 已经被目标执行消费，因果事实已经真实发生，绝不能回退为无委托，必须重试追加以闭合事实链条。这深刻体现了“还没写进去”与“写没写不知道”的本质区别。
- **后果与代价（Consequences）**：系统在面对磁盘或通信异常导致的悬决状态时，宁可让物理尝试在 `FailClosed` 停摆等待持久证据重新明确，也绝不自动前滚猜测。这意味着在偶发 IO 抖动时，部分本已部分成功的路径会停止执行以待耐久证据重读。
- **重新考虑的条件**：若底层存储层引入了带有两阶段确认与租约证明的强一致性读取协议，能够在重读阶段对“尚未写入”与“因物理不可达而无法探测”提供确定性的形式化证明，方可评估扩大 `FallBackNoDelegation` 的裁量适用范围。

### 为什么 Surface 应用在判定为 Replica 或内部叶子时就地 Skip？

- **约束**：WHAT [002] 规定来源不得是 Replica 或其他 InternalLeaf（如 Blogger 同伴）；Replica 仅能进行只读查证，绝对禁止发起第二层委托。Work 子会话（如 DevOps、Engineer 的 AgentOwnerRoot 续行）是合法委托来源，其 authority kind（HumanRoot 或 AgentOwnerRoot）不参与该判定。
- **选择**：在 `src/Wanxiangshu/Strength/OpenCode/Delegate.fs` 的 `planSurfaceApplication` 中（行号随重构漂移，以函数名为准）：
  ```fsharp
  if
      surface.RequestKind <> ProviderRequestKind.WorkMain
      || surface.HasPrefixProbe
      || surface.Ports.Runtime.IsReplica surface.Owner
      || surface.IsInternalLeaf
  then
      SurfaceApplication.Skip
  else
      decideTargetAction surface.Target surface.DurableProjection
  ```
  只要检测到请求不是 WorkMain、带 prefix probe、会话属于 Replica，或其 durable 关联分类为 InternalLeaf（Blogger 同伴等卫星会话），直接返回 `SurfaceApplication.Skip`，跳过目标决策，不进入 `decideTargetAction`。`IsInternalLeaf` 由 `SessionOwnershipClassification.classifyLegacy` 从 durable 关联派生，不从 authority kind、parentID 或角色名称推导。
- **反事实知识：两道物理闸的纵深防御**：
  - `planSurfaceApplication` 的就地 `Skip` 是**防递归的第一道物理闸**。它直接截断了 Surface 执行入口，使得任何 Replica 会话根本无法进入决策匹配（`decideTargetAction`），从物理源头上阻止了其生成 `ConsumeBound` 或 `StartPending`；
  - 随后在下游策略层（`StrengthPolicy.decide`，`src/Wanxiangshu/Strength/Policy.fs` L120 起；行号随重构漂移，以函数名为准）中，对 `isReplicaOrInternalLeaf` 施加了第二道硬拦截（独立测试见 `requirements/speculative-investigation/tests/010.test.mjs` L117-130 与 `requirements/speculative-investigation/tests/011.test.mjs` L152-175）。
  - 这两道防线独立存在、缺一不可。
- **被否决的替代方案**：移除外层的 `planSurfaceApplication` 检查，仅依赖下游策略层（`StrengthPolicy`）做集中拦截。
- **否决理由**：仅依赖下游策略层拦截是脆弱的。若外层不就地 `Skip`，Replica 的输出帧就会作为合法的 Surface 目标进入 `decideTargetAction`，参与决策比对与投影扫描。任何一处下游策略疏漏、分类漂移或新增加的内部动作，都会导致系统误将 Replica 输出帧当成主模型的合法业务来源进行消费，彻底击穿防递归不变量。Replica 输出在物理本质上就不是合法的 owner 来源，这与估算数值（`estimated_readonly_rounds`）大小完全无关——即使模型在副本内填写了正数，它也绝不能被当成来源。
- **后果（Consequences）**：嵌套委托在物理与拓扑层面上彻底不可达。矩阵 H12、H13 的测试断言以及迟到回调的物理尾部隔离均以此为确定地基。H03 覆盖的是策略层对 Replica 身份标志的响应——`isReplicaOrInternalLeaf` 由用例显式传入，断言 `policyEligibility` 返回 `Ineligible + replica-or-internal-leaf`、`policyDecide` 返回 `Skip` 与同一 reason，它不经过 `planSurfaceApplication`。capture 路径侧的同源判定由 `checkCaptureEligibility` 把 `IsReplica` 与 `IsInternalLeaf` 压进同一个 or 分支、共用 reason `"replica-or-internal-leaf"`；capture 路径构造 opportunity 时，`IsRootWork = not IsInternalLeaf`、`IsReplicaOrInternalLeaf = IsInternalLeaf`，两者由同一分类派生。该路径的自动化覆盖不在 `requirements/**/tests/*.test.mjs` 内。
- **重新考虑的条件**：除非产品架构发生根本性演进，正式引入了多层级、带全局配额树与防环检测的有界递归调查机制，否则外层 Surface 的就地 `Skip` 绝不允许移除或放宽。

### 当前未证边界清单：真实 Provider 容量为 1 时的父子无死锁

- **条款出处**：`requirements/speculative-investigation/WHAT.md` 条款 [013]（L144）：“同 provider 容量为 1 时，父等子不得死锁、不得双占；取消时 capacity fence 与 child 正确释放。”
- **为何单元与模拟测试无法覆盖**：现有单元与模拟测试（如 `execution-model-routing/tests/020.test.mjs`、`speculative-investigation/tests/010.test.mjs`）是在单一 Node.js 内存进程内通过 mock 调度器、静态数组过滤（`running.length`）与纯函数调用来模拟调度逻辑的。这些测试仅证明了“当 `running` 达到预设上限时 `route` 返回 `null`”这一纯状态计数不变量。但是，在物理真实的操作系统环境与网络栈中，当 Provider 真实网络连接池容量严格为 1 时，父会话等待子 Replica 释放 Token 的物理过程涉及到真实的异步套接字（OS socket）、HTTP 保持连接（Keep-Alive）、并发锁争用以及底层事件循环调度。内存 mock 既无法产生真实的物理阻塞，也无法捕获网络层套接字双占与物理级死锁。
- **为何严禁假装已覆盖**：若将内存单元测试的绿灯曲解为该条款已闭环，属于纸糊的假验证，会掩盖在真实极端并发与小容量部署下进程可能彻底挂起的物理风险。
- **最终验收标准与覆盖主体**：该边界必须在最终验收阶段，由 **DevOps** 在真实物理宿主环境（或通过集成测试框架集成真实网络桩 Integration Canary / E2E Harness）执行专门的长时压测进行覆盖：
  1. 配置 Provider 最大物理并发为 1；
  2. 触发父会话向同一 Provider 发起只读委托子任务；
  3. 实测验证父会话正确挂起等待、子 Replica 获取唯一连接顺利执行并归还、父会话随后被唤醒接续，全过程无套接字双占、无死锁卡死，且主动取消时连接与租约即时释放。

## 核心不变量

1. **事实估计与上限转换**：主模型给出任务位置的事实性估计，宿主经显式转换作为内部只读执行上限；协议剥离一切意图与信任叙事。
2. **逐工具判定**：仅第 5.2 节清单中的 12 个参与工具有协议增量，其余工具保持无增量，不侵犯同名业务字段。
3. **建议性短记**：短记填与不填、填什么形态，都不构成调用失败；短记单路传递，不升格为特权指令。
4. **同身份只读防递归**：同伴共享 owner 身份与语言，严格限制于 read/glob/grep；防递归由真实身份保证，不依赖副本填写 0 的假约定。
5. **批次封口与参与 max**：整批封口后只对参与子集取 max；未参与工具不影响聚合；非参与调用不读取、不校验。
6. **历史保真与离线迁移**：历史事件与记录不改写；新协议不保留运行时双解析，旧材料迁移保持离线与幂等。

## 违背边界的破坏形态 (RED)

- **意图与信任叙事复活**：在模型可见协议或说明中重新引入同伴分工、信任建立、保留控制权等主观说明。
- **全量无差别装饰**：对 fork、join、chronicle、terminal 等非参与工具添加估计参数，或侵占其同名业务字段。
- **短记升格为校验目标**：把短记形态（缺失、多余、空白、非字符串）重新当作调用失败，或在读取时私自改写字符串短记的内容。
- **依赖填写防递归**：要求副本必须填 0，或者因副本填写正数而触发递归或异常报错。
- **篡改历史数据**：在运行时就地修改旧版本持久化记录中的旧字段名，或在重放时强行应用新校验规则。
- **双启用依据**：引入配置之外的独立开关、环境变量或消融选项。

## DEPENDS ON

`repository-investigation`, `participant-identity`, `participant-horizon`, `provider-projection`, `semantic-trace`, `durable-events`, `execution-model-routing`, `context-compression`
