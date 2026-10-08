# R13–R16 已封口增量证据

仅收录 root 已确认结束的 R13 gen351、R16 gen352–360 正式红绿与一次实际 Long Stroke 失败，另含 R14 wnhzKF 的完整 regular-file 备份及所有权审计。本文及归档不代表最终冻结输入验收。

| 输入/阶段 | tests | pass | fail | skip | TODO | TAP ms | 结论 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| R13 gen351 相关选集 | 279 | 270 | 0 | 1 | 8 | 29206.977 | 有限通过，pending 保留 |
| R16 初轮正式 red | 27 | 16 | 10 | 1 | 0 | 1139.987 | 目标反例及前提失败均保留 |
| R16 first-green | 33 | 21 | 11 | 1 | 0 | 856.445 | 名称不表示绿；internal/lane 编译拒绝 |
| R16 routing-green | 33 | 31 | 1 | 1 | 0 | 1283.845 | fault.lane 夹具期望仍失败 |
| R16 leg-red | 29 | 25 | 3 | 1 | 0 | 1269.071 | 两个目标 leg 反例及 lane 夹具失配 |
| R16 gen356 leg-green | 35 | 34 | 0 | 1 | 0 | 2048.512 | 有限通过 |
| R16 gen357 same-model-red | 30 | 28 | 1 | 1 | 0 | 2089.179 | 后继 Root 不应污染原任务 |
| R16 gen358 same-model-green | 36 | 35 | 0 | 1 | 0 | 2019.466 | 有限通过 |
| R16 gen359 projection/cancel-red | 32 | 29 | 2 | 1 | 0 | 2063.460 | 真实 Replica 投影及受控取消反例 |
| R16 gen360 projection/cancel-green | 38 | 37 | 0 | 1 | 0 | 2322.623 | 有限通过 |
| R16 gen360 实际 E2E | 32 | 31 | 1 | 0 | 0 | 17709.950 | MCP fixture 工具未出现在 owner wire |

正式选集的准确命令、工具版本、输入摘要、退出码和资源清理若原日志没有独立收据则为 unknown；不能从 TAP 或文件名补造进程元数据。构建日志的 generation 与成功文字只是其原始证据，不代替最终输入 manifest。

实际 E2E 的 `r16-root-protocol-e2e.json` 保留完整输入快照：base commit 为 ddb0c28cfbfa35762b2115f9609c85a296d68d1a、dirty 输入 digest 57c89eb4aeac851e8c602dcc67c5c4df7d0654d9a7fff2b80706e4c0ad1e8996、gen360，before/after 相等。原命令、1500000ms 预算、wall 19084.279875ms、exit1、signal null、monitor22832 ESRCH 均来自该收据；不是候选 ddb 干净提交的验收。实际 Host 已越过两 Bound、Replica[1,2]、原 Root owner[3,4]及材料回传；在协议 MCP 断言失败，后续 same-model/purpose/capacity customs not-run。前置正式 fixture 的 capacity 输出不能算实际 Host capacity 通过。

wnhzKF 的 172 件备份原件共16595121字节，另有原审计 receipt。两处外部 node_modules symlink 仅记录身份，未遍历。source/copy SHA 已核对。receipt 记录 monitor8820→actual owner8821 关联 unknown；即使 PID/PGID ESRCH、lsof 与 mount 无匹配，也不删除原 scratch。eligibleForCleanup=false、deleted=false，bvNnrb/BjNfGE 未动。本次仅压缩已经建立的副本，不新增清理。

既有 R13–R15 原件及 WDP70R 清理独立引用原 sealed archive SHA，不重复打包。旧只读差异审计保留其调查时点；后续说明明确指出 same-model 旧查询已被删除、projection/cancel 已补正式红绿。计划 patch 只是待 root 审阅应用的文档草案。

`inventory.json` 和 `SHA256SUMS` 对每个复制文件记录 SHA；`seal-receipt.json` 给出压缩包 SHA。没有 live logs、全系统 ps 或整个环境转储。MCP 修复、完整实际 E2E、最终冻结输入全仓 release 与精确新 SHA CI 仍待完成。
