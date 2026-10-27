# repository-programming — WHAT

## [001] Capability 投影面与单一权限源

每次请求的 `todowrite-for-ROLE` 工具只从该 Attempt 的唯一权威能力集生成，不另算 role→JS 权限。没有文件系统 primitive capability 时不生成 `todowrite-for-*` 工具。

## [002] 四层同构应用

每项文件系统 capability 在公开基类、工具描述、canonical examples 与运行时门禁中一致投影；缺失能力在四层均不可用，伪造调用也须拒绝。一项能力可生成固定顺序的同权成员族，不产生第二份授权。

主原语族按能力投影为：Read → `cat`/`stat`/`whereAll`/`where`，Glob → `ls`，Grep → `rg`，Write → `write`/`mkdir`，Move → `mv`，Remove → `rm`，Exec → `call`，Fork → `fork`/`dag`，Resume → `resume`，Commission → `commission`，DevOps → `devops`，Join → `join`，Fission → `fission`，Horizon → `horizon`，Advisor → `advisor`；canonical 成员序为 `write, rm, mv, cat, ls, rg, stat, mkdir, whereAll, where, call, fork, resume, commission, devops, dag, join, fission, horizon, advisor`（生命周期成员 `park` 在基类与运行时绑定中携带，不进入 `members` 列表）。`dag` 是 `fork` 波次加一次 `join` 的纯糖，因此只在 Fork 与 Join 同时投影时才出现：公开基类、运行时基类与 `members` 列表同一条规则，成员列表里不会出现没有方法体的 `dag`。委派成员 `fork`/`resume`/`commission`/`devops`/`dag`/`join`/`fission`/`horizon`/`advisor` 一律走编程面 `this.xxx`，宿主不为 `fork`/`resume`/`commission`/`devops` 注册独立工具。`ToolPermission.Edit` 不再投影任何 `JsCapability`；旧成员 `glob` 与 `file`/`edit`/`rewrite` 均已从仓库生成编程面彻底退役。Plan 使用共享成员和 `PLAN_PATH` 单文件闸门。`grep(needle, pattern)` 已退役，Grep 现在只投影 `rg(argv)`。

## [003] 确定性生成

同一角色与能力集生成字节相同的工具名称、Schema、描述、基类及示例。执行档位不进入名称，也不改变同角色的编程面。

## [004] 生成工具名门禁

只接受当前 Attempt 实际拥有的生成工具名。其他角色或旧 Attempt 的名字须拒绝；名字合法不能代替当前能力授权。

## [005] 编程面与推荐诚实性

公开基类、描述和示例只包含当前可执行成员，不暴露宿主私有接口或注入键。（原直连宿主文件工具的说明钩子 `BuiltinToolDescriptionHook` 已随直连工具整体退役，现行契约归生成的 js 编程面。）

## [006] 沙箱隔离与无 Ambient OS 权限

用户程序只获得显式纯数据与受控原语，不直接获得文件系统、网络、进程或环境变量。`todowrite-for-*` 不设整次调用的总时限，`join` 等待及恢复后的程序不因等待时间长而失败。同步执行片段仍有硬性超时，输出仍有上限；`rg`、`call` 等具体操作可以有各自的限制，不得把这些限制提升为整次程序的总时限。结果只由 `run()` 的结构化返回值决定，stdout/stderr 不作为编辑产物。

## [007] 不可变快照与 Anchor 代数

`cat(path)` 返回当前事务的不可变 UTF-8 字符串快照并登记写前 `FILE_CHANGED` 校验使用的读快照；后续 `write` 修改不改变已取得的快照字符串。非法 UTF-8 拒绝为 `INVALID_UTF8`，不猜测或修复编码。

在生成编程面中，旧 `file(path, matches)` 与 `FileView.text(from, to)` 已退役，定位与截取改由 `where`/`whereAll` 返回的 UTF-16 代码单元下标 `[begin, end]` 与 `text.slice(begin, end)` 组合完成；Plan 复用相同成员签名与 UTF-16 偏移语义。

## [008] 确定性路径枚举

`glob(pattern)` 确定性枚举 gitignore/wildmatch 路径：`*` 不跨目录，`**` 匹配零段或多段目录；遵守各级 `.gitignore` 与 exclude，不进入 `.git`，不跟随符号链接。内部不截断，超限由宿主结果留尾规则处理。

## [009] Grep Capability 投影

`rg(argv)` 只由 Grep capability 授权；Read+Glob 不代替它。参数只有一个 argv，是字符串数组。搜索固定加上 `--json` 后原样传给 `rg`，调用方不再传 `--json`；没有路径时不替它补工作区。成员不追加 `--no-ignore`；要搜索被忽略的路径，由调用方写进 argv。`--files`、`--files-with-matches`、`-l`、`--files-without-match`、`--count`、`-c`、`--count-matches`、`--quiet`、`-q`、`--vimgrep`、`--type-list` 与 `--json` 互斥，所以这些模式不加 `--json`，原样传给 `rg`。返回值都是 JSON 对象，不是文本：内容搜索是 `{ exitCode, messages }`，`messages` 是解析后的 JSON Lines；上述模式是 `{ exitCode, paths }`。`exitCode` 为 `0` 表示有结果，为 `1` 表示成功但没有结果，二者都是数据。argv 不是字符串数组时为 `INVALID_ARGUMENT`；路径越出工作区为 `PATH_DENIED`；其余 `rg` 失败为 `RG_FAILED`。

## [010] Rewrite、Write 与 Mkdir 的落盘语义

生成编程面的 `write(path, content)` 覆盖已有文件或创建缺失文件（合并原 `edit`/`rewrite` 的覆盖职责），等价于 POSIX 重定向：一次原子写、即写即生效；目标已存在时记为 `Rewrite`，缺失时记为 `Create`。写入前若目标已通过 `cat` 读取且盘上内容已变，报 `FILE_CHANGED`。`mkdir` 只建一个目录，非递归；已存在报 `DIRECTORY_EXISTS`，父目录缺失报 `PARENT_DIRECTORY_MISSING`。底层提交计划单元中 `rewrite` 要求目标已存在（缺失报 `FILE_NOT_FOUND`），同一计划对同一路径只能声明一次文件修改意图（重复报 `DUPLICATE_MUTATION_TARGET`）。

## [011] 可表示的返回值与提交前校验

