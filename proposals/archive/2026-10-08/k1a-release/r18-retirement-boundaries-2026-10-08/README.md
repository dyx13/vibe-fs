# R18：退休中断所有权的有限证据

本目录保存 R18 已终局正式红绿、前提失败、诊断、真实 E2E 失败与只读边界审计；不证明完整 Long Stroke、最终全项目 release 或新提交 CI 通过。

原件保存在 [压缩包](finite-r18-retirement-boundaries.tar.gz)，SHA256 `9201b463c8d70fd083ea65c4c670ca59dbfdcdb7727fc57b50ab019973220fec`。共 45 件源文件、2824758 字节；包内含矩阵、源 inventory 和 SHA 清单共 48 件、2870663 字节。[manifest](manifest.json) 保源路径及 SHA，[回读验证](archive-readback-verification.json) 已逐件读取 tar 原 bytes 与 staging SHA 核对。

- 首正式旧接缝红：4pass/1fail/0cancel/0skip/1TODO、3446.278833ms，actual send 先于 interrupt。gen364/365 两次 8cancel 和首次 Fable 编译失败均保留，不由文件名 green 改写。
- gen366 fresh HumanRoot 晚到旧请求红：0pass/1fail/0cancel/0skip/0TODO、1576.741292ms；EMR-010 发生在 RelayProjection 之前。typed 修正后 gen367 完整008为9pass/0fail/0cancel/0skip/1TODO、6805.801416ms。gen368 独立两 fixture 定点为1pass/0fail/0cancel/0skip/0TODO、2264.682041ms；cold仅指各自没有既有 stop cache，不是进程重启重放。
- 文档输入变化导致一次 freshness 拒绝，82计划/0启动；不是断言红。gen369 相关82/82为389pass/1fail/12skip/45TODO、22.94s wall/36.33s test。旧002要求第二次 abort，违退休后禁止后补 session abort；按无新增abort/send、完整profile/claims不变及后继ProviderStarted保留修正。
- gen370 相关82/82为390pass/0fail/12skip/45TODO、23.36s wall/36.42s test，exit1仅pending-proof。它是scoped相关选集；skip/TODO不算通过，不升级为整个项目绿。内层进程组38823和46923的accepted=true仅保对应有限回收收据，完整filesystem/mount清理unknown。
- gen370 实际E2E：35tests、34pass/1fail/0cancel/0skip/0TODO，TAP18244.008166ms、outer19680.935458ms、exit1、无超时、输入前后相同。真正业务custom（含实际MCP连接/未知工具拒绝、same-model、purpose、capacity）已越过；整体仍因required `humanroot-manager-title.0` 和 `title.0` never reached失败，R19 title调查由主线另行认领，不删除声明或借custom通过宣称E2E绿。

实际输入为 dirty ddb0c28cfbfa35762b2115f9609c85a296d68d1a、gen370，digest `05f85c8af76b4a445561b4398149ae65b3a890a45d4a6d688a80f75a7b1d333b`；原outer JSON保完整before/after diff与build摘要，不能借给以后提交。monitor54966终局为ESRCH，精确scratch为`oc-e2e-l1vkqA`；本次归档未删除目录、未kill、未清理资源，完整资源状态unknown。

`causal/`保原ESpu2v实际main journal、Host日志、Host消息及选中事实，已与原evidence-index记录的SHA/bytes吻合；原因调查不会给未保存caller/provider请求补造证据。`diagnostics/`仅是新增session.deleted前提调查及no-delete诊断，不能替代正式绿。`audits/`保opening append期间Root换任未有正式证明，以及ddb本地/CI吞吐因果结论：没有证实新的简单runner修复，具体环境原因仍unknown，不改变原预算/并发或把旧CI借给新SHA。

完整命令/环境没有原收据的formal阶段保持unknown。最终freeze后的统一release、未运行独立阶段、精确新提交CI与完整资源矩阵仍待执行。该有限归档不闭合整体GAP/TODO或完整Host验收。
