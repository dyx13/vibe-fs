# S0 精确提交 CI 收据

源码 `bfff8ebc11b3cc6743ecb23f6cf8e1a68498b961`，master 普通推送。运行 [38037018382](https://github.com/dyx13/vibe-fs/actions/runs/38037018382)，job `114169458528`。2026-10-10 08:11:28—08:18:44 UTC，结论 FAILED。

- 独立 Prepare loop detector envelope 成功；format/check 成功。
- 干净 build 成功，gen1；1516 compile items，Fable owner 70944ms，828 emitted modules/174 registered surfaces。原 missing envelope 缺口已越过，不借此称 release 绿。
- unit 新输入发现817文件；原300000ms backstop时562 drained/2 active/253 queued。活动 process-execution014/015 的最后判决均未收到；不作根因。没有权威全局summary，pass/fail/skip/TODO均unknown。
- 已完成的verification006有真实断言失败：期望诊断最后判决为`bounded work 12`，实际为11；源码行1149。不能把此项失败归作包络或仅pending，也不能改弱期望取绿。
- 原group3253回收accepted=true/9.597ms。integration/harness/E2E/package未进入，计数unknown。300s截断与006失败各留独立调查边界。

原日志 `/private/tmp/vibe-fs-s0-ci-38037018382.log`，SHA256 `117e423f1181d598f9ce8bcd2aebb45994103bd85f0a43bde97aec524692792e`。官方上传artifact `verify-logs`已读取，原build文件 `/private/tmp/vibe-fs-s0-ci-artifacts/verify-logs/2026-10-10T08-11-57-280Z/build.log`，SHA256 `0c6edc9228d30725420c6c7f35bbe2d8217a8659804d68cf8affad179d9f3122`；同目录unit/format-check/check原件保留。命令均指定 `--repo dyx13/vibe-fs`，无远端写操作。
