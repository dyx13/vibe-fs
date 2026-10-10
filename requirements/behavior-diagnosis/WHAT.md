# behavior-diagnosis — WHAT

## [001] live Rulebook 是唯一规则真相

每条规则的唯一语义身份恒为 `TipName = RuleId = FieldName`。live Rulebook 仅由 shipped built-in 目录（basename 即 TipName）合成，形成单一 `EnforcerCatalog`，共享全局唯一的 TipName 命名空间、同一 Blogger system prompt 与 Main 处置手册索引。禁止设立 `catalog.json`、shadow learned catalog、运行时专用规则库或任何平行身份清单。

## [002] 规则装载与准入校验 fail-fast，零 fallback

启动时装载 built-in 规则失败（目录缺失、叶子缺失、文本为空、Domain 校验失败）必须立即进程级 fail-fast，不跳过、不警告降级、无代码内置 fallback 规则、无双副本备份。

## [003] live union Domain 校验合同

`EnforcerCatalog.validate` 对 built-in live Rulebook 的校验要求：`schemaVersion = 1`；至少存在一条规则；Name / RuleId / FieldName 各自唯一且三者两两恒等；LexicalOrder 连续 `1..N`；EnforcerText / MainText（及双语对应正文）经 trim 后非空。LexicalOrder 是集合的确定性派生序。

## [004] 检测语料全量、确定性进入 Blogger system prompt

有效的 Blogger effective system prompt 由基础 Blogger prompt、`# Enforcer Rulebook` 标题、live Rulebook 全部 `## <TipName>` 及其对应当前语言的 EnforcerText 全文按 LexicalOrder 确定性拼接而成。同一 live union 集合合成完全一致的字节。合成结果为内存派生产物，严禁写回文件系统或作为第三份规则真源。

## [005] 多语言本地化叶子完整性合同

built-in rule 的本地化语言叶子遵循同一合同进入 live Rulebook：正文非空且 TipName / RuleId / FieldName 恒等。投影层按 provider 语言选择对应正文，无跨语言 fallback。

## [006] chronicle 结构化判词合同与 NoLiveCycle 协议结果

当前 provider-facing `chronicle` 必须完整提供 `charge`、`occurrence`、`settlement`、`consequence` 与 `tip`，并可选提供 `evidence`。前四个字段均为 trim 后非空 string，分别表达“为什么这轮必须发生”“真正发生了什么”“现在什么已经成立”“后续道路因此怎样改变”，并应各自写成一条可独立阅读的完整判词；`tip` 必须可归一到 TipName。缺失或空白的任一必填内容字段均不得形成有效 cycle；缺少 tip、空 tip 或非 string tip 必须稳定返回错误面。

`evidence` 只允许作为最小决定性**原文摘录**：可摘 code、data、wire、log 或其它 raw source，必须保持摘录原文，不得改写、总结或搬运大段上下文；没有实质增强判词的原文证物就省略。它必须是 string，空白等价于省略，长度不得超过 1024 字符。

四个结构字段只约束 provider 输入，不作为 Chronicle 正文的小标题。形成 durable frame / LWR 文本时，系统按 `charge → occurrence → settlement → consequence` 固定顺序，把每个字段内部换行折叠为空格，再用单个空格连接为一个自然段；正文不得包含字段名标签或人为分段。若存在 evidence，则仅在自然段末尾追加一次 ` [...]`。evidence 内部真实的 CR/LF/TAB/Unicode line separator 必须编码成字面转义，括号内部不得出现真实换行。

evidence **不得**另写独立 evidence blob：所有新 materialize 的 Chronicle cycle 都令 `MergedEvidence` 为空，证物只存在于同一个 Chronicle frame 的段尾 `[...]`。升级前已经落在 Host transcript 中的 `entry/text` 只保留为 recovery 身份；仅当新四字段全部缺席时才可按 legacy call 解码，旧调用随带的 legacy evidence 可以被识别但不会重新落盘。新旧内容协议字段混用必须拒绝；新 tool schema 不再暴露 `entry` 或 `text`。

若物理工具调用到达时不存在存活的 Blogger cycle，宿主层必须产生封闭的 `NoLiveCycle` 协议结果并终止过时 session，仅在最外层工具适配器编码为宿主异常。

## [007] tip 确定性最近映射与无未知分支

`tip` 参数查找前先执行 trim。精确命中已装载 rulebook 的 TipName 时直接映射；否则对全部 TipName 计算 Levenshtein 编辑距离并选取距离最小者。最小距离并列时选取 LexicalOrder 最小者。任何非空 string tip 都必须解析为一条确定规则，不存在 `UnknownTip` 或规则逃逸分支；RuleId = FieldName = TipName 恒成立。

## [008] 彻底剔除数值评分路径与桥接字段

解码与运行时表面不暴露任何 `Scores`、`parseScore` 或数值严重度字段；输入中的额外数值属性被安全忽略且不得复活评分路径；`ScoreWhen`、`Nudge`、`Family`、`CatalogOrdinal` 等桥接字段在装载后均不存在。诊断语义是离散的单条 tip 选定，而非数值积分向量。

## [009] 每个 provider run 必须且仅能调用一次 chronicle

一个 Blogger provider run 只有在原始 assistant step 中恰好包含一次 `chronicle` 调用时，方有资格形成有效 cycle。包含 0 次或 2 次及以上调用的情形均属协议违约，严禁内部合并、严禁提交 `BlogObservationCommitted`、严禁推进 coverage。terminal 状态前只等待宿主收敛工具调用，terminal 后统一进入有界协议修复。

## [010] Cycle provider-run 身份 fail-closed 门禁

