# 测试优化执行记录（2026-10-26）

返回[施工方案](../../proposals/TEST-OPTIMIZATION-2026-10-24.md)。本轮完成聚焦入口的运行验收、一次失败基线及一个实测有效的夹具清理。完整日常验证仍未通过，不能把下面的局部收益当作全套提速。

## 输入与环境

- 独立分支 `codex/test-optimization-20261024`；上游 `d140299a8fef73c6e0871c738afa608f57c7b96f`，库 gitlink `3bcb47be43c4ba1225c5a1928e2f7b974e9aad74`。
- T1 验收及完整基线提交 `305d561b17a14b557d4fa814999c5f5f4b677eb2`，运行前后输入摘要均为 `c9e928399345700a84a1414e15d2f1172ad5f681842a16acf5dc6075d7c32de1`。
- 生命周期 028 修改后的输入摘要为 `d04d895c8a2296bf96d585c9433602fcf0fbaa4690dfb0be7e7285ce4af83b71`，单文件运行前后相同。产品源码与构建清单未改。
- Apple M3 Pro，darwin arm64 25.6.0，11 个可用逻辑处理器，内存 19327352832 字节。
- 隔离安装官方 Node 22.23.4 和项目声明的 npm 11.12.1；dotnet SDK 10.0.302、Fable 5.13.0。Node 下载 SHA-256 已对照官方清单核验，值为 `c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428`。
- 使用现有 CI 的并发 2、unit 静默预算 30000ms、物理 backstop 900000ms、`WXS_ACCEPT_TODO=1`；额外开启现有 worker 成本诊断。没有改变生产默认值。

[measurements.json](measurements.json) 保存环境、全部计划/完成文件、文件成本、失败用例及 skip/TODO 诊断、单文件前后对照和包回归报告。[baseline-started-cases.json](baseline-started-cases.json) 保存实际观察到的正文开始身份；开始事件不证明通过或完成。权威判决总数来自正式监督器 IPC。

[raw-artifacts.json](raw-artifacts.json) 索引原始日志及失败实验的路径、大小和 SHA-256。原始文件仍保存在本机 `/private/tmp/vibe-fs-test-optimization-20261026/`，未将这些诊断文件复制成另一套运行器或成功收据。

## T1 与构建

聚焦入口传递确切选集，拒绝拼错、空集、路径越界和 release 冲突。报告以实际监督器结果记录完成范围；伪造 stdout、缺失/重复 IPC、范围不符及虚假完成均不能通过。其他阶段明确标为 `not-run`。

| 检查 | 结果 |
|---|---|
| Fable 初次构建 | `node scripts/build.mjs` 退出 0，外部墙钟 68.35 秒 |
| 017 新报告首次回归 | 10 pass / 1 fail，暴露 macOS `/var` 与 `/private/var` 路径差异 |
| 017 路径修复后 | 11 pass / 0 fail，外部墙钟 2.95 秒 |
| 006/009/017/021 联合回归 | 110 pass / 2 fail；009/017/021 通过，两个原有 006 夹具未真正挂起 |
| 006 夹具修复后 | 67 pass / 0 fail，外部墙钟 30.75 秒；保持真实活动句柄与静默进程，未放宽预算 |
| 正式聚焦 `time-capability` | 8/8 文件，30 pass / 0 fail / 3 TODO；unit 1.784 秒、入口 2.663 秒 |
| 无变化构建 | 退出 0，`build up-to-date (no-op)`，外部墙钟 1.34 秒 |

无变化构建复用了已有机制，不作为新增优化收益。其前后构建清单 SHA-256 都是 `4ee101690255f4eb5de687458f0f03429a6d5328e4918f0fa4b6d04db8037c77`。没有运行 `dotnet build`。

正式聚焦结果见 [focused-time-report.json](focused-time-report.json)。该命令只跑 unit；格式、静态检查、构建、integration、e2e 和 package 均未在此次聚焦运行中执行。

## T2：一次完整尝试及独立 unit 基线

