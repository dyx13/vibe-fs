# R19：Host title 与受管 User 复用的有限验收

本目录保存 R19 已终局正式红、Fable 构建、相关选集和真实 Long Stroke 通过的原件，以及首次夹具诊断和 R18 前置失败。不覆盖 R18 归档，不证明最终冻结输入的全项目 release 或新提交 CI 通过。

原件见 [压缩包](finite-r19-host-title.tar.gz)，SHA256 `5e3cc0eb151cda8d5a2b485ace8ca4146a112af773fe5f71daae242c3bcba2a0`；17 件源文件、1985441 字节，含矩阵/inventory/SHA 共 20 件、2014080 字节。[manifest](manifest.json) 和 [逐件回读](archive-readback-verification.json) 保完整路径、字节与 SHA。source/ 是实际三份 hook/WHAT033/正式测试的只读 bytes 副本；不是另写源码或新的测试输出。

- 首 prototype 为0pass/2fail、1244.295791ms：title 漂移是产品反例；structuredClone 丢 F# model prototype 是新增夹具前提错误。两者原文保留，不把第二项算产品红。
- gen371 正式033两 case：1pass/1fail/0cancel/0skip/0TODO、974.828125ms；唯一失败为相同已接纳 User 的 engineer→title。五项 managed/model/unknown-agent/Title/title-other 负控通过。
- gen372 Fable 构建成功。相关选集133/133、779pass/0fail/16skip/55TODO、35.40s wall/58.37s test，exit1仅pending-proof；skip/TODO不算通过。inner进程组57932回收 accepted=true/15.747ms，完整 filesystem/mount 清理 unknown。
- 原selected环境的全仓 Fantomas --check（session41560）和 node scripts/check.mjs（session34394）均由主线工具收据确认exit0；wall未保存为unknown。Fantomas成功无输出的0字节日志按原样保留，不伪造结果JSON。
- gen372 实际014入口35tests、35pass/0fail/0cancel/0skip/0TODO，TAP19622.512708ms、outer21153.345333ms、exit0。输入前后相同，digest `1124b9a0aaab6849e3a7283e2e28d71150eb2ef1439fffd7c26ba754f0cc9bc5`；仍是 dirty ddb0c28cf 输入，不借给后续提交。humanroot-manager-title.0/title.0 保持 required，expectSatisfied 完成；journal463/699、SSE2236/3351（不计 heartbeat）。monitor67672终局ESRCH仅属有限进程证据，完整资源清理unknown。

根因是 Host title 复用原已接纳 User，原 chat.params 按该 User admission 把独立 title 请求误当受管工作的 participant 漂移。修复仅豁免 primitive 顶层 agent === title；其独立模型/参数、原 User/模型引用、capacity、durable projection 与 scheduler 数量保持不变，无 abort/send。未知 agent、普通 managed model/participant 漂移及大小写/前后缀变体仍拒绝。WHAT033 与正式033一并保 SHA，不扩大到 summary/compaction 或任意辅助 agent。

causal audit 写于 green 前，其 not-run 原文是历史状态，由本包 gen372 原件接续；六变量预算快照仅是继承的有限环境证据。opening append 期间 Root 换任尚无正式证明；related TODO、ddb吞吐具体环境根因unknown、最终全仓 release 与精确新提交 CI 均保留。归档未运行测试/build、未删除/kill资源、未扫描未知目录。
