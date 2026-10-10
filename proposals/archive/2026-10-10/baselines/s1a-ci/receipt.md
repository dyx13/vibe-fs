# S1a 精确提交 CI 收据

源码 `660cb1f22be5615f28064cb32e938723747f0470`，master 普通推送。运行 [38037818628](https://github.com/dyx13/vibe-fs/actions/runs/38037818628)，job `114171833128`，2026-10-10 08:25:21—08:31:34 UTC，结论 FAILED。

- Prepare、format、check、clean build 成功，gen1。包络交付修复再次越过干净构建。
- unit 817/817 文件排空，271.45s wall，4974 pass/2 fail/131 skip/381 TODO；group3506 回收 accepted=true/7.944ms。
- 两个失败：requirement-system017 检出 relay-assessment002 两项标题错写001；time-capability004 检出 Git/Gateway141/160、Git/Hook/Sync63 直接读 DateTimeOffset.UtcNow。前者是需求映射错位，后者需注入时钟，不放宽门禁。
- 本次006未重现12/11，且未触发300s；只证明该输入此次完整排空，不能覆盖前一CI的失败或称吞吐已稳定修复。
- integration/harness/E2E/package 未进入，计数 unknown。131 skip、381 TODO 不计入通过。

官方原日志 `/private/tmp/vibe-fs-s1a-ci-38037818628.log`，SHA256 `83140da0d313ac912621c49625e6601443d31a37c83d7cb54df231fe497ab3fb`。上传 artifact ID `11665085738`，zip SHA256 `2b06a2df521b407791f70fd29ce6d67d7a826fdca70dd1672e153e15e96557ec`，已下载至 `/private/tmp/vibe-fs-s1a-ci-artifacts/`。命令显式指定 origin 仓库 dyx13/vibe-fs；初次未指定仓库查到了 gh 的默认 fork，仅为工具定位问题，不作为本仓证据。
