# degeneration-guard 测试说明

[WHAT](../WHAT.md) 是规则来源。测试分别证明数值算法、局部传感器和 Host 组合，不将一种证据冒充另一种。

| 条款 | 已有证据 | 限制 |
|---|---|---|
| 001/003/005 | 有限重复/多样性样本、普通代码样本、严格边界、独立末次出现权重公式、词表计数 | 样本正常不保证所有正常输出无误杀；有限测试不证明渐近复杂度，须审查更新算法 |
| 002 | 实际 delta codec 与传感器的文本/非文本区别 | 未证明所有真实 Host 输入都是 assistant、无权威旁路 |
| 004 | 实际 selector 的正反路径、tracked read 后解码/过滤、字节摘要、并行编码等价、worker 失败清理；显式派生后真实 Fable clean/full 编译与后续产物拒绝恢复原包络，语料变化不隐式更新 | 小型 fixture 缺 Plugin entry，有限证明包络保存与失败回滚；不授全仓构建或同一 staged build 的完整 lineage/traversal，GAP-145 保留 |
| 006/008 | 独立对象、显式 reset/drop、精确 session/run 的消费与重复拒绝；006 新增 guard 截断后完整 fresh 统计、连续三轮、会话隔离与迟到 delta 的正式 Surface 回归 | 独立对象不是 OS 重启；已完成任务的删除不是在途取消；真实 Host run 边界与取消仍待接线证明，保留 GAP-145 |
| 007/009 | 实际 sensor 的 interrupt、异步 reconcile、continuation、拒绝诊断及受控暂停；拒绝/抛错和续发结束后同 run 不重复中断 | 发送端口的 Result 不能证明真实 transport acceptance 分类；完整 Host 组合与取消仍属 GAP-145 |
| 010 | 注入 eligibility 的正反控制 | 不代表生产 Owned/parent/managed/compaction 选择完整 |
| 011 | 两种语言的完整资源投影，按公开读取语义去首尾空白 | 资源内容与翻译语义人工审阅；真实 authority 与资源选择仍待证 |
| 012/013 | 013 直接比较成功/抛错诊断下的相同控制 trace，覆盖 continuation 成功与拒绝 | 012 原源码词形与重复局部场景不证明真实 turn/fission 无第二恢复，已转 TODO |

所有局部异步用例等待实际 owned task 或使用受控 Promise，删除了固定15毫秒等待。观察列表保留实际调用次数。测试辅助代码只构造事件、控制外部端口和记录事实，不复制 guard 状态机。

006 新增用例只经 `LoopSensorSurface.observe → consumeAbortCause → activeTask` 进入实际 sensor，不显式 reset。两种异常分别验证三轮 consume/drain 后短正常输出不会立即再次 abort，而后续真正异常仍可各触发一次。重新使用相同文本并与正式 `LoopDetectorSurface.create()` 的同序列结果比较 detector step 和 weighted count（仅容纳现有诊断四位小数的显示精度），用于区分完整重置与只改 count/Step 而残留 last-seen scratch。诊断只作断言材料，不参与 sensor 控制。另一会话预先积累的统计在相同 run 字符串下保持原样；旧 run 的 text/thinking delta 在 continuation 在途和排空后均不污染新统计，也不解除一次中断限制。以上是局部 sensor 回归的证明范围，不是实际 Host acceptance、OS 重启或取消的证据，历史 TODO 不变。

007 的两项 GAP-146 反例已转正式回归：interrupt 拒绝或抛错仍保留 exact run 的已尝试记录，detector reset、其它 run 的中断及 continuation 结束都不解除同 run 至多一次限制。consume 现在等待 exact run 的 owned interrupt；返回成功才认领异常并续发，拒绝或抛错则返回 External。受控 Promise 同时证明 pending 时不续发、任务仍归属原 run，以及成功后恰好一次 continuation。等待者捕获的任务身份也是消费和失败清理的条件：DropSession 后即使同 session/run 被重新观察，旧任务的成功、拒绝或抛错都不能消费或清除新任务的 anomaly。HostTurnObserver 等待异步 cause，再等待 owned continuation；完整真实 Host 场景仍待补，不把局部证据称作 Long Stroke。

运行前执行 `node scripts/build.mjs`；通过正式 runner 的 `TESTS_MJS_FILES` 选择本目录13个编号文件，并设置 `WXS_TIER_INTEGRATION=1` 执行004当前仓库派生。未启用 integration 必须报告该缺失。TODO 阻断整体验收。新基线验证范围及剩余问题见[本批记录](../../../proposals/archive/2026-10-03/35模块PR施工记录-2026-09-28.md)和 GAP-145—147。
