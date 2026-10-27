# 整套 unit 瓶颈优化（2026-10-27）

用户要求按实际成本继续缩短整套测试时间，保持覆盖，并记录可筛选的策略。本轮从 `78ef869edf6861a78ec3beb5393130ed48227723` 开始，仍在独立分支；upstream、库 gitlink、测试并发和时间预算不变。

## 策略 P1：释放已结束调用的自动 yield 定时器（已完成，保留）

前一轮两次现版本测量中，process-execution/001、005、010、011、013、014、015、017 各占约 16.1 秒；整个 process-execution 包合计占用约 135.2 worker 秒。repository-programming/053 约 31.3 秒。这些是文件生命周期成本，不是断言执行时间。

代码调查发现 `ToolWorkflow.armProgramYieldTimer` 创建原生定时器后丢弃句柄。新程序与恢复程序都没有在调用结束时释放它。即使程序已成功、失败或显式 park，旧回调仍持有共享 park 状态，既占住测试 worker，也可能影响后续恢复。

实施边界：让调用拥有定时器，并在退出调用时释放；保留程序 promise、park 现场、原 yield 预算和真实到期行为。新增真实子进程回归，观察原生 Timeout 资源的释放及自然退出，覆盖成功、失败、启动失败、park、恢复完成/失败/再次 park，以及仍在等待时的实际 yield。不能以 `unref`、强制退出或减少测试替代清理。

验收顺序：先取得未改源码的完整基线，再验证新增回归能反证旧实现，然后做 Fable 构建、相关 requirement 验证和完整 unit 前后测量。对照核对发现集、实际启动用例、失败身份及 skip/TODO，新增用例单独列出。记录构建时间，避免把它混入 unit 时间。

## 暂不实施的候选

- `ToolsBindings.runStartedCall` 仅在 Wait 成功时清理定时器，拒绝路径可能泄漏。先保留为独立候选，不能把未测量的收益并入 P1。
- 不提高并发、不缩短预算、不删除旧失败用例、不更新过时接口来改变本轮测试含义。
- verification-system/016 仍因上游删除的导出而不能加载，重准备成本未知；完整日常流水线此前还有 14 个上游格式问题。本轮 unit 计时不能冒充这些门禁通过。

原始运行数据保存在主工作树 `.Herdchestra/test-optimization/20261027/`，本轮不再依赖可能被系统清理的 `/private/tmp`。测量结果和策略结论见下文。

旧 master 尚未包含上游的 `.Herdchestra/` 忽略规则，因此仅在本机 Git exclude 中加入 `/.Herdchestra/test-optimization/20261027/`，限定本轮数据与工具目录；未修改 master 的 `.gitignore` 或源码。格式预览副本已删除，正式原始日志保留。

## P1 的实际改动与验证

产品代码只改 `src/Wanxiangshu/Repository/Programming/Js/ToolWorkflow.fs`：定时器工厂保存句柄并返回 `IDisposable`，新程序和 unpark 调用用 `use` 持有它。正常返回、程序失败、启动抛错、显式 park 和再次 park 都经过同一条释放路径。无预算时不创建定时器，但释放对象保持非空，符合 Fable task builder 的 `Using` 实现；有预算时仍创建原来的原生定时器，预算、载荷和 promise 竞争不变。没有给定时器加 `unref`，也没有强制结束 worker。

同一文件还有两处原有格式问题，按 Fantomas 预览手工换行；没有批量格式化其他源码。repository-programming/WHAT 的 [028] 补明等待定时器归调用所有、不得干扰后续恢复。没有调整 public schema 或参数。

新增 9 个回归，放在原有 028、032 文件中，文件发现数仍为 752。子进程执行真实 WorkflowSurface，通过原生 `async_hooks` 记录 Timeout 的创建/销毁，并要求自然退出；`unref` 后仍未销毁的 Timer 也会失败。显式 park 后继续原程序；两个到期场景执行真实短命令，核验 2 字节 planB 对应 100ms、真实 Parked 结果及恢复完成。启动错误按隔离上下文的 `SyntaxError` 名称验证。5 秒只用于新增夹具的失控兜底，不改变任何已有预算。

