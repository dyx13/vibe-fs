# behavior-diagnosis — WHY

行为提醒需要可追溯的规则身份和实际工作材料。若用关键词相似或数值积分代替规则含义，就难以解释为什么提醒，也容易把重复观察算成重复过错。

统一 Rulebook 让检测文本、工具选择与处置说明指向同一规则。诊断观察与工作日志原子提交，才能避免只有标签没有依据，或只有日志却遗漏对应观察。重放和压缩只改变读取方式，不应创造新的发生次数。

模型可能漏调、多调或填错工具参数。有界修复给协议一次收束机会，同时防止重复回调造成反复发送；精确请求身份和 durable settlement 则决定谁有权结束。life 内冻结规则版本，让新知识的加入不改写正在执行的协议。

本包规定规则准入、tip 选择和 cycle 结算；交付给 Main 的时机归 guidance-delivery，工具权限归 capability-enforcement。tip 的确定性映射只解释选中了哪条规则，不单独证明模型诊断在语义上正确；语料的可区分性仍需要人类审阅。

## DEPENDS ON

- `semantic-trace`
- `durable-events`
- `prefix-stability`
- `managed-session-lifecycle`
