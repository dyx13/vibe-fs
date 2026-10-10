# durable-events — WHAT

## [001] retained writer 内 Event 是唯一 durable truth 与 append-only

所有动态业务状态必须且仅能由不可变的事件（Event）表达。业务状态变更改为追加新事件，状态撤销改为追加 tombstone/retirement 事件。在 durable-convergence-011 的 writer retention 窗口内，已提交事件不得被单独修改、覆盖、删除或重新解释；超过固定 TTL 的进程 writer 允许作为完整物理流整体退出 retained history。投影（Projection）仅为衍生状态，严禁先修改内存投影后补盘。

## [002] EventEnvelope 无版本与 additive vocabulary

事件信封采用无版本的统一结构（包含 `event_id`、`stream_id`、`event_type`、`parents`、`payload`、`payload_refs` 与内嵌 `payloads`）。信封与存储层严禁携带任何形式的 format/schema version 字段。已提交的 `event_type` 载荷结构一经发布即永久冻结；引入新业务语义必须声明全新的 `event_type`（追加词汇表原则）。

既有 `JournalEnvelope` 的业务词汇位于其 owner fact case；信封与已有 case 载荷同样冻结，新业务只能追加新的 case，不能给旧 case 加字段或改变其解释。新增 case 不改变物理 `JournalEnvelope` event_type。

## [003] canonical JSON 是 identity 协议

事件必须按规范化 JSON 序列化：UTF-8 编码、无 BOM、以单个换行符（LF）结尾；JSON 对象键必须按 Unicode 代码点升序递归排序；`parents` 与 `payload_refs` 数组必须先去重再按字符序排序，内嵌 `payloads` 对象的键同样按字符序排序。相同 `event_id` 产生不同字节流属于致命的标识碰撞（Identity Collision），必须 fail-closed；相同 `event_id` 且相同字节流则幂等去重。

## [004] local append 的提交原语为完整 NDJSON 行

本地事件持久化的唯一见证是在当前进程的 writer 文件末尾写入完整的 canonical 行（`JSON + LF`）。成功返回前必须完成物理落盘并同步释放存储门禁锁。运行时追加事件严禁创建 Git blob、Git tree、Git ref 或执行 Git CAS。任何半行、截断行或原地覆写均属非法。

## [005] Process 对应 single writer 与单个不分段文件

每个进程实例分配全局唯一的 `WriterId`，且仅独占追加 `.git/wanxiangshu/events/<WriterId>.ndjson` 文件。该文件不按体积、事件数或时间进行分段切片。进程退出后该文件封存且不得被新进程接管；超过统一 writer-retention TTL 后允许整文件删除。新启动进程必须创建新的 `WriterId`。业务流标识、机器标识与角色均不得作为物理写者划分依据。

## [006] commit outcome 只由本地事实存在性判定

提交成功的判定标准仅在于该事件的 `event_id` 是否已携带完全一致的 canonical 字节存在于本地事实流中。严禁通过 Git ref、内存状态或退出码反推提交状态。物理追加真正发生后的异常标记为 `CommitUnknown`；而在进入追加门禁前因写者关闭或损坏导致的拒绝必须标记为明确的未尝试状态。

本次调用在真正进入物理追加之前的异常为 `AppendNotAttempted`；进入追加之后的写入、durability barrier、Current commit 或锁释放异常为 `CommitUnknown`。重复请求或空请求没有产生新追加，其锁释放失败独立为 `NoNewWriteReleaseFailed`，不撤销已有事实，也不证明发生了新追加。错误必须保留原请求、实际 preparation（含 cut-tail）、阶段、原异常对象及有序 cleanup 异常；cleanup 不得覆盖主故障。Journal 懒写 `RuntimeStarted` 的结果属于初始化事实，初始化失败时当前业务事实仍为未尝试，后续 poison 拒绝保留首次失败的事件身份和原因。

## [007] StorageInvalid 全局 fail-closed

遇到格式损坏、非规范化 JSON、标识碰撞、retained writer 集合内部缺失父事件、成环依赖、载荷缺失/哈希失配或未知的权威 `event_type` 时，必须彻底拒绝以此快照构建投影或启动运行时，直接进入 fail-closed 状态。durable-convergence-011 已整体淘汰 writer 中的 parent 属于 retention boundary，不构成缺失父事件。绝对禁止跳过 retained writer 内的损坏事件继续折叠。

## [008] 并发 fork 不升级为全局 corruption

因并发产生的合法分支（DomainConflict）属于正常的物理并体现象，底层必须保留全部竞争事实，严禁将其升级判定为底层的 `StorageInvalid` 损坏。

## [009] 无 schema/store generation 与旧物理布局 shock cutover

存储层不维护任何数据迁移代次或平滑升级机制。对于历史遗留的旧物理格式、私有文件与早期临时存储结构一律采取完全不读取（leave-unread）的策略，禁止运行时双读、双写或自动数据迁移。

