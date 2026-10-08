# R12：原 Work 的公开 Join 与 guidance 平面

本目录是只读整理出的候选归档。保存实际运行日志，不把夹具错误计入正式红绿；不包含最终全项目验收结论。

实际 wire 取证来自 gen340 的独立 Long Stroke 预验，原始输入摘要 `c1a3903216271fd9bbea6c5bb949be3580c67db84ba1c2d9ebd2a0106374a7b3`，前后相等。HEAD 为 `8d3a7406ab7df9e13a4af8fca12c0799df5c2398` 加施工差异。外层 14.080416 秒、exit1、未超时；TAP 14 tests，13 pass / 1 fail / 0 skip / 0 TODO，12.777657 秒。实际 owner 的三条 Join 结果中，恰好一条包含完整生产 renderer 正文，紧接 `NUL+BOM` 指导，无 `<system>` 标签。旧全字符串相等得到零；完整正文后紧接真实分隔符的匹配得到一。

| 运行 | pass/fail/skip/TODO | Node test 耗时 | 退出码 | 证据意义 |
| --- | --- | --- | --- | --- |
| join-wake-host013-red.log | 12/1/1/0 | 781.039125 ms | unknown | 错误夹具；不是目标 oracle 红 |
| join-wake-host013-green.log | 12/1/1/0 | 774.851250 ms | unknown | 同一夹具前提失败；不是绿 |
| join-wake-host013-contract-red.log | 12/1/1/0 | 779.057458 ms | 1 | 修正夹具后，目标一次交付断言 0≠1 |
| join-wake-host013-contract-green.log | 19/0/1/0 | 754.904084 ms | 0 | 014/015 局部回归通过，真实 release 用例跳过 |

前两次错误草案把任意文本当作 PairProgramming Surface 可以直接采用的 marker，实际 Surface 输出固定 canonical 指导，因而先在夹具 output 断言失败。它们没有证明 oracle 缺陷，也没有验证修复。修正后，`withHostGuidance` 只使用 canonical 指导；“只在 guidance 内引用原答案”通过明确构造的 wire 负控表达。

正式红绿的命令由执行者确认：先加载 `/private/tmp/vibe-fs-release-env-oct8-7eQsBo/env.sh`，红运行 `node --test requirements/verification-system/tests/014.test.mjs`，绿运行 `node --test requirements/verification-system/tests/014.test.mjs requirements/verification-system/tests/015.test.mjs`，各自输出到对应日志。命令未通过构建新鲜度入口；可用 dist 为 gen340，但 JS、registry、测试已变动，不能把 gen340 称为这些新输入的新鲜构建收据。具体输入 digest 未冻结，记 unknown。后续 gen341 构建不能倒授给这些旧运行。

最小修复只接受完整 `expected`，或完整 `expected` 后紧接 `NUL+BOM`。它不在 expected 自身内部截断，也不改为 contains。原 Work、Authority Root、child、Handle、终态、内容摘要、消费事实、owner 及 Join call identity 仍须匹配；恰好一次要求不变。正式负控继续拒绝错误 Work、foreign owner、正文多字、无分隔追加、仅 guidance 引用和不同 call 的重复结果；相同 call 的历史重放只计一次。临时全文诊断已移除，原始 wire 失败日志保留。

`guidance-delivery` WHAT[009] 规定 guidance 在真实终端工具结果后用 `NUL+BOM` 分隔；生产 `PairProgrammingThoughtTransform` 与 `provider-projection` 010 正式测试一致。现有 PairProgramming Surface registry 条目只增加 VERIFICATION-SYSTEM-014 lawOwner，尚须最终静态门禁收据。

资源边界：局部正式回归的 `withForkRuntime` 在 finally dispose runtime 并删除其精确临时根；独立资源盘点结果 unknown。gen340 真实预验只记录其 monitor PID29537 ESRCH，不能据此声称全部 scratch、Host 或挂载清理。此目录不执行清理。

`R12-evidence-receipt.json` 保存准确命令、身份、四类计数、原始文件 SHA256 和候选选择。建议整目录归档。排除已被纠正的初始红草案 patch；最终实现以仓库 diff 为准。gen339 的 jfEqx2 SQLite/Work 材料属于前一次运行的辅助证据，不混入 gen340 wire 身份。全项目统一 release、最终 Long Stroke 和该提交 CI 均待新冻结输入验证，skip/TODO 不算通过。
