# 测试规则迁移记录

日期：2026-10-28。基线提交：`fcae7e1d7`。工作分支：`codex/test-optimization-20261024`。

## 目标与完成范围

将仍在当前验证设施中使用的测试规则改写为 AXIOM → LEMMA → SPEC，并让现有 prompt 和规范读取代码共同使用新正文。根目录 `AGENTS.md` 未修改，`wanxiangli` gitlink 与源码未修改，主仓生产行为及测试运行层级未改动。

新的唯一正文是 [AXIOMS.md](../../requirements/verification-system/AXIOMS.md)。4 条 AXIOM 解释关切与理由，7 条 LEMMA 写前提、推理和适用条件，20 条 SPEC 承接原条款。原有 001–012、014–021 编号及旧正文中的有效义务全部保留；013 未复用。OpenCode 连续场景、日志观察器、主仓验证层级和扫描禁令分别注明当前适用边界，不据此声称旧宿主设施已迁入库。

资源所有权、结束等待与结束工作、真实释放与截止保护、不可变准备复用、环境与用例身份核对、排空与回收计时、无效轮次处理，均已合入新规则。此前完整 unit 节省约 32.1% 的实验仍只作为有边界的证据，不是以后任务的提速承诺。

## 入口与权威

- [旧 WHAT](../../requirements/verification-system/WHAT.md) 只保留导航，无条款定义。旧 `WHAT[verification-system-NNN]` 测试标题定位新 SPEC，不再决定读取旧文件。
- [高效测试附加段落](../../proposals/高效测试Prompt.md)与[规范施工 prompt](../../proposals/规范施工Prompt.md)均要求开始测试工作前阅读新规则。README、规范索引、人工巡检及测试说明同步改为新入口。
- requirement-system [005]、[006]、[007]、[008] 明确该包的唯一正文位置。其它未迁移包继续读取自己的 WHAT；被测业务的行为合同没有被测试规则取代。
- `scripts/lib/spec-rules.mjs` 集中声明已迁移包的文件名，并只从 AXIOMS 的 SPEC 部分取得正式条款。规范完整性、实际全树扫描、唯一归属、语义接口清单和消融清单发现均使用这一选择。不存在“新文件缺失则继续读旧 WHAT”的路径。
- 构建命令和测试运行器执行代码，不会解释 Markdown。规范检查能验证发现与引用，不能自动证明一条自然语言规则已经被全部实现。文档迁移与实现验收分别记账。

## 验证

运行器为 Node 26.6.0（`/opt/homebrew/bin/node`），没有构建 Fable、运行完整 unit 或启动真实宿主场景。

| 范围 | 修改前 | 修改后 |
| --- | --- | --- |
| requirement-system 全部顶级测试 | 15 passed / 1 failed，共 16 | 18 passed / 1 failed，共 19 |
| js-semantic-surface/003 | 7 passed / 0 failed | 8 passed / 0 failed |
| feature-ablation/001 的新增迁移发现回归 | 未有该用例 | 1 passed / 0 failed；其余用例未在本次运行 |
| 当前实际 ablation-manifest 门禁 | 通过 | 通过 |

新增的前四项迁移回归先在旧读取代码上运行，0 passed / 4 failed，失败原因分别为拒绝 AXIOMS、仍要求 WHAT、未发现新 SPEC 和接口所有者仍读旧文件。修改实际读取代码后，这四项及新增消融发现回归均通过。另覆盖新文件类型错误、旧文件重新定义条款、SPEC 外的伪定义、重复编号、删除新条款后遗留测试及跨包 law owner；既有正常控制与旧格式包仍通过。

首次修改后运行曾有一项诊断文本断言不匹配：提示从 `owner WHAT is missing` 改为 `owner rule document is missing`。已改为完整错误数组比较，保留所有者和实际文件路径，未放宽行为断言。

最终合并运行的 requirement-system 与 js-semantic-surface 结果为 26 passed / 1 failed，共 27；完整输出见 [focused-tests.log](focused-tests.log)，日志只去除了两处空白行的尾随空格。单独的消融迁移回归为 1 passed。全树扫描的唯一失败在前后均由下面两项既有问题构成，身份和内容一致：

1. `requirements/delegation/tests/034.test.mjs` 对应的条款 034 不存在。
2. `requirements/repository-programming/tests/053.test.mjs:41` 使用 `WHAT[repository-programming-006]`，与文件主归属 053 不一致。

没有改写或跳过这个全树失败，也没有修理范围外的业务测试。本次不能报告全仓规范巡检全绿。

静态核对另确认：20 个旧条款 ID 和全部旧正文义务进入新文件；旧 WHAT 无正式条款；新规则与附加段落的本地链接可解析；根 AGENTS 与基线逐字相同；`git diff --check` 通过。

## 之后如何生效

这条独立分支上的现有测试 prompt 已指向新规则，规范读取代码也已切换。主分支和其他工作树需在合并或取得此提交后才具备同样入口。按新 prompt 工作的 agent 应以 AXIOMS 为测试规则依据，并结合被测模块的现行合同；仅仅启动旧分支上的构建命令不会自动获得本次迁移。