## [010] 单一 universal durable substrate 位于 .git 内本地事件文件

动态事件的运行时物理载体唯一限定在统一根目录 `<git-common-dir>/wanxiangshu/` 下的 `.git/wanxiangshu/events/*.ndjson`。事件行自包含全部载荷，不存在独立的 payloads 目录。所有业务领域的信封全部进入这套通用文件体系，禁止任何模块维护私有 journal 文件、私有数据库或旁挂载荷文件。历史遗留的 `.git/wanxiang/` 布局按 [009] leave-unread 处理：不读、不写、不自动迁移。

## [011] Git blob 只存在于 remote sync 边界且单文件对应单 blob

Git 对象数据库绝不是在线事件存储。仅在用户执行 Git 远程操作并触发 Hook 时，完整的本地 writer NDJSON 文件才被编码为恰好一个 Git blob。运行时主进程不主动发起远程同步，亦不在��件追加过程中操作 Git blob。

## [012] PayloadRef 与本地 payload closure

体积庞大的正文内容按内容哈希生成不透明的 `PayloadRef`，其内容内嵌于同一事件行的内嵌 `payloads` 字段，事件行自包含（ndjson 是唯一载体，不产生旁挂文件）。事件追加成功前，其引用的所有 payload 必须已内嵌于事件行且哈希完全匹配；引用缺失或哈希失配构成 `StorageInvalid`。内嵌后单行体积随载荷增大，无固定上限；实际体积边界由存储性能与 GC 条款联合验证。

## [013] 查询只读正规 Integrator 的 Current 且先 commit 后 integrate

任何业务查询不得手动全量扫描、过滤或折叠事件历史，必须且只能读取唯一的规范 Integrator 维护的 `Current` 积分状态。修改状态可以先计算待提交状态，但只有本地事实完整追加成功后才能原子推进 `Current`；追加失败或提交闭包未执行时，事件、结构 head 与所有业务 Current 必须保持提交前状态。

## [014] k-way 输入顺序与确定性积分

每个 writer 文件内部按自然追加顺序排列；先按 durable-convergence-011 的统一截止时刻过滤整条过期 writer，再通过确定的 k-way merge 算法产生全局一致的规范序列。Integrator 按此顺序确定性消费事件，相同截止时刻与相同 writer 集合在任何环境中必须计算出完全一致的 `Current`。

## [015] business fold 不变量与失败拒绝

业务折叠规则对关键事件不变量进行严格校验（如不可重复捕获、游标单调递增、摘要与哈希匹配等）。若任一不变量不满足，当前事实必须被语义拒绝，并触发持久化重置机制，防止脏状态污染投影。

## [016] Git 物理概念不外泄至领域层

`GitObjectId`、`RootOid`、`StoreSnapshot` 等底层物理概念仅限内部基础设施使用。业务领域层严禁直接引用或感知这些底层类型，领域层只与 `EventEnvelope` 和 `PayloadRef` 交互。

## [017] local append 复杂度不得依赖 history 与 Git

向本地追加事件时，运行时的 Git 对象、树和引用操作数必须恒为 0。追加开销仅与当前事件及关联 payload 的字节大小相关，绝对不随历史事件总数或历史文件大小增长。

## [018] remote 操作才同步且全量替换快照

远程同步仅在用户执行 Git 操作时由独立 Hook 进程拉起执行。Hook 对本地 writer 文件与远端 writer blob 应用统一 writer-retention 后进行 k-way merge 校验，物理删除过期本地 writer，并发布不再包含过期 writer 的远端快照。万象术主进程不运行常驻同步定时器或后台上传器。

## [019] 唯一 canonical Integrator 与业务注册 integration oracle

系统仅存在一个规范的 Integrator 负责历史事实的解释与积分。各业务模块仅向 Integrator 注册单个信封的纯计算折叠规则，业务模块自身不拥有读取底层历史或重写重放循环的权限。Structural、Journal、Strength、Casebook 与 JsTransaction 的注册必须可由 production surface 上的反例观察：删除任一注册后，该领域的合法 live fact 不得仍产生预期 Current；源码 token、注册名称或调用次数不构成语义证明。

## [020] plugin load 仅验证物理可读性且延迟业务激活

插件加载阶段仅验证存储文件的物理可读性，绝对不执行业务重放、崩溃修复或新事实写入。业务积分与水印追加必须延迟至首次实际消费持久化能力时触发；激活重放只枚举当前 retention 窗口内的 writer，过期文件无需读取或解码。

## [021] semantic failure 写入 durable cut-tail 且当前进程 fatal

当注册的业务折叠规则对合法信封返回语义错误时，系统在持久化保留该错误事实的同时紧随写入 `ProjectionCutTail` 重置事件，以隔离故障作用域。产生坏事实的当前进程必须立即 fatal 退出以防内存状态被污染，由重启后的下一代进程从重置后的 `Current` 安全接续。