返回值限于 JSON 兼容子集：null、布尔值、有限数字、字符串、普通数组与对象；数组不得含 null 或异构类型。undefined、BigInt、NaN、Infinity、函数、Symbol、循环引用及其他非法值均在提交前以 `INVALID_RETURN_VALUE` 拒绝，终止事务。

## [012] 事务 As-Is 逐笔落盘与单一 EventStore 记账

一次调用只有一个事务。每笔 `write`（以及 `rm`/`mv`）在调用发生时立即经 MutationFs 原子写盘（单笔文件层原子，跨笔不回滚）；`run()` 成功结束前磁盘已经反映已发生的每笔写入。程序以任何方式终止或挂起（throw、超时、输出超限）时，那一刻之前已落盘的改动保持为事实分界线，之后的未发生。

持久化 Prepare 与 Commit 只进入统一 EventStore，不另建专有文件或存储。记账时机：每笔的 Prepared 在写盘前发起（调用时序、TransactionId 成对，写失败留下无 Committed 配对的 Prepared 作中断证据），Committed 在该笔写盘成功后发起；物理落账由程序终局的结算（settleLedger）await 全部 append 完成，成功路径保证 Prepared/Committed 成对排空。单笔的物理落账发生在该笔写盘之后的同一事件循环回合（微任务），只有进程级死亡才可能丢失末笔审计。

## [013] 写前校验、提交计划与 durable 记账失败映射

写前校验作为实现单元保持精确形状并短路：重复的修改意图最先报 `DUPLICATE_MUTATION_TARGET`，缺失目标按快照校验报 `FILE_CHANGED`，全部通过才继续。提交计划（commitPlan）输出精确的执行序列（rewrite 携带 expectedCurrent，create 携带文本），成功时把计划内全部目标写入；计划内某笔写失败时以 `TRANSACTION_COMMIT_FAILED` 失败，并按计划内还原序把已写目标还原——该还原是实现单元自身的语义，工作流主路径仍按 [012] 的 as-is 逐笔落盘。

durable 记账追加失败时（Prepare 或 Commit 阶段的各失败形态），程序结果为 Failed，给稳定码 `TRANSACTION_PREPARE_*`/`TRANSACTION_COMMIT_*`，不报告成功；按 [012]/[029] 的 as-is 语义，已落盘的文件效果如实上报且不回滚。失败不重试追加、不换新事务身份，并携带原事件 id、事务 id 与原始 cause；Prepared 失败后 pending 投影为空（记账未完成），Committed 失败后原 Prepared 仍留在 pending。

EventStore 端口的坏输入防御先结算物理事实（append、fsync、close、release 的确切计数与落盘字节），再经唯一的语义熔断（`js-transaction-semantic-cut`）以 SIGKILL 终止；对 Release 阶段的坏输入，最终报告保留原请求事件身份。

## [014] 冲突检测与无隐式重试

每次写前各自做冲突校验（校验点从统一 preflight 移到每次写前）：若目标路径在 readSnapshots 中，读取当前盘字节与快照比对，不一致时以 `FILE_CHANGED` 失败并停止；已发生的改动保留在盘上。不自动重读、不重定位锚点、不重跑程序。

## [015] 中断证据与重开不重放

Prepare 已入账而无 Committed 是中断审计证据：pending 投影保留该记录，跨 EventStore 重开仍可见。重开只观察证据，不自动重放、回滚或补交事务，磁盘保持中断时已落盘的状态。

物理写失败以 `TRANSACTION_COMMIT_FAILED` 失败，失败笔之前的 as-is 已落盘改动保留。新时序下：写成功的笔保有完整的 Prepared/Committed 配对；写失败的笔留 Prepared 作中断审计证据——中断证据即无 Committed 配对的 Prepared。程序以返回值非法等方式失败时，此前已写成功的笔同样保有完整配对，不留 pending。每笔写入经 MutationFs 单笔原子落盘，重开不盲目重试模糊的半完成提交。

CAS 还原（rollbackPlan：restore 与 removeCreated，逆序）保留为实现单元，还原时按 expectedCurrent 比对、不覆盖第三方已改内容；TransactionStore 不提供手动历史读取接口。

## [016] Synthetic TOML 结果面

成功以 `# ok` 开头，返回值放在 `[data]`、`data = ...` 或 `[[data]]`；有实际写盘时，文末 `[fs]` 声明 rewritten/created 路径。失败以 `# failed` 开头，根级给稳定 code 与可读 reason，并附本次调用已真实落盘的改动清单（`[fs]` 的 rewritten/created）；无已落盘改动时失败不附 fs 节。

成败由顶级结构区分，不另用 `status = "ok"` 等歧义字段；编码与组合遵守 provider-projection。

## [017] 并行调用安全与确定性串行提交

同一助理消息的多个工具调用由宿主按确定顺序逐个执行，各为独立事务，后者读取前者提交后的状态。同文件修改顺序叠加，不丢更新；不同文件仍各自原子提交。

## [018] 稳定失败代数

预期失败使用稳定具名错误码，不笼统压成 `PROGRAM_FAILED`。原因只给受控摘要，不泄露沙箱内部代码、宿主路径或敏感环境；具体原语的错误码按对应条款。

## [019] 失败不产生 durable Commit，已落盘改动保留

程序以任何方式失败（throw、返回值非法、目标缺失）时结果为 Failed，不产生 durable Commit；失败前已按 as-is 落盘的改动保留在盘上——非法返回值不撤销已应用的重写。新旧内容完全相同时成功且不做无意义写盘。

## [020] 文件变换的 POSIX 语义

编程面成员 `mv(from, to)` 移动或重命名文件及目录，支持覆盖，源缺失报错；`rm(path)` 删除文件或空目录，拒绝非空目录。参数错误与操作系统失败给稳定可读结果。（原独立宿主插件工具 `mv`/`rm` `ToolSpec` 与 `FileMutationSurface` 已退役，由 `Move`/`Remove` 权限投影的 js 成员承担同一契约。）

## [021] 禁止手写 per-role 工具变体

角色编程工具统一按角色及其已授予能力生成，不手写各角色变体；合法工具名登记中的枚举不承担额外授权。

## [022] 工具选择与失败经验引导

描述先给可执行形态与原语选择，再给显著风险和失败经验：

