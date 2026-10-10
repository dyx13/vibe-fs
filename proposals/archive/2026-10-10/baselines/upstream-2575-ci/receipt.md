# 合并提交 88c5b8e9e：精确 CI 收据

- 仓库：`dyx13/vibe-fs`，不是 upstream。
- source/head SHA：`88c5b8e9ea16172fa697f0335f65904e64a29017`。
- run：[38032350546](https://github.com/dyx13/vibe-fs/actions/runs/38032350546)，workflow `ci`，2026-10-10T06:50:53Z 创建，status completed/conclusion failure。
- job：[114155752407](https://github.com/dyx13/vibe-fs/actions/runs/38032350546/job/114155752407)，2026-10-10T06:50:55Z—06:52:17Z。
- Node 由 workflow pin 为 22；npm ci 与 dotnet tool restore 成功。未使用 dotnet build。

| 阶段 | 实际结果 |
| --- | --- |
| format:check | OK，8.1s |
| check | OK，4.4s；report-only 项不作失败 |
| Fable 编译 | owner-compile OK；compiled clean impact，1516 items/42761ms |
| build | FAIL(1)，44.8s；缺少手动包络产物 |
| verify release | FAIL，58.3s，退出 1 |
| unit / integration / harness / Long Stroke / package | 未进入；pass/fail/skip/TODO 与文件排空数均 unknown |

直接错误：`missing loop detector envelope artifact: /home/runner/work/vibe-fs/vibe-fs/dist/Execution/Session/LoopDetectorEnvelope.js`；随后提示运行 `node scripts/derive-envelope.mjs`。

现源码 `scripts/build.mjs` 的 verifyArtifacts 只从现 dist 或 staged backup 保留该文件；`.gitignore` 忽略 dist，显式命令也只写 dist。CI 干净 checkout 没有二者，构建无法提供该 import。该失败发生在测试开始前，不能归到旧 300 秒截断、Node26 缺库或任一活动测试。

本轮通过 `gh run view --repo dyx13/vibe-fs` 读取 metadata 和 `--log-failed` 原始日志。日志本机路径：`/private/tmp/vibe-fs-upstream-2575-ci-38032350546.log`，596 行/204906 bytes，SHA256 `230916f1cf38581f7e2dca478995f635a40202917390be3f6ada6af72394748a`。原日志仍在临时目录，没有声称它已长期入库；远端 run 与 job 链接供复核。

本收据只授上述 source 的失败事实，不授后继 docs-only 提交的验收，也不撤销合并前有限回归证据。