`node scripts/verify.mjs --profile` 在格式阶段退出 1，入口耗时 6.384 秒。14 个未被本轮修改的上游 F# 文件需要格式化。后续 check/build/unit/integration 均未启动，详见 [daily-report.json](daily-report.json)。没有对无关产品源码进行批量格式化。

为测量测试成本，随后单独运行正式 unit 入口，保留 freshness 检查及上述 CI 参数。结果为 752/752 文件完成，外部测量 312.426 秒，3646 pass、149 fail、87 skip、262 TODO、0 cancelled，另有 1 个失败容器。完整运行退出 1。完成文件意味着取得其收尾事实，不意味着该文件通过；016 的容器失败也计在完成文件内。

| 文件 | 从文件启动到排空 |
|---|---:|
| intra-participant-parallelism/014 | 31.464 秒 |
| repository-programming/053 | 31.312 秒 |
| verification-system/006 | 30.417 秒 |
| advisor/004 | 28.505 秒 |
| managed-session-lifecycle/028 | 16.555 秒 |
| process-execution/014 | 16.153 秒 |

这不是一份通过基线。已检查的失败包括产品合同断言、005 的 CI 脚本夹具误选了需要 sudo 的准备步骤，以及 008/016 仍引用已删除的 `collectGeneratedInputs`。后者由上游 `635b32911` 删除，008/016 测试没有同步；016 在加载期就失败，归档和安装准备阶段没有运行。因此不能把历史 016 耗时当作当前性能，也不能把缺失的阶段记成零成本。

现有诊断可区分排队、文件生命周期及 worker 的 pre-import→exit 区间，不能完整拆分导入、正文和清理。worker CPU 不包含所有子进程；墙钟与自身 CPU 的差不称为 I/O。文件排行只用于定位，不能相加后声称全套关键路径收益。完整日常/integration 成本及 016 准备成本仍缺有效证据。

## T3：清除 join 夹具留下的定时器

`managed-session-lifecycle/028` 的 `joinWithin` 用真实 15 秒定时器检测挂起。`Promise.race` 正常完成后，原实现仍保留定时器，进程需等其到期。现通过 `finally` 清除这个定时器；真实 join、故障注入、断言、超时长度及清理都保留。

| 同一单文件、同一环境 | 修改前 | 修改后 |
|---|---:|---:|
| 正式监督器墙钟 | 17.18 秒 | 1.96 秒 |
| 包含启动与 freshness 的外部测量 | 17.662 秒 | 2.575 秒 |
| 判决 | 3 pass / 0 fail | 3 pass / 0 fail |
| skip / TODO / cancelled | 0 / 0 / 0 | 0 / 0 / 0 |
| 进程组回收 | accepted=true | accepted=true |

每侧各运行一次；约 15 秒的差与被移除的闲置定时器一致，明显大于正文运行波动。没有据此推算完整流水线提速，也没有为了取均值重复全量。

随后通过正式 `--suites managed-session-lifecycle --profile` 回归整个受影响包：26/26 文件，155 pass、11 fail、12 TODO、0 skip/cancelled，unit 16.843 秒，退出 1。11 个失败身份与完整基线逐一相同；028 的三个用例继续通过。报告和身份比较保存在 `measurements.json`。

## 本轮范围与后续边界

T1 已验收；T2 保存失败基线及测量限制；T3 的这个夹具清理完成。016 重准备优化须先处理上游删除导出后的测试合同失配，尚未实施缓存、归档复用或复制策略调整。

T4 本轮保留原调度。当前有失败等待、物理 watchdog 用例及产品 yield 定时器，单靠长文件排行不能证明争用或尾部排序收益；本轮也未取得 integration 的可比成本。不提高并发，不扩大预算，不为排序添加历史缓存。

提交、推送只针对已授权的独立分支。master 合并、完整绿色日常/发布验收、远端 CI 和部署均未完成。

日常局部改动可用现有入口：

```sh
node scripts/build.mjs
node scripts/verify.mjs --suites time-capability --profile
```

按实际修改选择 requirement 包；公共合同改动应包含消费者。先确认构建成功，聚焦只覆盖 unit；每次的实际范围与结果写入 `.fable-build/verify-logs/<运行时间>/report.json`。
