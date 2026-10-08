# 65a：完整源码候选验收，结论 FAILED

本目录封存干净source candidate `65a70d0fd4c40eb917bc1056875ee842e91c39c3`、tree `4bd3d120034e4e2ab9f7e81804312c8ad468fb9c`的完整尝试、独立补跑、精确官方CI、成本和资源结算。4676inputs，digest `bf3b6643d2e544b8489acae892ebccac335dee299ef40a4b4728730683cb47f3`；本机actual clean Fable为gen375，冻结前gen374不作本次产物。

原件见[压缩包](closed-65a-release.tar.gz)，SHA256 `c7b0b02f419af7b2ef95cd74640ddb0cc8f81bd448171278ba600abde4441726`。110源件60298450字节，含历史矩阵/inventory/SHA共113件60669977字节，tar10004452字节。[manifest](manifest.json)与[逐件读回](archive-readback-verification.json)核对所有成员SHA、源dev/ino/uid/mode/size/mtime稳定、各wrapper的原输入/日志/manifest SHA、CI38件封口与双ZIP CRC。旧8d0 tar SHA复核不变；4.56GB实体备份未纳入仓库。

- 统一原入口保并发2/静默30000ms/内部300000ms预算，实际format/check均Ran1/skipped0，step4.1s/3.8s；clean Fable41.4s。unit824/824、4971pass/0fail/127skip/388TODO，wall286.46s/test604.15s，exit1仅pending-proof；后三阶段not-run。入口337975.986166ms，不能因独立补跑成功改成统一通过。
- 独立integration入口315296.936917ms、exit1：44admit/43drain，active016/queued0，原300s截断，四计数unknown。distribution1/1为3pass/0fail/0skip/1TODO，仅pending；harness成功父行292pass/0fail，14.0s child/13.8s summary，case计划及skip/TODO无权威汇总为unknown。
- 同输入release Long Stroke35pass/0fail/0cancel/0skip/0TODO，entry19408.221792ms/TAP19033.963375ms，journal470/699、SSE2235/3351。真实package entry5012.586584ms/exit0，2073members/12504715bytes，tar SHA `9fd7eb8e844ea2aeb01c471ae71a7ef1e06c8d14bf93bfd2038ed43374858eec`；非TAP四计数unknown，不补造通过用例数。
- 六physical016父合跑tool300068.787584ms触及原300000ms、SIGKILL，6entered/5父终局；第6已有4个子ok但没有父判决，整体四计数unknown。仅未完成第6父另执行126021.170167ms、exit0，native5pass/0fail/0cancel/0skip/0TODO（1父+4子）；不覆盖原合跑失败或拼成完整integration通过。两次均原PER_TEST_TIMEOUT_MS=180000、无Node整文件CLI timeout。
- 精确[CI37783171051](https://github.com/dyx13/vibe-fs/actions/runs/37783171051)/job113331132750：format11.0s/check7.9s/cleanbuild83.4s通过，unit原300s截断539/824、2active participant-identity008/009、283queued，四计数unknown；integration/E2E/package not-run。CI38件11653378字节，artifact SHA `4812d9c90d3b80b4e2e55655734160162bde7b3e28ecc9c90aa39d4f9decec22`与published digest及CRC匹配。

local四wrapper前后commit/tree/digest/tools相同，独立阶段保持gen375同manifest。归档时已授权的4docs改动只属执行后的审计截面，不是测试输入变动；本矩阵不给最终docs-only SHA授本地release证书。最终文档提交的精确CI另按真实SHA核查，在交付报告给权威run，不作自引用递归提交。

资源证据仅限明确所有权：unit203/203monitor闭合、1232exactPID ESRCH；integration46exactPID ESRCH，quiet模式0monitor行不代表无实际工具。原six45/45工具monitor闭合、93exactPID ESRCH，parent6另10/10与23exactPID ESRCH，新FQP08d根及已完成ONNoc0根不存在。旧cqpeNB原inode16777231/159231739/uid501完整独立备份后atomicmove并精确删除，原根/quarantine不存在、139exactPID/PGID ESRCH、exactlsof空、无对应image/mount。20724常规文件4556623486字节、2038目录、331symlink逐件SHA/mode/owner/target和移后源再次读回一致；实体backup留TMP，仅14封口元数据原件归档。初始clean-only guard拒绝授权4docs dirty是资源动作前的前提诊断，不是产品失败。两caffeinate46710/82001另精确回收，原session exit143、PID ESRCH，不泛化全局资源。

CI inner3057 group acceptedtrue/9.134ms、201工具组drained/monitorclosed0；远端individual ESRCH、全部FS移除、完整verification digest和manifest原bytes未上传为unknown。537共同有效成本显示广泛wall/CPU增长，runner image/provisioner不同；这些混杂条件不证明具体环境唯一原因，也没有受控profile证明多余产品操作。最后活动文件不是根因；invalid/missing成本不算断言失败，不用旧8d0或local824覆盖新CI失败。保存的`unit-active-snapshot-readonly.invalid-nested.json`是已弃用的嵌套归因审计截面，不是父阶段判决；正式计数取最终exact parent汇总。

源码候选验收已执行，结论仍FAILED。K1-A六项与K1-F四叶仅有限完成；opening append换Root未正式证明、388TODO/skip、GAP及历史/稳定吞吐具体原因unknown保留。新证据不改写旧8d0、R18/R19/R20归档，不放宽预算、tier、权限或断言。