## [022] EventStore contract/runtime 编译闭包必须单向且有界

`EventStore.Model.Contract` 只拥有 `EventEnvelope`、`EventStreamId`、`PayloadRef` 等稳定领域模型；`EventStore.Port.Contract` 只拥有 append/read 所需 request/result/error 与 `IEventStore` capability；`EventStore.EventVocabulary.Contract` 只拥有 canonical EventStore event type 集合，并仅依赖 `Strength.EventVocabulary.Contract` 等更基础词汇。`EventStore.Core.Runtime`、`EventStore.Git.Runtime`、Canonical Integrator、Journal、Host acquisition 与 test surface 必须依赖这些 contract，反向依赖禁止。业务 consumer 的 transitive compile input 不得包含 Git object/ref、process/file codec、Canonical Integrator、Strength predictor/replica/runtime 或 Host adapter。

Git 同步所需 object/ref 类型与 `IGitRawStore` 只能位于独立 physical-port contract，由 Git/sync adapter 消费，不得经 `EventStore.Port.Contract` 暴露给业务消费者。Contract locality 的 transitive production `.fs` 不得超过 100；focused EventStore runtime locality 不得超过 185。所有 locality compile 必须由 ProjectReference closure 生成一个零 ProjectReference flat project，并由一次 Fable invocation 编译。

## [023] canonical codec、领域 fold 与物理 store 必须分层

`CanonicalEventCodec`六个公开操作共同定义同一canonical identity协议，必须形成durable-events拥有的bounded pure contract；merge、sync、integrator、surface及core runtime按locality显式引用该完整slice。禁止让merge runtime为取得codec反向依赖`EventStore.Core.Runtime`。Delegation及其它领域constructor只能产生owner-owned fact case、intent、fold state与closed rejection；`AgentFact` outer union、跨projection组合及journal append只由durable composition routing拥有。`ProcessEventLog`、Store factory、file/lock lifecycle继续是effect，不得进入codec或领域fold contract。

## [024] semantic cut fatal 必须先settle再经mandatory capability执行

semantic fold失败必须先durable写入对应bad fact与`ProjectionCutTail`，取得committed或unknown settlement evidence，再构造typed fatal incident。caller只持有构造时必填的fatal capability；不得直接引用`FatalProcess` physical implementation、optional/default fallback、module-global binding或service locator。同一incident只有一个report owner与一个kill owner，重复调用及fatal-before-settlement一律拒绝。

## [025] persistence cut stores禁optional fatal hook，唯一fatal owner在composition

`StrengthDurability` 与 `CasebookStore` 不得保留 module-global optional `fatalTripHandler`（默认 None、从未注册即为 dead capability）：semantic-cut 分支只返回 typed 结果（`StrengthPreparedPublish.Rejected` / `Error reason`），fatal 决策唯一归属 composition 侧既有 owner（Strength `Append` 侧 `PluginStrengthPorts.commitAppendResult` 的 `Diagnostic.fatal "strength-semantic-cut"`；`PublishPrepared` 侧 `Rejected` 即为 owner 可观测的 cut-settled 信号）。`JsToolsTransactionStore.appendPrepared/appendCommitted` 的 `FatalProcess.trip "js-transaction-semantic-cut"` 是同一 boundary 的 process-fatal 实现：cut 已由 Integrator 先行 durable settle（bad fact + `ProjectionCutTail` 同一次 append 落盘）才 trip。Prepared cut 前无任何 file effect；Committed cut 后 recovery 按 Committed/Unknown 精确区分，Unknown 永不视为 not-written。法律依据见 `requirements/durable-events/tests/` 下 Prepared/Committed cut 回归测试与各 owning package 的 WHAT-025/013/006 条款。

## [026] 历史材料只能经离线迁移导入为全新导入事实

协议升级需要接纳旧事实时，唯一合法路径是离线一次性迁移：经 EventStore 所有者的读取、payload 与 append 边界，在备份或副本上追加**仅承载历史材料的导入事实**。导入事实是全新的 `event_type`（追加词汇表原则，不与旧类型同名复用），载荷只重建旧事实的因果位置、digest、payload 引用与覆盖范围等历史证据。导入事实不得充当任何新时代协议的准入凭证：不得由它推导出可运行的授权、绑定或候选，不得产生副本，也不参与新委托的生命周期判定。

存储层不因导入而出现迁移代次：[009] 的 leave-unread 与拒绝语义不变，运行时不双读、双写、不自动迁移、不维护旧载荷解析；未迁移的旧存储由入口检查拒绝以新运行时消费并给出明确迁移指引，禁止边读边跳过。迁移不得原地改写 append-only 历史、Git raw object 或 refs，不得清库，不得覆盖用户配置；envelope 父边、payload refs、decision 引用与 XTrace 因果锚点必须保留或正确重建，并以 cold replay 对照证明业务 Current 一致。迁移工具、输入/输出版本与一次性操作步骤由 owning package 提供自动化测试。
