# attention-regulation 测试与证明范围

本目录不定义额外规则。认知声明、工具边界行为与持久化事实分开验证。

001、002 现断言 `enough`、`abandon` 已退休（不再注册），其「信息已足够」与「放下自我承诺」语义并入 `assume` 描述。003、006 的 recordingPort 连接真实 defer 工具与真实 attention fold，但持久端口由测试控制；它证明空输入、准入材料、失败传递、occurrence 去重与消费幂等，不等于经过真实磁盘。模型是否真的停止无意义调查或放下猜想仍需行为评估，关键词不能代替。

002 另经真实插件验证 abandon 不改变 authority、文件与 Host 会话的用例，已随工具退休删除；该行为现由 assume 的无状态语义承担，不由本包重复证明。

004 保留 recordingPort 与纯投影的 occurrence 去重、命名消费与状态不变；celebrate 与 regret 已随 WP-036 退役，旧的 celebrate 尾部消费用例随之删除。005 的前五项只证明纯投影的命名消费、重复折叠、乱序和 life 隔离，不证明自然终点或磁盘凭据。新增 Manager 用例经过真实注册工具与真实 NDJSON journal，Host SDK 由夹具提供：首次确认保留待办，Continue/Accepted 正常退休追加精确独立凭据；新 OS 进程重放与再追加旧 occurrence 不复活，另一参与者的同名 occurrence 保留。故障负控由注册的 F# JournalPortObservationSurface 在真实 writer.Append 边界注入已知未尝试拒绝，非目标调用透传，finally 恢复原方法；它不授物理写入失败或 CommitUnknown。工具必须报告失败，原退休事实不得抹去；退休追加被拒绝时不得提前消费。JS 只通过现有 JournalSurface 的薄观察/追加窗口接线，不接触 Fable DU 或内部 journal。

Manager 退休与消费的两次追加仍有崩溃窗口；这组成功路径与追加拒绝证明不授自动补据。Engineer/DevOps/Orchestrator 自然终点的实际呈现与物理接纳仍未证明。006 保留实际纯投影的命名消费与状态不变；依赖隔离仍待证，不能据几个单词不存在推断没有调度器。

TODO 不计入通过。GAP-118、施工记录与发布 TODO 共同保留未完成范围。
