# concern-routing 测试与证明范围

规则来自 WHAT；本页不增加规则。pure projection、真实插件和物理 Host 是不同证明范围。TODO 不计通过。

| 文件 | 已执行的边界 | 尚缺的边界 |
|---|---|---|
| 001 | 生产 subscribe/fold 的空输入、owner/语义冲突、generation 身份、幂等 | 两个真实 workspace 隔离、持久并发 claim |
| 002 | per-recipient coverage（纯投影） | 自动订阅下实际插件的公告交付 |
| 003 | exact generation/occurrence 的生产 fold | 实际 publish 入口对保留 `user` 地址的通知与 `root` 复制 |
| 004 | pure placement 全有或全无 | 实际插件冻结旧 Pair Hint、新 occurrence 收新消息 |
| 005 | 无 | 自动邮箱 subscribe/publish 不改变 PromptAuthority 观察 |
| 006 | 手动退休后的拒绝、新代公告及旧材料不穿代 | 公开开任期与 LifeCompleted Surface 的邮箱退休 |
| 007 | 待真实职责边界审计 | 禁词扫描不能证明没有工作流或新权威 |

## WP-033 / WP-034 / WP-035

合同已改：`subscribe` 工具退役；会话建立时自动订阅自身名字（无上级命名的 user-facing 会话用保留地址 `root`）；`publish` 保留，并在 `id = user` 时弹出用户可见通知并把消息复制给保留地址 `root`。保留地址由 `Interaction/Concern/Projection` 的 `ReservedAddress` 发布。

原依赖 `subscribe` 工具的集成用例（002/003/004/005/006）已改为 TODO，待新合同下的集成重写。本批未运行任何测试；红绿由 DevOps 执行。

未决：自动订阅以会话的稳定 Byname 为地址；没有 Byname 的会话统一落到保留地址 `root`，因此同一 workspace 内至多一个无名字会话能拥有 `root` 邮箱。该命名规则需要设计裁决，见 WP-033 报告。