- `full-before-3`：315.035 秒，752/752 完成；3648 pass、156 fail、87 skip、262 TODO、0 cancelled、1 failed container。156 = 原有 149 + 新增资源回归的 7 个失败；两个真实到期回归已通过。
- 首次成功 Fable 构建 12.032 秒；手工格式修正后的最终构建 11.912 秒，均退出 0，独立于 unit 计时。
- `regressions-after`：028/032 共 16 pass、1 fail，9 个新增用例全部通过。剩余失败为原有的“再次 park 必须更换 handle”，没有修改它的断言。
- `related-after`：repository-programming、process-execution、advisor 全部 83/83 文件，507 pass、51 fail、3 TODO。与基线对应范围相比，失败集合只减少上述 7 个回归，未增加失败。此轮与静态门禁并行，仅作结果验证，不用于性能百分比。
- 全部 1113 个 `requirements/**/tests/**` 文件在正式基线与修复后摘要相同：`32994d376877008e797c13928ac16b862221872061a6f4ef905a281a1fa1851d`。
- 修改文件已符合格式要求；全仓格式检查仍有 13 个未修改的上游文件失败。静态检查另报 5 处位于未修改文件的问题（3 处控制流嵌套、1 处双语标识符不一致、1 处深层 dist 导入）。这些阻塞不计作 P1 验收通过。

## 环境预检与排除记录

正式计时从 runner 子进程启动到退出，包含 freshness 和进程组回收。输入摘要采集、工具预检及构建均在计时之外。通过原监督器 IPC 获取文件计划、完成集和计数；由日志核对用例身份、skip/TODO 身份及逐文件成本。每轮运行前后都核对输入摘要，不使用 `--skip-staleness-check`。机器未清空系统缓存，仍有日常应用，记录每 30 秒的系统负载和空闲内存，不作统计显著性声明。

固定入口等价于：

```sh
NODE_TEST_CONCURRENCY=2 UNIT_VERDICT_SILENCE_MS=30000 \
SUITE_BACKSTOP_MS=900000 WXS_ACCEPT_TODO=1 \
WXS_VERIFICATION_WORKER_DIAGNOSTICS=1 \
WXS_TIER_INTEGRATION=0 WXS_TIER_RELEASE=0 WXS_RELEASE=0 \
node requirements/verification-system/tests/run.mjs
```

Node/npm 来自本轮隔离工具目录，完整 PATH 及 `WXS_VERIFICATION_NPM_CLI` 随原始记录保存。全量入口清空继承的 `TESTS_MJS_FILES`。baseline 也包含与优化后完全相同的 9 个新增回归；因此没有用“优化后少测”换取收益。

- `full-before-1`：287.802 秒。重设 PATH 时漏掉应用附带的 `rg`，多出两个搜索用例失败；排除总耗时对照。
- `full-before-2`：300.783 秒。继承 linked worktree 的 PATH 后仍缺 Homebrew 工具，其中 Bun 不可用使原有一个用例转为 skip；排除总耗时对照。紧接着的构建尝试也因找不到 dotnet 退出，未编译源码。
- 随后从主工作树捕获完整工具路径，固定 Node 22.23.4、npm 11.12.1、dotnet 10.0.302、rg 15.2.0、Bun 1.3.14；测量脚本对这些可执行文件先做预检，每轮保存完整 PATH。正式对照从 `full-before-3` 开始。
- 新增夹具最初对未结束的程序要求“全部 Timer 为零”，也错误地用宿主 `SyntaxError` 原型判断隔离上下文的异常。已改为让真实短命令结束后检查资源，并按异常名称核验跨上下文错误。两个探索性的 `regressions-before*` 只作调试记录；正式基线使用修正后的同一组 9 个回归。

## 首轮全量优化后运行的原生崩溃

`full-after-1` 用时 216.420 秒，但 repository-programming/006 的进程在 `CUT25_escape_via_global_api_binding_is_denied` 附近触发 Node 原生 `InternalCallbackScope::Close` 断言：`(env_->execution_async_id()) == (0)`。该轮只有 4056 个启动用例，较基线少 7 个，pass 少 9 个，failed container 增至 2。因此排除它的性能百分比，不能将进程提早崩溃算作提速。

检查调用链：该文件使用未改动的 `RuntimeSurface.run → JsSandbox.runSurface/awaitResult`，不进入本轮修改的 `runProgramCore/unparkSite`；源码及 wanxiangli gitlink 均未变。此前同版本 `related-after` 已完成该文件；针对崩溃的 `sandbox-followup` 再次运行完整文件，16/16 pass，退出 0，进程组清理成功。未定位原生断言的根因，不声称已修复；记录保留为间歇性风险，后续全量必须再次核对实际启动集。没有修改或跳过 006，没有改 Node 版本、预算或并发。

