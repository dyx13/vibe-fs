# 四小时施工最终源码验收收据

源码 `955cf9153e46ec3911e2c10f7d00c51507599d2d`，tree `51ef99a1cc79b2103483ea72db51876eb16f6b14`。后继收尾只修改记录，不能借本收据授后继 SHA 全绿。

## 本地原 release

先独立显式执行 `node scripts/derive-envelope.mjs`，exit0；然后 standalone Node24 执行 `npm run verify:release`，没有覆盖预算、并发或 tier。冻结输入 `def30bc9f7c84d50`，日志目录 `.fable-build/verify-logs/2026-10-10T11-09-45-183Z/`。

format:check 4.3s、check 3.7s、clean build 40.4s 均通过。gen408，1516 compile items、828 emitted modules、174 registered surfaces；Fable34046ms、owner35601ms。

unit 110.1s 后失败：原5000ms verdict silence watchdog 在5002ms触发，817文件中815drained、2active、0queued。活动 verification-system016 最后通过 held install cancellation，随后已进入完整Node/npm归档capture；requirement-grounding007 最后通过openai result suffix/guidance ordering。两worker均无exit cost。background stdout不续判决看门狗；没有权威summary，完整pass/fail/skip/TODO均unknown，不数嵌套故意失败夹具。

inner group44571退出后仍有44619、82601、91978、91981；已回收，但group验证174.005ms、accepted=false，保留资源失败。收尾再次按这六个exact PID检查，均不存在。整个release退出1，161.9s；integration/harness/E2E/package未进入，计数unknown。窗口结束后没有独立补跑这些层，不能借早先Long Stroke36/0拼成最终输入通过。

原日志 `/private/tmp/vibe-fs-final-release-955cf.log`，SHA256 `d189a83c43d5afbff8761417f5b8418726cc388098018409c625dcf9b5d4ce89`。build SHA256 `4c3c33cbbfeee429558fb17c3740727d3e523867fba9c72e86e32f9ff4da5935`；unit SHA256 `734718fe70650f27ae9d1f9c402bc8fde2d2f9444b558c8ddc043910140e6bad`。

## 精确源码 CI

[38047379191](https://github.com/dyx13/vibe-fs/actions/runs/38047379191)，job114199524891，2026-10-10 11:08:59—11:15:51 UTC，FAILED，head为上述源码。

Prepare、format、check、clean build通过。gen1，1516items/828modules/174surfaces，Fable50691ms、owner56173ms。unit原300000ms physical backstop截断：700drained、2active、115queued /817。四计数均unknown。

活动 requirement-grounding007 最后通过anthropic canonical X/guidance ordering；012最后通过独立normal boot旧消息重放。两worker均未收到exit cost；最后活动文件不授吞吐根因。group2921回收accepted=true/9.544ms。unit300.6s、整release380.6s；后续integration/harness/E2E/package未进入。

原日志 `/private/tmp/vibe-fs-s1c-mailbox-ci-38047379191.log`，SHA256 `13d7a59f20352b9080b980c9c79e132c1d78e5f968cdacce5c9ecf0ac6d8c395`。官方verify-logs `/private/tmp/vibe-fs-s1c-mailbox-ci-artifacts/`，latest/build SHA256 `1765926be978f03c68e62943eb72dd1cce7a8fd4dd06740ebf0b215410280af1`，latest/unit SHA256 `04ddf8d63fe6ea238518e3b21ff930567a928356a007243a8be08043ec4d62e7`。

## 裁决

S6原最终release及精确CI已执行，发布门禁仍失败。不同平台的silence与physical budget失败分别保留；没有固定同输入A/B，不裁定唯一环境原因或具体代码成本。既有有限回归继续按各自输入和层级使用，S1b2提前消费、完整GAP、最终未执行层及稳定吞吐都未闭合。
