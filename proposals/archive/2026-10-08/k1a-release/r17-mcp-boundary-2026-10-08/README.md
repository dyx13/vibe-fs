# R17 MCP 边界：有限正式红绿与实际失败

本目录保存本轮 R17 的已封口原件；由主线执行，子 agent 只读核对并在 TMP 归档。它不证明 Long Stroke、全项目 release 或新提交 CI 通过。

原件保存在 [压缩包](closed-r17-mcp-boundary.tar.gz)，SHA256为`652130bf03637c89bd2839e6e4f6baf72c281fe97bfca17debb5cc927162304f`，32件含元数据文件共2520876字节。下面的文件名与目录均指包内相对路径；解包后可逐件核对SHA256SUMS。外层[封口收据](seal-receipt.json)与[回读验证](archive-readback-verification.json)保留独立核对结果，不另复制历史源码。

- gen361 正式 014 红：32pass / 1fail / 0cancel / 1skip / 0TODO，2762.517542ms；旧 oracle 把合法缺席的未知 MCP 工具误判为失败。
- gen362 正式 014/015 + capability-enforcement007 绿：43pass / 0fail / 0cancel / 1skip / 0TODO，3143.733667ms；release 测试未启用而 skip。
- gen363 实际 E2E：34pass / 1fail / 0cancel / 0skip / 0TODO，outer76813.039792ms、exit1、inputsEqual=true。在更早的主 Road AssessmentCommitted gte2实际1失败，未到 MCP custom。该交错由主线及因果审查 agent 认领调查，根因未定，未闭合。
- 实际 MCP 状态为 unknown。E2E 同文件日志第94行的 connected 来自前置受控正式用例，不能借给实际 Host。
- 实际 ESpu2v 的两个 Replica 会话记录为 `* deny` 加 `js-predictor allow`；Owner 的会话级 permission=null 不代表 agent 权限为 allow。DB/WAL/SHM 原 bytes 与精确 Host 日志仅作该有限现场证据，没有运行 Host API 或回收根目录。

详细范围见包内`R17-FINITE-AUDIT.md`、`closed-matrix.json`、`e2e-receipt-summary.json`与`actual-session-permissions.json`。构建日志只给 build ok/linkage结果，没有独立构建 wall/exit 收据；缺失字段保持 unknown。

`logs/` 保留三份构建日志、红/绿正式日志与实际失败 log/outer JSON。`patches/` 保留已审的正式红与实现绿补丁。`source/before/`、`source/green/` 是当时交审 R17 的精确副本，不是最终全项目源码快照；实际 gen363 输入由 outer JSON 中 before/after dirty diff 和 digest 唯一确定。`CAUSE-AND-SCOPE-before-execution.md` 是执行前调查，不覆盖其历史状态。

`plan-readme-r17.patch` 供主线在本目录复制入仓后人工审阅应用；它登记 R17 有限结果和新的 Assessment 调查状态，不改产品或测试。`archive-inventory.json` 与 `SHA256SUMS` 逐件绑定本目录原件。旧 R16 sealed-followup 的独立复制清单在 `R16-COPY-LIST.json`，保持旧 tar 与原 unknown 资源结论，不把新 R17 结果写回旧封口日志。

未执行/未证明的真实 MCP custom、动态 discovery、任意 MCP 能力映射、完整 Host 权限、最终输入全阶段验收、CI和完整资源清理均保留。不可把 skip、分批结果或受控用例输出升级为整个项目绿。
