# R20：readiness截止线的有限相关验收

本目录只接续R20有限正式红绿后的fresh gen374构建、完整006与harness。基于dirty8d0，input digest `72180a7177144886089a1846d3e7cdb1d9cb1a8607ec562d675fb93b4271b699`，两wrapper前后inputs/tools相同；不覆盖旧8d0完整FAILED归档，不代表新candidate全项目或完整Host验收。

原件见[压缩包](finite-r20-narrow.tar.gz)，SHA256 `37810dfb45e7913c6fb87ed3fb3f1351afbd0dcce32ebb0d7524956ff522de69`；9源件4790965字节，含matrix/inventory/SHA共12件4798635字节，tar1035493字节。[manifest](manifest.json)和[逐件回读](archive-readback-verification.json)核原bytes及source身份稳定。

- gen374 Fable构建成功，175surfaces/835modules，独立build wall/exit收据未保存为unknown。
- scoped006为1/1文件、63pass/0fail/1skip/0TODO，exit0，入口26026.472792ms（summary25.51s wall/25.84s test）。skip为实际installed Host invalid termination控制因integrationtier未启用；不能授完整Host。inner40495 accepted=true/16.943ms，monitor40469 ESRCH。
- harness完整292cases、292pass/0fail、exit0，入口13921.939792ms（summary13.7s），skip/TODO无summary字段保unknown。原真实重复unready HTTP requests>1及1000≤elapsed<2000保持，非扩预算或概率重跑。monitor42791 ESRCH。

资源收据只证精确owned monitor/group，filesystem/mount/全资源清理unknown；本归档未kill/delete资源。旧8d0 tar SHA复核未变，controlled红绿原件仍在其followup-r20，未重封。

下一步新candidate clean full release、独立后续、六physical016和精确CI仍pending；opening append换Root无正式证明、388TODO/skip及历史吞吐具体环境根因unknown保留。