- 用 `cat(path)` 读取不可变快照，用 `where`/`whereAll` 定位精确 span，用 `text.slice` 重组后交由 `write(path, content)` 一次落盘；查找替换、批量替换与追加均由主原语组合表达，不手算裸字符串边界或退回盲目修补。
- 按当前角色实际投影的 capability 教授可用原语与组合食谱（`recipes`），不教授未投影成员，并保留展示角色职责的 Ultra Example。
- 在同一快照上从可信切片构造完整目标文本后一次写入，不留残片给后续 cleanup 程序清理；动手前先承诺规模、标题与 section 数等廉价不变量，越界时作为停止信号立即失败。

## [023] 精确切片替换与 Write-only 能力边界（原 Edit 成员族退役）

仓库生成编程面已退役 `edit` 与 `rewrite` 成员，`ToolPermission.Edit` 不再投影 `JsCapability.Edit`；局部替换、插入、删除、全匹配替换与整文件重写统一由 `cat` + `where`/`whereAll` + `slice` + `write(path, content)` 组合完成，每次 `write` 对已有文件产生一笔 `Rewrite` 落盘记录，内容未变时可由程序跳过写入。

仅授 `Write` 能力（无 `Read`）的生成面只暴露 `write`/`mkdir`，不泄露 `cat` 或旧 `file`；`write` 内部读取当前文件以构造 `Rewrite` 并参与写前 `FILE_CHANGED` 快照校验，但不产生显式读观察。（注：Plan 任期专用面 `todowrite-for-plan` 仍独立保留无路径 `file`/`edit`/`rewrite` 算法与契约。）

## [024] 定位歧义挂起、近邻诊断与路径边界拒绝（原 Edit 恢复协议演进）

生成编程面的定位未命中与多义匹配不再走 `edit` 内部抛错，而是由 `where(content, needle, from = 0)` 经统一 `park` 通道挂起（零修改落盘）：

- 未命中时 parked 载荷携带 `needle`、空 `candidates` 与最近邻单行诊断 `nearest: { span, text, distance }`；近似只作诊断，绝不自动获得写权限。
- 多义匹配时 parked 载荷携带至多 8 项 `candidates: [{ span, context }]`，每项 `context` 窗口独立于文件大小有界截取。
- 越界路径在触碰磁盘前以稳定码 `PATH_DENIED` 拒绝且零暂存、不污染显式读记录；冻结失败目录仍保留 `INVALID_EDIT`、`EDIT_NOT_FOUND`、`EDIT_AMBIGUOUS`、`EDIT_OVERLAP` 供 Plan 任期面与目录契约使用。

## [025] 事务致命失败先结算再熔断

事务不变量失败先完成 durable semantic cut-tail 结算（保留已落盘的 as-is 文件效果与第三方变化），取得 committed/unknown 结算证据后才构造 typed incident，并调用由 composition 注入的 mandatory fatal capability。不得直接取得物理适配器或用 optional/default/global 兜底。

同一 incident 只报告、终止一次；旧快照、第三方变化及普通编辑拒绝仍为 typed nonfatal，致命处理不得覆盖工作树。

## [026] 事务快照与案例实质访问分离

ReadSnapshots 只用于事务隔离与冲突检测，不直接作为案例关联文件。案例只记录显式读取（`cat`）的规范路径及已提交的修改、创建、删除、移动路径；内部扫描（`ls`/`stat`）不算实质访问。提交前 effectPaths 是意图，未提交、校验失败或回滚均不追加修改访问。

## [027] Engineer 与 DevOps 的统一文件面

直接文件系统宿主工具（`read`/`write`/`edit`/`glob`/`grep`/`patch`）及独立插件 `mv`/`rm` `ToolSpec` 已整体退役；`Read`/`Write`/`Edit`/`Glob`/`Grep`/`Move`/`Remove` 权限不再投影独立宿主工具名，而是统一通过生成的 `todowrite-for-engineer` 与 `todowrite-for-devops` 投影 `cat`/`where`/`whereAll`/`write`/`mkdir`/`ls`/`stat`/`mv`/`rm` 成员，共享路径边界、UTF-8 校验、符号链接防护和 As-Is 逐笔落盘写语义（每笔写即原子落盘、跨笔不回滚、失败保留已落盘改动）。

Manager 的 `todowrite-for-manager` 程序入口始终按角色准入；仓库访问仅经 `this.reviewOnly.cat/stat/ls/rg`，由 Host 逐次检查当前 Review 窗口，无顶层别名。`where/whereAll` 为纯文本操作，保持顶层；委托及生命周期成员各守权限。生成描述、示例、成员目录与真实 API 同步命名空间，规则遵循 capability-enforcement-025；不因此取得修改或执行权。

## [028] programPromise 暴露与 deadline 可重置

沙箱启动与结果等待解耦：`runSurface` 返回一个持有 `ProgramPromise`（async IIFE 的未 settle promise）与可变 `DeadlineRef` 的句柄，调用方可跨调用持有该 promise 而不在启动处 await 到底；vm context 由 promise 未 settle 时的闭包链自然持有，不显式提升。异步 deadline 从生成代码内联常量改为 api 闭包捕获的可变引用，`resetDeadline` 可在不重包、不重跑程序的前提下改变后续 api 调用的超时窗口。哨兵识别、错误分类与结果反序列化保持不变。

调用返回、抛错或挂起时，释放宿主为本次调用创建的自动 yield 定时器；挂起程序的 promise 和现场仍保留，恢复调用按自身预算创建新的定时器。旧调用的定时器不得在恢复后触发新的 park。

## [029] As-Is 逐笔落盘的失败与成功形态

每次 `write`（含覆盖既有文件与创建新文件）调用即原子落盘，跨笔不回滚。程序后续失败、终止或挂起（throw、超时、输出超限、返回值非法）时，已落盘的改动保持为事实分界线并如实上报：

- 成功返回 `# ok`，`[fs]` 声明 rewritten/created。
- 失败返回 `# failed`，根级给 code/reason，并附本次调用已真实落盘的改动清单（`[fs]` 的 rewritten/created）；无已落盘改动时失败不附 fs 节。
- 写前冲突校验（目标当前内容与写者所见不一致）以 `FILE_CHANGED` 失败，该笔不落盘，此前已落盘的改动保留。