通过单次调用基数校验后，Cycle 仍须提供可验证的 `ProviderRunIdentity`（非空 messageId）：缺少 messageId 立即触发 `enforcer-cycle-failed` 致命失败。缺少或非法 ToolCallId 导致无法形成规范调用时，按协议违约进入有界修复；身份证据不足的 provider run 严禁提交。

## [011] fail-closed 内容硬界约束

单 cycle 内容硬界约束（违背则 fail-closed 并报 `enforcer-cycle-failed`）：新协议四句正文与可选 inline evidence 先渲染为同一 canonical Chronicle text，渲染后的 UTF-8 文本不得超过 512 KiB；其中 inline evidence 在 decode 时另有 1024 字符硬上限。所有新 cycle 的独立 evidence 通道为空，不得产生 EvidenceRef。历史兼容代码仍能识别旧 evidence 字段与旧 durable EvidenceRef，但不会把 legacy evidence 重新物化为新 blob。阈值、计量结果与拒绝分支必须由 owner 的纯 decision 拥有；提交解码器与 semantic surface 只能消费该 decision，严禁复制业务判定公式。硬界属于安全防线，严禁演化为启发式评分参数。

## [012] BlogObservationCommitted 是唯一原子 cycle 事实

每次正常 cycle 的提交由唯一的 `BlogObservationCommitted` 事件原子承载：包含工作日志 frame 追加、RecordCoverage 推进、单一 TipRuleId/FieldName、provider/tool 身份及大文本 blob 引用。不存在独立的 `EnforcementCycleCommitted` 事实；监督状态由 BlogEntry 纯函数派生，保证日志与覆盖范围推进同生共死。

## [013] Coverage 严格单调推进出生门与提交前校验

Coverage 出生门：若待覆盖区间的 Next ≤ Prev 或 NextCursor 无法映射，必须拒绝生成 context chunk，严禁启动零推进的 Blogger 窗口。提交前执行持久化一致性预检：若 staged cursor/cutoff/epoch 与当前投影不一致，返回 `KnownNotCommitted` 并可恢复弃置，严禁先写事件再被 fold 拒绝。

## [014] 每 cycle 恰好派生一个 RecentTip，容量有界且重放幂等

每个已提交 cycle 恰好派生一个 RecentTip（包含 RuleId、FieldName 与 CycleId）。RecentTips 集合容量有界（最大 8 项），按 oldest → newest 严格排序。同一 ProviderRun 重复提交时必须幂等拒绝，不产生重复收据。

## [015] tip 与 frame 是不可拆分的配对观察视图

Observation 历史是诊断 tip 与 Blog frame 的不可拆心配对视图：前向 zip（tipᵢ ↔ frameᵢ），剩余侧 unpaired 追加；tip 锚定视图丢弃无 tip 的 frame，严禁发明假 tip，严禁维护平行独立的 tips 与 frames 数组作为权威历史。

## [016] 历史压缩协同裁剪，不创造新 occurrence

执行 squash 压缩（`BlogObservationsSquashed`）时，将最老 K 个 frame 折叠为一个 Squash frame，并同步按 1:1 比例共同裁剪最老 `min(K, tips)` 条 RecentTips。squash frame 本身不新增 tip、不触发新的 Main 交付，仅作为历史表示形式的变换，严禁借历史压缩伪造新的诊断事件。

## [017] 无效 cycle 的有界协议修复与 AABB 状态恢复

未形成有效 cycle 的 terminal（0 次调用、多调用、缺 tip、新四字段任一缺失/空白、evidence 非 string/超长、或新旧 chronicle 内容协议混用）进入有界协议修复流程：
1. 首发 Nudge 必须且仅能由处于完全静止的 idle terminal 发起，禁止在 transform 阶段发送。
2. 每个 `BloggerRequestId` 至多获得一次 Nudge 修复机会；同一 terminal run 重放保持幂等。
3. 纯文本 terminal 不得依赖后续 transform 唤醒，由 `SessionIdle` 触发专用 nudge。
4. Nudge 后的再次无效 terminal 记录 confirmed failure 并无条件执行首发 AABB；AABB 阶段严格保留 BloggerRequestId 与目标 terminal 身份。
5. 恢复重判仅从包含 `ToolName=chronicle` 的 completed 工具执行状态派生，禁止猜测或别名兼容。

其中“再次无效 terminal”必须由**新的 ProviderRunIdentity** 证明；同一 terminal 的 Nudge claim 在并发 idle/reconcile 中被第二个观察者再次看见，只能解释为 `AlreadyAdmitted` 并幂等等待，严禁伪装成 send failure、严禁提前推进 AABB。任何依赖错误字符串（例如匹配 `already claimed`）区分幂等冲突与真实发送失败的实现均为 RED。

## [018] RulebookRevision 按 Blogger life 冻结与生效边界

Blogger participant life 在创建时绑定确定的 `RulebookRevision`，同时决定 system prompt 字节、`chronicle.tip` 枚举、解码映射表与 Main 处置索引。Blogger life 存活期间四者保持冻结，新规则的诞生不打断当前 in-flight cycle，仅在下一 cycle 创建 fresh life 时绑定最新 revision，确保 byte stability 与工具定义不分叉。Blogger 唯一定义的 `chronicle` 工具属于非参与工具，无只读委托协议增量，亦不承载任何估计字段；Blogger 不具有发出只读委托授权的权能，且不参与委托协议。这不改变 [004] 的 system prompt 合成与 RulebookRevision 冻结语义。

## [019] Enforcer fatal 只解释typed incident且经mandatory capability执行

cycle failure必须先得到typed protocol-exhausted或commit-unknown evidence，并完成该路径要求的durable settlement，再构造behavior-diagnosis incident。runtime只接受构造时必填的fatal capability；不得直接引用physical adapter、使用optional/default/global fallback，或在Host/Journal层重复fatal。同一incident只允许一次report与一次kill。
