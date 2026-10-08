# obligation-ledger 测试证明范围

本包只守住 OpenCode 原生 todowrite 的边界：provider 定义与参数完全保持宿主原样，`todos` 列表由 Host executor 原样消费，插件只在 Host 终态后追加压缩 checkpoint，不再维护 TodoSink、画板或第二份待办真相。

- 001：真实 before hook 不改写 `todos` 参数（同一数组对象原样穿透）；definition 保持宿主原样，不注入 `obligations`/`retainCheckpoints`，也不复活旧规划字段。
- 002：空列表与重复行穿透插件不改写，executor 拿到的是同一个数组对象；B5 安装版物理 canary 已落地（`support/run-native-todo-replacement-canary.mjs`）：真实 `opencode serve` + 生产插件 + strict-mock provider 经真实 todowrite tool call 提交 A/B 两 session 各自的完整数组（重复行/中文/多行/显式 priority），再由 A 提交空数组；oracle 为公开 SDK `GET /session/{id}/todo` 逐行比对 content/status/priority exact 值（该 endpoint 版本无 Host 生成 id 字段），并断言 B 的替换不动 A 表、A 的空数组不误伤 B 表。空数组断言已按 Host 实际语义校准：OpenCode 1.18.29 空数组 todowrite 为 no-op（不清表）——无插件对照探针 `support/probe-native-todo-clear-no-plugin.mjs` 两轮独立运行 verdict 均 HOST-NO-OP（2026-10-04 定案），有插件与无插件行为一致，插件链无干扰。校准后断言为：空 todowrite 后 A 表保持 set 内容不变（exact 比对不弱化），并新增 settled 静默期重读断言 no-op 稳定（无迟到清空，Host 未来若漂移回「空即清」会红）。等待信号为 provider 收到该标记的 tool-result 轮（executor 已物理执行），墙钟仅作上限。版本 fence 断言 OpenCode/plugin 均为 1.18.29（兼容基线，漂移即红）。先红复核确认插件对 todowrite 无改写路径（classifyTool=NoEstimate、无 review/estimate 字段所有权、Grounding 对非读取工具 no-op），走基线绿+隔离变异红路线，生产源码零改动。
- 003–006：不维护第二份 desired/applied 待办投影、checkpoint 不可反推 TodoTable、失败执行不形成 checkpoint、清单无裁决权。
- 005的真实插件terminal回归还证明重复终态共享同一append结果、WriteUnknown同call不重试、poison后另一call每次重入取得新拒绝身份。故障保持events目录有效，仅将实际writer路径暂换为目录，精确要求PhysicalAppend/EISDIR；finally恢复原writer字节。此前events目录替换为文件实际得到BeforePhysicalAppend/EEXIST，未达到unknown前提，本轮校正夹具而未改变生产分类。
- 007：旧 Magic Todo decoder 当前明确拒绝；若未来提供历史审计读取，也不得激活旧门禁或写回。

旧施工迁移输入仍原样保留在 historical-tests/，不进入活动测试发现集。

局部命令：node --test requirements/obligation-ledger/tests/*.test.mjs。集成用例需 WXS_TIER_INTEGRATION=1。
