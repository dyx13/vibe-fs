# ddb 候选完整验收原件（失败，历史封口）

输入 `ddb0c28cfbfa35762b2115f9609c85a296d68d1a`，tree `06cc8ac28bd604e867cbb0244bf918b8ee4ea4ad`，4664 项 verification 输入摘要 `fb36b4e2f95ad89f1534c15f077e497a82b6470a0becc782785b57e03adc3633`，干净构建 generation342。以下归档只授予该输入，不借给后继提交。

- `local-closed-evidence.tar.gz`：统一入口、三个独立阶段、前后输入及 manifest、实际 package、候选矩阵和原件清单。SHA256 `ab686226b938dc9855ded5ef1039e7a926f7e635d005c23eaedb89c181b1b5f6`。
- `exact-ci-37756691987.tar.gz`：该 SHA 的官方 CI 原始 job、artifact ZIP、解包收据及成本。SHA256 `173aad5118adf70fbac85d563b89ec67bacc552fb522002808f22e7e0793a895`。
- `cost-and-full016.tar.gz`：本机 unit 全部计划、准入、排空、active/queued、成本与资源审计；独立完整016原300秒运行及清理证据。SHA256 `e52ead94799d3b6b354def085741019e0f1020e150cbbe7cdbd1f57777a7a86f`。

归档保留本机截断、实际 E2E fatal 和官方 pending 三类失败。压缩仅用于保存证据，不改变验证输入、预算、测试内容或结论。目录不再追加后继运行日志。