## 有效全量对照

| 轮次 | 整套墙钟 | pass | fail | skip / TODO | failed container |
| --- | ---: | ---: | ---: | ---: | ---: |
| 优化前 `full-before-3` | 315.035 秒 | 3648 | 156 | 87 / 262 | 1 |
| 优化后 `full-after-2` | 211.154 秒 | 3655 | 149 | 87 / 262 | 1 |
| 优化后 `full-after-3` | 216.783 秒 | 3655 | 149 | 87 / 262 | 1 |

两轮优化后平均 **213.968 秒**，较基线减少 **101.066 秒（32.081%）**；两轮相差 5.629 秒。各文件 worker 墙钟合计减少 201.445 秒，在并发 2 下与整套节省约 101 秒一致。此处是墙钟等待的减少，不等于 CPU 计算量同比减少。

三轮均为 752/752 文件、4063 个实际启动用例、349 个相同的 skip/TODO 身份；版本、完整工具环境和发现集相同。每轮源输入在前后保持一致，进程组回收成功。两个优化后轮次的失败身份完全相同，与基线相比只去掉了新增回归中的 7 个泄漏失败；没有删除用例、改变断言、增加 skip/TODO 或新增失败。

| 主要收益来源 | 优化前文件墙钟 | 优化后两轮均值 | 减少 |
| --- | ---: | ---: | ---: |
| process-execution 的 001/005/010/011/013/014/015/017，8 文件合计 | 129.017 秒 | 1.621 秒 | 127.397 秒 |
| advisor/004 | 28.904 秒 | 3.077 秒 | 25.827 秒 |
| repository-programming/053 | 31.294 秒 | 10.892 秒 | 20.402 秒 |

表中的文件时间是 worker 占用，不能直接当整套墙钟相加。053 的实际长命令等待仍保留。其余逐文件变化全部保留，不能把每一个差值都归因于 P1；小差值可能来自负载与缓存波动。

这是一次有效基线加两次优化后运行，未做 ABBA，也不保证任意机器或绿色基线都能节省相同比例。旧的 149 个失败和 verification-system/016 的加载失败仍在；完整日常流水线另受格式与静态门禁阻挡。未运行 integration/e2e/package，未声称完整验收、远端 CI 或部署通过。

## 后续筛选策略

| 策略 | 本轮决定 | 可复用依据 / 剩余边界 |
| --- | --- | --- |
| P1：让调用释放自己的 yield 定时器 | 保留 | 同范围全量约省 101 秒；原生销毁检查及真实到期正例均通过。单独提交，便于回退或挑选。 |
| 从 worker 墙钟与 CPU 用时的落差找无效等待 | 保留为诊断办法 | 先证明资源仍存活，再修其所有者；不靠减预算、删测试或强制退出。 |
| `ToolsBindings.runStartedCall` 的 Wait 拒绝路径清理 | 尚未实施 | 需要独立的拒绝反例与成本证据，本轮不计收益。 |
| 调高并发 / 调整测试顺序 | 尚未实施 | 本轮没有改变调度；现有收益来自减少无效占用。 |
| 缩短剩余长等待 | 不直接实施 | intra-participant-parallelism/014 仍约 31.4 秒，存在真实合同等待失败；verification-system/006 仍约 29 秒，包含真实监督和回收证明。先理解事件与清理边界。 |
| verification-system/016 重准备优化 | 仍未闭合 | 原加载错误使其准备阶段没有成本数据。不能把未执行当零成本。 |

## 可审计材料

- [comparison.json](comparison.json)：有效轮次、环境、输入/产物摘要、逐项等覆盖比较、负载采样和排除理由。
- [file-costs.jsonl](file-costs.jsonl)：752 个文件的前后墙钟及 worker CPU 观测，可直接用于下一轮排序。
- [coverage.json](coverage.json)：完整文件计划、4063 个启动身份、349 个排除身份及前后失败列表。
- [raw-artifacts.json](raw-artifacts.json)：原始日志、运行记录、测量/解析脚本和实现补丁的本机路径、大小与 SHA-256。所有排除轮次也保留。

本轮完成的是 T3 中的 P1 工作包；T3 的其他候选、T4 和整体绿色验收没有据此宣布完成。