「如实上报」的清单只由携带 staging 的程序终局（Done/Failed/Abandoned 的结果渲染）从 staging 派出。parked 载荷本身、unpark 恢复调用与 abandon 调用都不携带 fs 已发生清单：编排层调用只返回继续或放弃的结果，挂起期间已落盘的改动由程序最终结局一次性上报。

## [030] park 与 Parked 结果

程序调用 `await this.park(payload)` 后执行结果变为 Parked：顶级 parked 载荷携带非空 handle 与程序传入的 payload；渲染文档以 `# parked` 开头并包含 handle。未调用 park 的程序正常完成（Succeeded，无 handle）。park 是 async 成员，在 await 点挂起程序并让本次调用返回该 parked 载荷；首个 park 赢得竞争，第二次 park 要等第一次恢复后才到达。

## [031] 泄漏兜底三件套的调用接线

交付硬门禁接在 deliverSpec 执行链（plan/manager 分派之前）：存在未处理 parked handle 时拒绝交付，拒绝内容列出全部 handle，资源路径 `tool/js-program/parked-deliver-blocked`。每回合提醒经由 PairHint 的 composeMarkerDocument 并入：查询全部未表态 handle，非空时渲染 `tool/js-program/parked-hint` 提醒并追加为 marker 文档指令；无载体回合不走到 composeMarkerDocument，不凭空注入。会话终结在 ClearSession 清理链中强制 reap 该 session 名下全部 parked 现场，durable 记 Reaped。reap 是 fire-and-forget 兜底：abandon 后即从现场表移除现场，不等待 finalizer 展开窗口；已发生写盘的正确性由 as-is 即时落盘保证，不依赖窗口完成。两个资源均为 zh-CN.md/en.md 成对双语文件、占位符集合一致且含 `{{handles}}`。三个调用点只调用 JsParkedSites，不定义现场表类型或 reap 接口本身。

## [032] unpark 恢复

以 `{ unpark: { handle, value } }` 调用恢复挂起程序：恢复后的程序继续运行到完成，返回继续结果（Succeeded，无 handle）；挂起点的 await 表达式求值为注入值。未知 handle 报 `HANDLE_UNKNOWN`。恢复后的程序再次 park 时返回新的 parked 载荷与新 handle。调用面一次只携带 program/unpark/abandon 之一，同时给出两个及以上按 `INVALID_ARGUMENT` 拒绝（见 [064]）。

## [033] handle 恰好消费一次

一个 handle 只被消费一次：第一次 unpark 恢复程序，第二次对同一 handle 的 unpark 报 `HANDLE_UNKNOWN`。abandon 同样消费 handle：abandon 之后对同一 handle 的 unpark 报 `HANDLE_UNKNOWN`。对未知 handle 的 abandon 也报 `HANDLE_UNKNOWN`。被状态冲突拒绝的调用不消费 handle：现场原样留在现场表里（见 [064]）。

## [034] abandon 与程序侧 finalizer

abandon 以拒绝 parked await 的方式终结程序：原生 try/finally 作为 finalizer 照常运行，finalizer 内的 rm/write 按 as-is 落盘。abandon 清理窗口内 api 仍可照常使用。程序捕获放弃并继续执行时，其返回值被丢弃，结果仍为 Abandoned（Failed，无值）。

## [035] abandon 清理窗口内禁止再 park

清理窗口内的 park 被拒绝，程序侧得到 `{ ok: false, code: 'CANNOT_PARK_WHILE_ABANDONING' }` 结果；程序可通过 as-is 写盘记录该拒绝。

## [036] parked-site 表并发上限

parked-site 表有进程级并发上限（默认 8）：上限内 park 成功；超出后下一个 park 以 Failed 与 `CONCURRENCY_LIMIT` 拒绝，无排队。一个现场被 abandon 释放后，新 park 可入。

## [037] Parked 载荷渲染

parked 结果渲染为顶级 parked 载荷文档：handle 字段、source 字段与程序 payload 的字段平铺进文档顶层，可按 Synthetic TOML 解析。载荷就是程序传入的数据，原样呈现，不是宿主裁决。

`source` 是完整程序源码：挂起行以 `>| ` 前缀标记，其余行以 ` | ` 前缀标记，行号由 vm 栈换算到模型源码坐标。栈无法解析时降级为全部 ` | `，仍携带完整源码，不使 park 失败。source 只进入 parked 载荷，不进入每回合提醒。

## [038] park 的编程面投影

park 是生命周期能力：任何 js-* 生成面无条件携带。生成基类含 `async park(payload)`；只读面（如 Manager）同样携带。描述与示例教授 park/unpark/abandon 三态契约。park 不是文件系统权限投影，不进入 members 列表，保持文件系统原语成员序列为 `write, rm, mv, cat, ls, stat, mkdir, whereAll, where`。

## [039] 现场表归属与进程内存活

park 现场表是独立的进程级静态表模块 JsParkedSites（ParkedSites.fs，并发上限 8），唯一归属、不散落：工具编排层 ToolWorkflow 与 session 回收层 PluginSessionScope 共享引用；调用方（ToolRegistry、PairProgrammingThoughtTransform、PluginSessionScope）不重定义表模块。parked 现场携带 session owner，会话终结可据此 reap。parked 程序进程内存活：同进程内后续调用仍见其挂起，handle 可解析；每次 park 得到不同 handle。

挂起现场与工具绑定共享 `TransactionStore` 声明的 `JsAsIsLedger`，恢复时继续使用原程序的账本；现场表不依赖后编译的 `ToolsBindings` 实现，也不以 `obj` 转换绕过账本类型。事务协议先于现场表编译，owner project 与 canonical compile-order 保持一致。

## [040] rm/mv：Move/Remove 编程面与 as-is 落盘

`rm(path)` 与 `mv(from, to)` 由 Remove/Move capability 投影（`JsCapability.ofToolPermission` 是唯一映射），与 `write` 同属 as-is 逐笔落盘路径。四层同构：生成基类含 `rm`/`mv` 方法、工具描述与 canonical example 含对应成员、运行时门禁按 capability 挂载 rm/mv 执行器。Manager 的 `todowrite-for-manager` 仍只读，不含 Move/Remove。

