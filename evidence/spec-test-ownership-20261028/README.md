# 规范测试归属修复

日期：2026-10-28。基线：`a769e34d9`。分支：`codex/test-optimization-20261024`。

## 原因与修复

全树规范检查此前有一个失败用例，报告两处归属问题。检查器、扫描范围、失败判据和断言均未修改。

### 双向消息渲染

`635b32911` 同时新增根 AXIOM 2 与 `delegation/tests/034.test.mjs`，却没有在该包登记条款 034。本分支的条款历史也没有定义或废止过该编号。测试中的行为并未失效：父到子任务正文、子到父报告正文与附带材料的区分，已有 delegation-019 和 provider-projection-009、014 的合同基础。

将两项渲染用例并入 [019.test.mjs](../../requirements/delegation/tests/019.test.mjs)，锚点改为 `WHAT[delegation-019]`；补清 [019 条款](../../requirements/delegation/WHAT.md) 对双向正文与材料的分类、单次呈现和编码职责。原有字段、正文、双语和转义断言全部保留，仅复用目标文件的解析与渲染导入，去掉逐行复述断言的注释。

不新设 034 来填补报错：后续上游提交 `3195f1372` 已将该号用于另一项协商行为，不能用那份合同替当前渲染用例背书。删除原 034 文件仅消除错误归属，没有删除用例。

### 长等待程序

`d140299a8` 修改的是 repository-programming-006 的“整次调用不设总时限”合同，却把相应回归放进了 053 文件。053 负责 `prefixUntil` 与 `carry` 声明；这项回归的 006 锚点正确，存放位置错误。

将该用例移至 [006.test.mjs](../../requirements/repository-programming/tests/006.test.mjs)。保留真实 `this.call`、10,500 ms 子进程等待、DevOps 角色、输入声明、会话身份与两个结果断言。目标文件直接准备同样的工具，并在 `finally` 清理声明状态及临时目录；[053.test.mjs](../../requirements/repository-programming/tests/053.test.mjs) 保留其余全部用例。

## 验证

Node 26.6.0；行为运行使用 `/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`，并发为 1。生产源码与依赖未变，正式运行器确认构建产物仍对应当前输入，没有跳过新鲜度检查或修改预算。

| 范围 | 修改前 | 修改后 |
| --- | --- | --- |
| requirement-system 全部顶级测试 | 18 passed / 1 failed，见[前轮记录](../test-rules-migration-20261028/refine-requirements.log) | 19 passed / 0 failed |
| 正式运行器执行整个 requirement-system 套件 | 本轮修改前未执行该范围 | 19 passed / 0 failed；9/9 文件完成，进程组回收 `accepted=true` |
| 受影响行为回归（原生 Node 定向） | 4 文件，33 passed / 0 failed | 合并后 3 文件，33 passed / 0 failed |
| 10.5 秒真实等待用例 | 10,585.987 ms | 10,635.700 ms |

上述成功运行均为 0 skip、0 TODO、0 cancelled。原始输出：[行为基线](vibe-fs-rule-ownership-before-native-20261028.log)、[行为复验](vibe-fs-rule-ownership-after-native-20261028.log)、[规范复验](vibe-fs-rule-ownership-requirements-20261028.log)、[正式规范验证](vibe-fs-rule-ownership-formal-20261028.log)。耗时仅用于确认真实长等待仍被执行，不据此宣称性能收益。

另外，用 Acorn 对照移动前后的 30 个静态测试声明（双语循环实际产生 33 个用例）：除两项渲染测试的归属编号与导入别名外，所有未改夹具的测试函数语法树一致。长等待用例单独核对程序、参数、会话、角色及断言不变。真实全树扫描器返回空问题列表；原有“缺条款”“错归属”“不得回退旧规范”等受控反例仍通过。没有为本次修复增加忽略名单或修改规范检查代码。

## 未纳入通过结论的运行

最初对四份行为文件调用正式运行器时，执行环境没有 `node` 命令路径，进程枚举也被拒绝。该次运行在 5 秒静默后停止，只完成 3/4 文件，未产生权威汇总，回收阶段报告 `ps EPERM` 与 `kill EPERM`。完整输出保留于[首次受限环境记录](vibe-fs-rule-ownership-before-20261028.log)，不算有效行为基线，也不从最后一条判决推断静默的唯一原因。随后检查该次已记录的进程身份，均已退出。

补齐工具路径后，在相同环境下取得前后两轮原生行为回归；正式运行器另完整执行规范套件。两种范围分别报告，不把原生行为回归写成全部业务套件的正式验收。本轮未运行完整 unit、integration 或发布验证。
