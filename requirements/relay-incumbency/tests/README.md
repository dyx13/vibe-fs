# relay-incumbency 测试证明范围

WHAT 定义任期与道路规则。此目录主要调用真实 `Decision` / `Fold`；它们证明纯领域状态转换，不自动证明持久提交、并发 prompt 准入或物理资源交接。

- `001–009` 保留 opening、同任评审、退休不可逆、Continue/Accepted、证书失效和 authority update 的正反例；增加 opening 冲突及 authority message/snapshot/任期冲突。
- `006` 另经已注册 `ManagerWorkflowSurface` 直达生产显式 `maybeDeliverLoop`：真实 Dispatcher 接纳原 AgentOwnerRoot，再冷重放合法 Relay 事实，覆盖 Continue、有效 Accepted、精确失效 Accepted，以及新任 REVISE 后无证书、新任 PERFECT 后异证书的拒绝。有无 active 后继均覆盖；检查 durable claim 先于发送、原 Root/LogicalRun、一次物理发送、冷重放幂等和已有终端观察仍可接收。此受控 owner 证明不等同安装版 Change/Join 订阅或真实并发验收；stale transform 的自动续行另由 `relay-retirement/008` 约束，红绿与实际 E2E 见[施工记录](../../../proposals/K1A与全项目release验收-2026-10-08.md)。
- `010–012` 先显式绑定 DevOps，再检查重放、第二身份拒绝、Road 隔离和任期前后的同一绑定。未运行 assignment、进程或 Host resume。接缝不再自行合成缺失的 DevOps；领域 opening 的 `devops:<road>` 只是逻辑初始身份，不能当作已创建物理执行者。
- `013` 证明逻辑 opening 计数及中英文资源有 ordinal 插槽，不锁死句子，不声称插槽已送进实际请求。

GAP-192：真实并发 opening 的物理派发、真实能力控制、跨任期迟到事件、在途进程及接收未知恢复、所有证书绑定变化的生产触发链、安装版 ordinal 投递和语义人工审阅。006 的有限 owner 回归不关闭整体 GAP；TODO 不计为通过。

局部：`node --test requirements/relay-incumbency/tests/*.test.mjs`。正式交付依赖新构建与 verification-system 入口。