- `rm` 删除文件或空目录；非空目录报 `DIRECTORY_NOT_EMPTY`，缺失目标报 `FILE_NOT_FOUND`。成功返回 `{ ok: true, removed: path }`。
- `mv` 按 POSIX 语义移动或重命名文件及目录，支持覆盖；源缺失报 `FILE_NOT_FOUND`。成功返回 `{ ok: true, moved: from, destination: to }`。
- 越界拒绝：rm 的目标、mv 的源与目标都在能力边界内校验，越界报 `PATH_DENIED` 且源存活。继承 [014] 的写前冲突校验：`cat()` 取得的快照仍新鲜时，目标可照常被 rm 删除落盘。
- 每次 rm/mv 各记一笔 durable 条目，Prepared/Committed 成对排空 pending 投影；渲染结果报 `removed = [...]` 与 `moved = ["from -> to"]`。
- 稳定失败码 `DIRECTORY_NOT_EMPTY`、`CROSS_DEVICE_MOVE`、`INVALID_ARGUMENT` 登记在冻结失败目录；EXDEV 依靠 renameSync 原子语义保证源与目标都不残留中间态。

## [041] Lifecycle 审计的生产接线与会话收束

Parked/Unparked/Abandoned 的 lifecycle 审计沿生产组装路径接线：PluginHostInterop 从 workspace 的统一 WorkspaceEventStore 同源构造 `IJsLifecyclePersistence`（与 jsTransactionPersistence 共用同一 store），经 ToolRegistry.create 贯通到每个生成的 JsToolSpec；JsToolSpec.execute 调用点传入该 persistence，不留硬编码 None。JsToolWorkflow 在执行链上记录 Parked、Unparked、Abandoned 三类事件。宿主侧 ToolHostSurface 与 WorkflowSurface 同样从各自的 store 构造 lifecycle persistence 并传入调用。

四种 lifecycle 事件类型（Parked、Unparked、Abandoned、Reaped）同住 TransactionStore 的单一审计流（createLifecyclePersistence 与 appendLifecycleEvent）。会话关闭链沿 PluginBoot → PluginRuntimeScope → PluginSessionScope 贯通 jsLifecyclePersistence；ClearSession 先以 JsParkedSites.handlesForSession 枚举现场，reapSession 之后逐 handle 记录 Reaped 审计事件（durable.AppendLifecycleEvent）。ParkedSites 现场表保持进程内存活、不触碰 durable：Reaped 审计归调用方，现场表自身不含 appendLifecycleEvent。

## [042] rm/mv 落盘后程序失败的清单形态

rm/mv 与 edit/write 同属 as-is 逐笔落盘路径：程序在 rm/mv 已落盘之后以任何方式失败（throw、超时、返回值非法）时，结果为 Failed，已发生的删除/移动保留在盘上并如实上报——`[fs]` 的 removed/moved 清单列出本调用已真实落盘的全部条目；无已落盘改动时失败不附 fs 节。被拒绝的 rm/mv（非空目录、越界、源缺失等）不进入清单：该笔未落盘，此前已落盘的其他条目照常列出。

## [043] rm/mv 双语资源与四层接线契约

rm/mv 的成员文案是 zh-CN.md/en.md 成对双语资源（`tool/js-program/rm`、`tool/js-program/mv`），两语言陈述同一契约要素——签名、POSIX 语义、as-is 即时生效、EXDEV 拒绝且不留两侧并存中间态——且不携带未替换占位符。四层接线保持同构：JsFragmentRegistry 的 rm/mv fragment（含 `js.rm`/`js.mv` RuntimeBindingKey）、ToolsBindings 的成员绑定、Description 的资源路径与 capability 条件规则块、ToolHost 的双语装载。底层文件系统效果与稳定失败映射归 MutationFs 原语（removePath/movePath），不在成员绑定内二次定义。

## [044] rm/mv 失败码的 reason 稳定与成对上报

rm/mv 相关稳定失败码（`DIRECTORY_NOT_EMPTY`、`CROSS_DEVICE_MOVE`、`INVALID_ARGUMENT`、`FILE_NOT_FOUND`、`FILE_CHANGED`、`FILE_READ_FAILED`）在冻结失败目录中携带可读且稳定的 reason 文案。运行期失败结果的 code 与 reason 成对出现，reason 携带涉事路径（如 `directory is not empty: <path>`、`path outside capability boundary: <path>`、`target file does not exist: <path>`）；PATH_DENIED 时源存活（[040]）。

## [045] 文件原语：cat/ls/stat/write/mkdir

`cat(path)` 读严格 UTF-8 文件并登记读快照；缺失报 `FILE_NOT_FOUND`，非法编码报 `INVALID_UTF8`。`ls(path)` 只列一层，排序返回，目录条目以 `/` 结尾，并应用 `.gitignore` 语义（[057]）；递归需求按 [047] 的组合写法展开。`stat(path)` 返回 `{ exists, size, mtime, isDir }`，缺失是正常观察而非失败。`mkdir(path)` 非递归，已存在报 `DIRECTORY_EXISTS`，父目录缺失报 `PARENT_DIRECTORY_MISSING`；它不产生 durable mutation 条目。

`write(path, content)` 覆盖或创建，一次原子写、即写即生效（[010]）。五个原语都继承路径边界、符号链接防护、写前 `FILE_CHANGED` 与 as-is 逐笔落盘；底层文件系统效果与稳定失败映射归 MutationFs 原语。

## [046] where/whereAll：字面匹配与歧义即 park

`whereAll(content, needle, from = 0)` 做字面匹配：`IndexOf` 作用在原样的 needle 上。返回全部非重叠匹配的原文 UTF-16 下标 `[[begin, end], ...]`，零个返回 `[]`，`from` 是原文起始下标。空白按原文参与匹配。

`where(content, needle, from = 0)` 的唯一匹配直接返回 `[begin, end]`。零个或多个匹配时，程序经与 `js.park` 相同的信号通道挂起，载荷为 `{ needle, candidates, nearest }`：`candidates` 至多 8 项，每项 `{ span, context }`；零匹配时 `nearest` 为最接近的一行 `{ span, text, distance }` 或 null。unpark 注入的值原样成为 `where` 的返回值；注入非 span 时由后续程序自然失败，宿主不预校验。`where` 永不抛定位错误，也永不静默选择匹配。

## [047] 原语组合与教学资源

