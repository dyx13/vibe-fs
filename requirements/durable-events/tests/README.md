# durable-events 测试

2026-10-13 R00/R01：原023的live/联合Current/revision/取消四例迁013，payload拒绝与原始poison例迁006，law同步。013新增真实Wire Accepted闭包、Recovery jobs/handles联合读取，以及屏障驱动的注册/双waiter/预取消/Journal自身关闭证明；生产修复预取消和关闭遗留等待，并用真实Fable取消类型结算无token调用方。正式8文件74 pass、0 fail、2个未开启的codec/fold integration skip；013强化instanceof后单独25 pass。隔离复制实际源码的5次真实Fable与同组行为得到基线绿、冻结snapshot/拆getter/闭包偷读live各指定红、恢复绿，详见[计划R01结算](../../../proposals/子系统拆分收尾计划-2026-10-13.md#r01-先补观察与资源释放的确定性保护)。不关闭全根编译、R09不可变输入或整个durable契约。

2026-10-07 C0历史验收：022新增纯append-result唯一工程归属及同一IEventStore编译探针正反例，当时八原F#源和compile-order不改。Model3fs、纯结果4、Port6、Journal7及native11/0只属于gen220前沿，详见[原有限记录](../../../proposals/archive/2026-10-07/Upstream增量与结果合同施工-2026-10-07.md)。接续U0-A0已增加typed追加结算及Journal合法纯结果依赖，Journal现9fs、Git contract5fs；新正式与flat结果见[U0记录](../../../proposals/archive/2026-10-07/U0追加结果与消费者施工-2026-10-07.md)，不借旧证书验新合同，仍不授fresh派发许可。

2026-10-05的014成本oracle改为同一原生ready heap的真实cursor比较次数，墙钟保诊断。仍512 writers×16=8192，先深核完整输出、数量、唯一性，再核3NH+2K=222208上界。正式normal6/0；实际生产heapPop排序变异保完整输出但3605957比较越界唯一红，随后手工恢复，gen154相关225/225、1125/0。变异整叶234.281ms亦低于历史500ms，墙钟不能独立证明复杂度；旧并行973.2ms失败原样保留。[日志、patch与边界](../../../proposals/archive/2026-10-05/Sphinx执行观察与估值守门-2026-10-05.md)明确不扩大监督预算、不降低worker、不把诊断wrapper当第二算法。

WHAT 是验收依据；本目录说明当前证据，不额外规定实现。

022当前集合为20个locality：8个EventStore contract、2个focused runtime、4个扩展contract、6个扩展focused runtime；新增JS capability owner31fs。下面原“三个扩展contract”描述属于扩展前的历史集合，现行清单见本包README。EventStore composition owner586fs另有独立编译正控，不冒充有界focused locality；gen230的022/023实际28/0、无skip/TODO。

2026-10-06的017-I0新增真实activated append I/O记录：8/128条历史经原EventStore生成，独立meter进程在实际activation后清零，独立cold进程核完整事件与head。正常append零旧事件内容读取、零Git filesystem/CLI与子进程，真实252 UTF-8字节写入和fsync；未知fd/内容结果拒绝作为零证据。实际ReloadLocal变异使两成本例正式失败，写入和cold正控仍成立；已逐字节还原。[合并与复验记录](../../../proposals/archive/2026-10-06/Upstream增量与施工续接-2026-10-06.md)及[原始记录](../../../proposals/archive/2026-10-06/sphinx-host-owner/append-io/)区分此有限I/O证据与未证的内存历史fold、payload和first admission成本，WHAT017整体不关闭。

001—018 主要驱动实际 canonical codec、EventStore、Journal、payload、Git Hook 和 Integrator：包括字节身份、损坏拒绝、提交门禁、提交前后 Current、并发分支、retention、合并顺序及物理操作计数。临时目录与受控故障用于隔离被测执行；正常 dispose/reopen 不是进程崩溃证明。

019 让 Structural、Strength、Casebook、JsTransaction 的实际事实改变 Current，并重开同一磁盘历史核对；Journal 也实际追加后重开。反例经 WorkspaceEventStore 的 programWithoutRegistration 观察口在各自临时目录逐一移除真实 hostProgram 注册：移除 Strength/Casebook/JsTransaction 时 live fact 仍按已知词汇落盘，但对应业务 Current 缺失（decision 为 null、case 为 null、pending 为空），保留注册的 Structural head 不受牵连；移除 Structural/Journal 时构造被 CanonicalIntegrator 的 base-rule 前置检查整体拒绝，测试如实断言该 fail-closed 形态而非伪称缺失 Current。同文件静态 gate 有合规/违规样例，只覆盖所识别的形式。

020 检查 Journal boot 不创建 writer，首次业务 append 才落盘；实际 workspace capability 在获取时容忍尚未消费的损坏历史，在消费时拒绝。已识别的历史 Journal fact 经过激活重放而非仅 boot。没有通过这些局部入口宣称整个插件加载流程已验证。已删除以 lazy、特定 decoder 名称或函数片段充当行为与性能证明的用例；这些可替换实现不是额外验收要求。

021 证明坏事实与 cut 一起落盘、同进程重开可重放重置，另保留历史错误作用域用例。产生坏事实的实际进程退出、下一代进程恢复仍为 TODO；低层 store 继续 append 不代表上层进程获准继续运行。

022 读取真实工程声明的传递闭包与源码数，并实际隔离编译 Journal 观察 owner；八个 EventStore contract locality、两个 focused EventStore runtime locality及三个扩展contract、六个扩展focused locality各自经 ProjectReference 闭包展成唯一零 ProjectReference flat project、由单次 Fable invocation 真实编译（正例，flat 工程零 ProjectReference 与 Compile 项数逐一断言）。反向依赖负例沿用 023 探针模式落到 locality 维度：临时 consumer 引用真实 Git runtime 实现（`ProcessGitRawStore.createDefaultRunner`）与 Host adapter（`WorkspaceEventStore.programWithoutRegistration`），先在各自 owner 闭包（eventstore-git-runtime / opencode-host-workspaceeventstore）编译成功作对照，再于 eventstore-port-contract / eventstore-model-contract 闭包内因符号不可见被编译器拒绝，诊断具名目标符号；真实源码以 bytes/mtime 快照证明未被触碰。此真实编译使用已有 compiler 预算单独监督，不放进普通 5 秒静默组。023 的 codec 用例实际覆盖公开协议，日志 port 用例实际覆盖查询与提交；部分源码扫描只证明当前词形。023已有同一物理store probe在store闭包编译成功、在codec闭包被编译器具名拒绝的正式用例；domain fold维度（GAP-149）已按同一探针模式落地：真实Delegation fold闭包（delegation-fold shard）flat编译正例（零ProjectReference、Compile项与闭包一致、单次Fable编译绿），aggregate outer union（`Fact.AgentFact`）、组合层journal append入口（`AgentJournalPortAdapter.fromAgentJournal`）与物理`ProcessEventLog`三个负例探针先在各自owner闭包（composition-durable-fact / durable-journal-port-adapter / persistence-eventstore-processeventlog）编译成功作对照，再于fold闭包内因符号不可见被编译器拒绝、诊断具名目标符号；真实源码bytes/mtime快照证明未被触碰。红绿由DevOps真实执行。

2026-10-03合并增量：日志port的原子发布fixture先经真实dispatcher接纳父子Root，随后仅暂停目标HandleLinked的追加；三个canonical handle视图同时变化，revision精确增加一次。023的真实Fable编译误入default unit，使七文件诊断在只剩该编译lane时触发5006ms因果静默，原始失败不抹去；该case现归integrationTest，完整integration自动发现并执行，原positive/negative、具名诊断与源码未改断言全部保留，不扩大预算。结果与边界见[同步记录](../../../proposals/archive/2026-10-03/Upstream同步-e1e7dd3f1-2026-10-03.md)。

024—025 不再用自建 fatal 模型或源码调用字样证明结算与退出。025原用例实测同一Prepared身份不同载荷导致StorageInvalid，未产生semantic cut。gen230另由repository-programming013六真实子进程证明JS Prepared/Committed的端口坏输入防御：实际bad fact+cut-tail、释放响应失败Unknown及独立cold先成立，原JS owner再唯一报告并SIGKILL；合法builder不自然产生该坏payload，不能扩大可达性。Casebook mandatory composition owner、Journal/Strength/Sphinx其余actual cut fatal、duplicate incident及024/025整体仍待证，见[本轮有限记录](../../../proposals/archive/2026-10-07/U0追加结果与消费者施工-2026-10-07.md)。

完成一个节点后先运行 `node scripts/build.mjs`，再通过 `requirements/verification-system/tests/run.mjs` 将本目录 NNN.test.mjs 交给 `TESTS_MJS_FILES`运行默认层；真实编译走 `requirements/verification-system/tests/integration/run.mjs`的既有compiler预算，不在unit组强开tier。TODO不计为通过；发布canonical-spine节点保持TODO。与跨进程、结算和架构相关的缺口见GAP-097/098。
