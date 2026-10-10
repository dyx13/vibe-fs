# relay-assessment 测试证明范围

- `001` 运行真实 schema/parser，检查 findings 数组结构、每个 GAP 的 acceptance_criteria/work_plan 必须是非空字符串、空集通过与 note 不进入结果。
- `002–007` 保留真实 Decision/Fold 的身份、findings 冲突、证书、单次评估与 supplied snapshot 覆盖。Relay Surface 给公开文本等 binding 字段固定值，不能证明精确 narrative 提取、完整证书或最新工作区捕获。
- `support/plugin.mjs` 使用真实插件、临时 Git 工作区和真实 journal，Host 仅提供受控消息/发请求端口。`007` 证明非法 findings 之后仍可有效提交；`006` 证明接受后新 review 调用被拒；`008` 对非空/空 findings 比较实际返回的完整目标资源，证明选择，不宣称译文或评审语义正确。
- `009` 按新上游允许 Manager 亲自使用 js-manager 或委派只读 Engineer；能力门禁的局部验证归 capability-enforcement-025，独立调查和证据判断仍待证，不强制恢复“必须委派”的旧规则。`010` 保留显式证书失效与后继 opening，但不声称启动了 DevOps 或自动发现文件改变。

GAP-193 为尚缺的完整 binding/实际权限降级、所有评审前可见面隔离、独立调查与实际快照变化触发链。GAP-194 保留旧基线的真实反例：一次成功之后，同 ToolCallId/provider-run/input 的精确 replay 被 tool gate 拒绝，不能返回原 accepted 结果。原反例仍为可执行 TODO，须在新基线重验，不计入通过；新调用应被拒与旧调用重放须幂等是不同边界。

本轮相关 mjs 语法待新构建验证；当前工作区没有 Relay 新 dist，尚未执行行为测试。

局部：`node --test requirements/relay-assessment/tests/*.test.mjs`。正式交付需新构建和 verification-system 入口。
