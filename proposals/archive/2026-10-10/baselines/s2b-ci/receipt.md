# S2b 精确提交 CI 收据

源码 `b0600145fbc0569e867bb8a02e0e608608db14b8`。运行 [38042094968](https://github.com/dyx13/vibe-fs/actions/runs/38042094968)，job `114184203158`，2026-10-10 09:38:23—09:45:34 UTC，FAILED。

Prepare、format、check、clean build通过。gen1，1516items/828modules/174surfaces，Fable60553ms、owner66322ms。unit原300000ms截断：817文件中624drained、2active、191queued。完整pass/fail/skip/TODO均unknown。

活动provider-projection011（PID22033）最后判决是incorrect hash wiring通过，cutoff wiring已start但未收到判决；relay-context-projection001（PID22489）尚无判决。两者exit cost均missing。inner group3120退出后仍有22033，随后被回收；post-exit accepted=false/52.123ms，本次存在资源组失败，不能写为正常收束。

integration/harness/E2E/package未进入，计数unknown。S2a和本次均无固定机器输入A/B，墙钟不能据以裁定S2b引入回归或已修吞吐；006本地完整有限闭环保留，其稳定性以各自输入另判。

原日志 `/private/tmp/vibe-fs-s2b-ci-38042094968.log`，SHA256 `a101a8f3a4cd1d2c8c429b71dd429c4b0e2c05d8d03b190a6b9175e85dd65474`。官方verify-logs在 `/private/tmp/vibe-fs-s2b-ci-artifacts/`，latest/build SHA256 `36004a0a97118f141f815910c50dca634bb6b3cd5fd720841e9a3d25b38df405`，latest/unit SHA256 `4611fe0d4e8178d32e49307f02457337227a34a086b9b9c602fba080e353d880`。gh显式指定dyx13/vibe-fs。