原语只提供动词，不提供编辑 DSL：find/replace = `cat → where → 拼接 → write`；批量替换 = 一次 `whereAll` 加反向拼接；append = `cat + write`；锚点切片 = 两次 `where`（第二次带 `from`）；**枚举与内容搜索 = `rg(argv)`**（等价于 `rg --json` 加上这一个 argv，返回 JSON 对象；写法见双语资源 `tool/js-program/recipes`）。`cat`/`ls`/`rg`/`stat`/`write`/`mkdir`/`where`/`whereAll` 与 rm/mv 共享同一路径边界与 as-is 纪律。

教学资源 `tool/js-program/header` 与 `tool/js-program/park` 双语成对，声明主原语、组合模式、where 歧义契约与 unpark 自由值契约；`tool/js-program/contract` 不再声称 all-or-nothing 提交，失败经验与 as-is 语义一致。

## [048] parked source 与 unpark 自由值

parked 载荷的 `source` 字段携带完整程序与执行点标记（[037]）。直接 `park` 与 `where` 歧义都经同一挂起路径产生 source；恢复后再次 park 产生新的 handle 与新的 source。source 行标记按 vm 栈换算，解析失败时降级而不是失败。

标记位置由沙箱栈换算到程序脚本行：沙箱以 `new Function` 求值程序，V8 把程序帧渲染为 `at Js.run (eval at <runner> (evalmachine.<anonymous>:226:19), <anonymous>:150:33)`，尾随的 `<anonymous>` 位置才是程序内的行，前缀里的 `evalmachine.<anonymous>` 位置是 runner 自身源码的行、不是程序的行。

只有程序帧参与换算：经 `eval` 求值字符串的帧其尾随位置是该字符串自身的行号，与程序行号可能数值相同，按数值范围判定会误标到无关的程序行上；这类帧不参与，标记落在程序自身的调用点上。栈缺失、栈不可读、栈中无程序帧时降级为整篇 ` | `，不误标、不让 park 失败。

## [049] unpark.value 自由值

`unpark.value` 的 host schema 是任意 JSON 值（可选），执行端零校验；注入值的语义由 park 点定义，错误注入由下游自然失败。工具描述与 `tool/js-program/park` 资源明确这一责任边界。

## [050] js.call：一条命令

Exec capability 投影 `this.call(command, planB)`。`command` 是一条 shell 字符串。`planB` 必填，是不跑这条命令时的替代方案，UTF-8 字节数 × 50ms 是这次 call 的自动 yield 时限。缺 planB、空字符串、函数或类参数以 `CALL_COMMAND_UNSUPPORTED` 失败。工具参数不带 planB。

成功结局是 `{ ok, status, exitCode, stdout, stderr, truncated, bytes, durationMs }`。`stdout` 与 `stderr` 是上一次自动 park 的 `delta` 之后的新输出。等待就是 `await this.call(command)`。宿主未注入时以 `CALL_HOST_UNAVAILABLE` 失败。

工具 schema 带 `name`，描述写明每次调用都填。这次调用造成的任何 park 都以这个 name 登记。缺 name、空名字或同名已挂起以 `INVALID_ARGUMENT` 拒绝，程序不执行。

## [051] signal / send 作用在让本次 park 的那条 call 上

`this.signal(signal)` 与 `this.send(input)` 各自只收一个参数。谁让这次程序 park，它们就作用在谁身上。那条命令已经结束时是 `CALL_CHILD_UNKNOWN`。`send` 缺行尾换行时补一个。自动 park 的 `delta` 带 `stdout` 与 `stderr`。

## [052] js.call 教学与验证形态

双语资源 `tool/js-program/base-class-exec` 陈述 `this.call(command)`、`this.signal(signal)`、`this.send(input)`。等待是 `call` 返回的 promise。

## [053] 顶层压缩参数与 carry 数组

顶层上下文整理声明由 `prefixUntil` 与 `carry` 承载；两者在每次工具调用上均为必填，省略任一项以 `VIEW_DECLARATION_INVALID` 拒绝，不存在“不压缩”的默认。`prefixUntil` 是锚点截止值（保留编号严格小于它的历史区间），`carry` 是按顺序追加的整数或字符串数组。整数引用完整可见历史区间，字符串表示字面文本。完整规则与快照边界由 context-compression [031] 唯一规定，不保留对象映射、包装对象或兼容别名。

压缩结果为原样前缀、数组材料、当前回合。当前回合自动保留，不能被历史锚点选择；呈现时剥离压缩工具调用的顶层 `carry` 参数，防止长字面文本重复。提示词以此说明当前最佳实践：新的结论可以先写在正文，数组无需再保留语义相同的旧材料。声明在程序执行前完成校验，只在工具调用成功结算后提交，供下一请求消费一次；失败不执行非法声明，也不覆盖先前的成功声明。非法形状或引用以 `VIEW_DECLARATION_INVALID` 拒绝。

成员层使用可选 `extra` 数组（默认 `[]`），不带前缀参数；顶层布局 `carry` 仍必填且与成员 `extra` 不是同一槽。父子传递不附加当前回合；子父交付附加当前回合。委派、advisor 与交付共用 context-compression [032] 的材料选择规则。非法数组返回 `{ ok: false, code: "VIEW_DECLARATION_INVALID", reason }`，不抵达委派或交付执行端，不留下部分效果。双语压缩教学资源为 `tool/js-program/view-declaration-extra`，传递与交付各自只讲本方向的用法。

## [054] deliver 的 carry 交付

`deliver(extra = [])` 是生命周期成员，任何生成面无条件携带（与 park 同级）。惯用法是先在助手正文写最终报告，立即调用 `this.deliver()`。当前回合的正文报告自动回传；`extra` 只用于附加旧历史锚点或字面文本，不需要为当前报告指定锚点。有效交付展开调用栈，后续语句不执行；数组材料在前，当前报告在后，最终 pretty print 成 TOML。交付回执不重复回显调用参数。

本次工作之前已经返回过的材料按 [059] 的身份记录去重。程序捕获内部交付哨兵后可以继续存活，此后的 return 值才是结果，捕获即取消这次交付。subagent 程序必须以 `js.deliver` 显式交付：普通 `return` 保持交付格为空，不写完成；只要该子工作仍可能交付，它就是一条活跃义务，join 保持不关闭；交付已不可能时（被 abort、取消或重启加载结算）该子工作以 `voided` 结清，这不是完成，join 以 `voided` 报告一次。`js.dag` 中非完成记录按 `node-<status>` 挂起（`node-failed`、`node-abandoned`、`node-voided`）。描述与双语资源 `tool/js-program/deliver` 陈述同一契约。

