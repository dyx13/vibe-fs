# provider-projection 测试范围

2026-10-05 Grounding新增LlmFacing.OriginalMaterial：已经实际读出的正文原样保留，只有来源metadata经typed Data生成；通用Instruction/Data布局与合同不变。有限实际调用证明归grounding007/012：gen137正式相关223/223、1454/0及真实Host serialization1/0。原正文、完整carrier、canonical工具原结果与旧持久呈现分别验证，不能据此宣称所有表示路径只渲染一次、legacy/user或完整Long Stroke已证，见[本批记录](../../../proposals/archive/2026-10-05/原始材料载体与后缀重放-2026-10-05.md)。

- 001/002/004/006 直接调用生产投影，验证快照隔离、输入不被修改、Host metadata 对齐、规范排序、同值幂等及不同 anchor/rows/metadata 的冲突。同输入重复渲染不等于执行了在线/重放全链。
- 003/005 还保留 Host codec 的有效编解码回归。这些用例不完整证明 Semantic/Wire 的类型隔离或业务只提交两种意图，后续应按实际边界拆分归属，不能为统一目录而丢掉覆盖。
- 007/013 使用仓库现有检查器及受控正反例。格式门禁目前主要识别直接调用 SyntheticToml，无法证明所有散文拼接和间接调用均受统一所有者管理。
- 008/009/012 覆盖真实 TOML 编码、接收语义、字节计算及稳定性。数据字符串与键保留原始换行；只有原值以 LF 结束且适合 literal 时使用多行 literal，其余使用标准 basic 转义，文档布局仍统一 LF。012 将每个前缀与后缀的计数对照实际渲染后的 UTF-8 字节，包括引号拼接、代理对拼接和字符串形式切换。participant-horizon 013、process-execution 014 与 ARCH-010 审计对真实输出做原值精确比较，不再为多余 LF 调整预期。
- 010 保留实际 pair-programming 注入不伪造消息、原输入不变的用例；这不证明所有合成文本都不能取得权威。重复的“导出函数存在”断言已撤去，实际权威隔离仍为 TODO。
- 011用真正SHA-256验证语义投影忽略物理call ID、保留实际参数变化，并只摘要所选前缀。实际注册Plugin另经真实Journal提交、停止/重开比对持久化摘要；错误hash和错误cutoff的生产接线变体均被同一证明拒绝。R07a拆分后，变异loader跟随实际摘要调用迁到Materialization.js的port.Hash表达式，正式七项复验通过。注入SHA-256的纯用例与这些生产接线证明分开，不宣称所有摘要路径或独立进程恢复已证。
- 014 执行实际 Join 结果与热启动附录组合，确认后出现的责任说明也在全部数据之前。仅凭结果正确不能证明所有调用路径都只渲染一次。

正式构建后选择本包、requirement-system、participant-horizon 013 与 repository-investigation 007—009。GAP-082 汇总全链、权威隔离和统一所有者的缺失证明；TODO 不计入通过。
