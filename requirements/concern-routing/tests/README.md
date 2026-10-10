# concern-routing 测试与证明范围

规则来自 WHAT；本页不增加规则。pure projection、真实插件和物理 Host 是不同证明范围。TODO 不计通过。

| 文件 | 已执行的边界 | 尚缺的边界 |
|---|---|---|
| 001 | 生产 subscribe/fold 的空输入、owner/语义冲突、generation 身份、幂等 | 两个真实 workspace 隔离、持久并发 claim |
| 002 | per-recipient coverage（纯投影） | 自动订阅下实际插件的公告交付 |
| 003 | 生产 fold；真实注册 user publish、SDK/HTTP 接纳、root 副本、失败/重试 | Desktop 渲染、通知跨重启去重 |
| 004 | pure placement；真实 transform 旧 raw/decorated 全字节冻结、下一 occurrence 收新消息及同锚定事实覆盖 | 实际 append 拒绝、冷重放 |
| 005 | 自动 root/Ada 邮箱、双向发布只追加两条信息事实；两 authority 和 owner Started、全部 Host prompt/abort 不变 | 公告/消费后的 office entitlement、authority 和冷恢复 |
| 006 | 原代开任期；注册 Accepted 随原退休事实关闭 mailbox、新 Session replacement 不继承；首次确认/Continue 保持邮箱；新进程重放 Accepted 关闭状态 | 同 Session 新 life、新代自动订阅、另一 live 邮箱保持开放、异常/自然终态、旧错误日志恢复 |
| 007 | 待真实职责边界审计 | 禁词扫描不能证明没有工作流或新权威 |

## WP-033 / WP-034 / WP-035

合同已改：`subscribe` 工具退役；会话建立时自动订阅自身名字（无上级命名的 user-facing 会话用保留地址 `root`）；`publish` 保留，并在 `id = user` 时弹出用户可见通知并把消息复制给保留地址 `root`。保留地址由 `Interaction/Concern/Projection` 的 `ReservedAddress` 发布。

原依赖 `subscribe` 工具的证明已由当前自动邮箱合同逐叶接续；003—006的有限回归和剩余TODO以正式文件及[本轮收据](../../../proposals/Upstream四小时施工-2026-10-10.md)为准。TODO不计通过。

未决：自动订阅以会话的稳定 Byname 为地址；没有 Byname 的会话统一落到保留地址 `root`，因此同一 workspace 内至多一个无名字会话能拥有 `root` 邮箱。该命名规则需要设计裁决，见 WP-033 报告。
