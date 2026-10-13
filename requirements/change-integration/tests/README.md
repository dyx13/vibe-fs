# change-integration 测试范围

验收义务由本包 WHAT 定义。本文件只解释现有用例及其证明范围，不新增规则。文件和用例按 WHAT 编号对应；[010] 已并入 [004]，[012] 已并入 [006]，[016] 的验证输入一致性由 verification-system [016] 负责。

## 证据层级

- `observeRelayProgram` 执行真实 Change Program，注入受控 Git、Relay、持久化和资源端口，记录实际调用。它能证明程序对这些端口结果的裁决与顺序，不能证明外部端口已完成持久化、真实 Agent 独立评估或整个 Orchestrator 已接线。
- Program 接缝只提供 Change 事实追加、按 Job 读取当前投影及同一工作树实例的释放能力。`003/007` 分别执行 claim 可发布、目标已落地但尚无 Published、目标已前移三条生产恢复路径；物理删除观察记录实际 path 与 identity。`fixtures/ProgramProbe.fs` 供 structured-workflow-013 从纯 Program 闭包编译后执行六个受控场景，不依赖全仓 dist；它不证明 RecoveryView 同 revision 或真实重启。
- `recordFact`、`fold` 和分类用例验证事实投影与恢复裁决；重复纯 fold、重建 projection 或注入已有 claim 都不等于发生过进程崩溃和恢复。旧标题中的 `THEOREM`、`PERSIST` 也不提升证明层级。
- Git adapter 用例调用实际适配器，以命令端口注入正常与失败结果。`002` 还通过实际 Host 的 ForkManagerJob 调用实际 Git adapter，验证 cleanliness 检查失败或命令拒绝时，新 Job 不追加 worktree 请求、不创建 worktree 或 Manager；clean 正向对照确实抵达 worktree 请求和创建边界。该夹具从空的 Orchestrator 历史开始，不能证明 Host 初始化时恢复、清理旧义务没有副作用。真实临时 Git 仓库用例另证 status 失败返回错误及 dirty target 不被推进。
- IntegrationGate 用例实际创建并释放锁；ManagerLoop 的 10,000 次 Continue 用例执行真实循环，只证明这些信号下的有限推进及资源计账，不声称完成 10,000 次发布。

## 条款对应

| 条款 | 当前有效观察 | 尚不能据此宣称 |
| --- | --- | --- |
| [001] | 真实 Program 从候选到发布的调用顺序、失效与继续循环 | Relay 的 durable invalidation 已落盘、真实模型独立 assessment 的全链闭合 |
| [002] | dirty/clean/error 分别返回；实际 Host 在 cleanliness 错误后拒绝新 Job，保持其持久请求、worktree、Manager 和目标 HEAD 不变；ff 发布遇到 dirty 或 status 失败时拒绝 | 用户请求入口的所有 Clean Gate 条件均已接入；Host 初始化中既有义务的恢复、清理过程也没有副作用 |
| [003] | 各事实独立投影；完整 claim 的恢复裁决；缺失字段拒绝；Published 追加失败不会伪装成功 | 任意真实崩溃点都有足够持久材料可恢复 |
| [004] | rebase/冲突处置不持锁；ff 受锁保护；发布完成后释放门禁再清理一次；实际锁与循环 | 门内只存在 ref 重读和 CAS；durable claim/Published 写入等仍在门内，见 GAP-215 |
| [005] | 冲突事实及 snapshot 留存、门外继续循环、worktree 清理错误传播 | 完整 Relay 失效与下一真实 incumbency 的端到端因果链；重复 fold 不是重启 |
| [006] | 事实投影保留 Road、终态和 worktree 身份；受控资源创建/采用/清理 | fresh process 从真实中断产物恢复且沿用原 worktree，见 GAP-212 |
| [007] | claim 三分支优先级；真实 Program 在受控 target 现实下发布、补记 Published 或继续循环；已发布重入不再 ff | 在真实进程故障后自动完成这些分支 |
| [008] | 冻结符号引用、head 读取拒绝、错误分支与 expected head、严格快进判定 | 所有并发进程共享同一入口的完整发布原子性 |
| [009] | Job/worktree 身份在事实投影中稳定 | 追加 charge、retirement、AuthorityRevision 与真实物理 session 的完整接线 |
| [011] | 明确 TODO | 真实 fork/resume/join 发给 provider 的内容遵守 horizon，见 GAP-212 |
| [013] | target 前移或 CAS miss 时真实 Program 释放门禁、失效、rebase 并继续；新事实替代旧绑定 | 仅凭失效端口被调用就断言其持久化成功 |
| [014] | 真实 Program 拒绝 stale certificate、unmerged files 和错误恢复 snapshot | 满分评估的全部生产路径均已贯穿到同一检查 |
| [015] | 真实 Program 对观察到的 snapshot/certificate 不一致请求新 assessment，含 fresh 正向控制 | 真实 Engineer/DevOps 修改后，旧测试证据失效并新跑验证，见 GAP-212 |
| [017] | 明确 TODO | 两条真实 Road 合流后对最终工作树完成独立验证，见 GAP-212 |

`PublishClaimed` 的 Surface 只接受明确给出的完整绑定材料，不再从 Job 或候选记录猜字段；这项测试证明接缝没有补造事实，不能替代生产事件解码兼容测试。已删除的 `applyFact`、`createJobResult`、`jobView`、`dropEphemeral` 曾在接缝中自建失效与跨 Road 规则，其结果不能证明生产实现。

原 [014]/[015] 中四个真实 VerdictMailbox 用例已移到 delegation [014]/[015]：FIFO 与余项、空闲 sentinel、中断不消费最终结果、已就绪结果先于中断。它们证明委托结果接收，不证明发布或质量证据失效。

## 执行与缺口

普通层先运行 `node scripts/build.mjs`，再由正式 requirement runner 的 `TESTS_MJS_FILES` 选择本包 NNN 文件，保留新鲜度检查与 TODO/失败。真实 Git/Host 的002/005/008用例需开启 integration，经现有 `superviseNodeTest` 和既有集成预算执行；不裸跑 `node --test` 绕过监督。Change Program 的隔离 Fable 证明由 structured-workflow013 承接，实际命令与结算见[拆分计划 R07e](../../../proposals/子系统拆分收尾计划-2026-10-13.md)。本目录全部文件执行不等于所有合同已满足。

GAP-212 登记上述生产流程证据缺口；GAP-213 登记已修的门内重复清理；GAP-214 对应 `002` 的 cleanliness 错误传播与新 Job 拒绝回归，不代表既有义务恢复的完整验收；GAP-215 / 55-D1 保留门禁范围与持久协议的合同分岔。缺少真实执行的 TODO 不计入通过，不用测试自建事实补齐。