交付成立后宿主按设计中断本次 attempt（见 work [011]），使模型看不到 deliver 回复；这次中断只结束 attempt，不改变已提交的交付。宿主必须先以该交付见证结算本次子运行（写入与普通终态相同的 completion），再发出中断；父方的 `join` 因此仍能收到该次交付的 view。见证无法建立（例如没有物理输入或没有逻辑运行）时投递不成立：工具以 `DELIVERY_NOT_ESTABLISHED` 失败，不得只写进程内交付格并声称成功。正文报告是惯用法，不是内容门禁；没有正文或附加材料的形式合规交付同样可以成立。

## [055] vm 并行边界

同一程序内 `Promise.all` / `Promise.allSettled` 直接表达 IO 并行，不需要新原语：vm 单线程事件循环天然把每次 api 调用串行化，宿主不加锁、不排队、不互斥。独立分支的效果各自 as-is 落盘；一个分支失败不清除兄弟分支已落地的改动。同一文件的写竞态由程序作者自负（Unix 哲学），宿主只保单笔写原子与写前校验。

## [056] 委托原语：fork / resume / commission / devops / dag / join / fission / horizon / advisor

**所有 js.* 成员的返回值都是数据，绝不返回渲染后的 prose**（宿主在工具结果与 parked 载荷边界统一把值渲染给模型）。委托成员统一用信封：

```
{ ok: true, ... } / { ok: false, code: "<stable kebab code>" }
```

- `fork(payload, extra = [])`：`payload` 是字符串（任务）或 `{ charge, name?, calling?, keywords? }`；缺 `name` 时由 charge 派生（派生名冲突报 `name-already-belongs`）。成功返回 `{ ok, name, agentId, outcome }`，`outcome ∈ created | nudged | commissioned`。拒绝码：`name-required`/`charge-required`/`unknown-calling`/`calling-conflict`/`name-already-belongs`/`warm-start-unavailable`/`context-unavailable`/`not-a-delegation-role`/`placement-failed`/`dispatch-uncertain`。
- `resume(payload, extra = [])`：续做既有道路，`payload` 必带 `name` 并携带本次 `charge`；复用该 participant 的完整历史与 binding，不重选绑定；目标正忙时 charge 作为忙碌提示追加到既有工作，不新建任务（`outcome` 为 `nudged`）。传 `calling` 一律拒绝。拒绝码：`name-required`/`charge-required`/`calling-not-allowed`/`warm-start-unavailable`/`context-unavailable`/`assessment-pending-for-devops`/`dispatch-closed`/`placement-failed`/`dispatch-uncertain`。
- `commission(payload, extra = [])`：委任既有角色的道路，`payload` 与 fork 同形（`{ charge, name?, calling? }`）；`calling` 省略时按角色推导，显式给出与推导不一致即拒绝。成功返回 `{ ok, name, agentId, outcome }`。拒绝码：`name-required`/`charge-required`/`unknown-calling`/`name-already-belongs`/`context-unavailable`/`placement-failed`/`dispatch-uncertain`。
- `devops(intent, extra = [])`：请求本调用 session 绑定的固定 DevOps 席位做一次工作；`intent` 是本次交给 DevOps 的意图文本（不像 fork/resume 那样承载 charge）。返回 `{ ok, kind, status, returned: [{ text }] }`；材料条目最终随结果统一渲染为 TOML。DevOps 绑定未就绪或已关闭时以 `assessment-pending-for-devops` 拒绝。
- `join()`：按本会话成员归属收拢，返回 `{ ok, records: [{ name, agentId, role, status, returned: [{ text }] }] }`，不重复输出 `byName` 索引；成员成为 `completed` 需要两件事同时成立：该成员有因果上证明的终态（proven terminal），并且有经 `this.deliver(extra)` 有效交付且未被 abort 的材料；缺任何一件都不写完成。记录里的 `returned` 按顺序承载数组材料与当前报告，保持结构化直到最终 TOML 呈现；`status ∈ completed | failed | abandoned | voided`。未交付且仍可能交付的成员不写完成、不进入终态记录，join 不关闭，成员保持活跃；父方可以继续等待或重派。交付已不可能（abort、cancel 或重启加载结算）的成员以 `voided` 进入 join 记录，`returned` 为空数组：作废不是完成，它结清该成员的未解除义务，join 关闭，报告一次后该成员即退役。拒绝码：`context-unavailable`/`not-ready`/`nothing-to-join`/`join-in-progress`/`interrupted`/`abandoned`。
- `fission({ charge, lanes })`：同身份多 lane 的任务分片执行（宿主负责 lane 绑定与收拢），返回 `{ ok, groupId, lanes: [{ index, sessionId }] }`；owner 的 `join()` 收拢本组 lane。拒绝码：`fission-unavailable`/`lane-start-failed`/`not-ready`/`context-unavailable`/`invalid-prompt`。
- `dag(spec, extra = [])`：`spec` 是 `{ nodes: [{ id, charge, deps?, lanes? }] }`；纯声明糖，由基类编译成波次 `fork` + 一次 `join`；只在 Fork 与 Join 同时投影时才生成（缺 Join 就没有可编译进去的 join，成员列表里也不出现没有方法体的 `dag`）；同一份 `carry` 发给所有节点，节点不得覆盖或另设自己的数组；下游节点的 prompt 带上依赖记录。成功返回 `{ ok, results: { [id]: record }, skipped: [id...] }`。**节点失败 → `park`**（与 `where` 同一条恢复通道），payload 为 `{ dag, node, code, deps, done, pending }`；注入值语义：`"retry"` 重跑、`"skip"` 跳过（下游看到 null）、其他值直接作为该节点结果、`{ abort: reason }` 使程序失败。
- `horizon()`：返回在场名册的数据信封 `{ ok, agents: [{ label, status, target, workState, record, turnsUsed, turnsLeft, timeUsedMs, timeLeftMs }], ptys: [{ terminal }] }`；`status ∈ returned | still-away | did-not-return | voided`（`voided` 表示该成员已无法交付、已以作废结清而非完成，在 join 报告一次之前它仍显示为 `voided`），`workState ∈ latest | none | unavailable`，`record` 是最新帧正文原文（无则为 `""`）；四个校准数 `turnsUsed`/`turnsLeft`/`timeUsedMs`/`timeLeftMs` 只在委任者 estimate 与子会话起点两者都可读时给出，否则全为 `0`，不猜测。拒绝码：`horizon-unavailable`。
- `advisor(intent, extra = [])`：请求本调用 session 自己的顾问专席；`carry` 按 [053] 选择背景材料，不带当前回合。返回 `{ ok, advice }` 或 `{ ok: false, code: "advisor-unavailable", reason }`。顾问的 law、材料与 `intent` 各自是独立 prompt；材料保持结构化数据直到 pretty print 成 TOML。follow-up 只追加相对已交付身份的新材料，再追加本次 intent。拒绝码：`advisor-unavailable`。

派遣成员 `fork`、`resume`、`commission`、`devops`、`dag`、`advisor` 的最后一个参数均为可选 `extra`，默认 `[]`。没有前缀概念，也不携带父方当前回合；任务只由 `charge` 或 `intent` 表达一次。数组非法时以 `{ ok: false, code: "VIEW_DECLARATION_INVALID", reason }` 拒绝，不抵达委派宿主、不留下部分效果，程序继续运行。`fission`、`join`、`horizon` 是同身份换道或拉取动作，不带 `carry`。

实现边界：delegation shard 提供结构化入口（`ForkTool.executeReceipt`/`JoinTool.executeReceipt`/`FissionTool.executeReceipt`，返回数据与上述稳定码；宿主 `join`/`horizon`/`fission` 工具的 prose 输出保持不变，`fork`/`resume`/`commission`/`devops` 已无宿主工具注册，一律经编程面成员调用）；接线层在每次编程调用期间安装进程内委托宿主驱动这些入口，调用结束清除；未安装宿主时成员以 `{ ok:false, code:"DELEGATION_UNAVAILABLE" }` 拒绝，不静默降级。

委托面按能力投影：Manager 持有 Fork/Resume/Join/Horizon/Advisor 权限，因而获得 `fork`/`dag`/`resume`/`join`/`horizon`/`advisor` 成员；Plan 的 DevOpsConsultation 权限投影出 `devops` 成员；Orchestrator 没有文件权限，其 Fork 权限投影为 `commission`（同一委派执行入口），因而是纯委派编程面。`hasFsCapability`/`jsToolSpec.admissionFor` 同步把 Fork/Resume/DevOps/Join/Fission 计入编程面授权，四层一致。

## [057] ls 的 ignore 语义与搜索面

`ls(path)` 在列出一层目录时应用 gitignore 语义：逐级 `.gitignore`（含否定模式与目录剪枝）加上根 `.git/info/exclude`。递归枚举与内容搜索由 `rg(argv)` 承担（[009]）。

旧 `glob` js 成员已退役。旧 `grep(needle, pattern)` 成员已退役，其能力现在只投影 `rg(argv)`。旧 `file`/`edit`/`rewrite` 成员仍从仓库生成编程面退役（包括 Plan；Plan 的文件参数受 `PLAN_PATH` 闸门限制）。

## [058] 交互成员与唯一执行面

Host 原生 `run` 与 pty 工具已退役。交互是 `this.send(input)` 与 `this.signal(signal)`。自动 park 载荷带 `delta: { stdout, stderr }`，相对上一次增量。`call` 收一条命令字符串。

## [059] this.deliver 的材料记录与增量去重

程序经 `this.deliver(extra)` 结束时，宿主记录数组选择的材料与自动保留的当前正文报告；普通 return 不填交付格。材料使用 [053] 的统一选择规则，最终 pretty print 成 TOML。同次数组的顺序与显式重复保留；跨次交付只对旧材料按完整内容身份去重。当前报告按 exact `providerRun` 与 `toolCallId` 区分，不因正文相同或前缀相同而丢掉新报告。交付格可 take 或 peek，peek 不推进返回记录。交付回执不重复回显调用参数。

`deliver` 只接受一份可省略的 `carry` 数组；省略等同 `[]`，只返回当前回合。非法数组、多个参数或包装对象以 `VIEW_DECLARATION_INVALID` 拒绝。交付格与返回记录为进程内状态，重启即丢；带精确调用围栏的交付事实在工具结算时另记。

## [060] "js" 机器词汇的终局

模型视野之外的名字一律保留 `js` 前缀，不做改名：durable 流名（`js-tools/transactions`、`js-tools/lifecycle-audit`）、资源目录（`js-program`、`js-plan`、`js-bookkeeper`）、`RuntimeBindingKey`（`js.cat`、`js.where`、`js.park` …）与包装器内部哨兵（`__jsParked`/`__jsDelivered`/`__jsAbandoned`/`__jsFailure`）。理由：这些名字是 durable 身份与机器对机器契约（流名改名等于数据迁移，哨兵改名等于重放保真风险），而模型看到的是 `todowrite-for-ROLE` 工具名与成员名——模型面与机器面本就应当分离。此裁决与第 28 轮改名（门面级命名即教学）不冲突：改的是模型面，不动机器面。

## [064] 调用面三态互斥：program / unpark / abandon

一次编程调用只携带一个状态：`{ program }`、`{ unpark: { handle, value } }`、`{ abandon: { handle } }` 三者互斥。三个参数在调用面上都是可选的，模型只发其中之一（[049]）。

同时给出两个及以上（例如 `{ program, abandon }`）按 `INVALID_ARGUMENT` 拒绝，reason 点名冲突的字段名。拒绝是零效果：程序不执行、不恢复、不放弃，不产生任何文件效果，也不留待下一请求消费的视图声明；被点名的 handle 不被消费——现场原样留在现场表里，等模型用单状态调用处置（[030]、[032]、[033]、[039]）。

一个状态都不给是缺状态，不是状态冲突：报缺少 program 的错误（`missing 'program' argument`），不执行任何程序。

## [065] 宿主对同一助理消息内多个工具调用的确定性串行派发

同一助理消息（同一个 provider run）包含多个工具调用时，宿主按确定顺序逐个执行，各为独立事务，后者读取前者提交后的状态。两个并发派发的工具调用不交错执行文件读写，不触发并发冲突；同文件修改顺序叠加，不丢更新。

此条款验证的是宿主层真实调度承诺，区别于 [017] 单纯的连续事务快照隔离。


