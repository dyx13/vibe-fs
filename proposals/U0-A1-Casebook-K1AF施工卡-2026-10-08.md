# K1-A / K1-F：工作区别名与结算后再次准入

当前状态：本卡Fetch/四叶再入、R18/R19及R20保持有限完成，不重做Fetch或忙碌resume。干净source candidate `65a70d0fd4c4`的原预算全项目验收已执行，结论FAILED，实际clean Fable为gen375。本机unit824/824、4971pass/0fail/127skip/388TODO仅pending；独立integration43/44原300s截断，四计数unknown；harness292pass/0fail、skip/TODO unknown，真实E2E35pass/0fail/0skip/0TODO及实际package通过。六physical合跑6entered/5父终局后原300s截断，仅未完成第6父另有限5pass/0fail/0skip/0TODO，不拼全量绿。精确CI37783171051仍539/824、2active/283queued原300s截断，四计数unknown；最后活动文件不定位根因。详见[65a矩阵](K1A与全项目release验收-2026-10-08.md#r2165a冻结输入的完整执行与剩余截断)。旧8d0失败不覆盖，最终docs-only提交CI按实际SHA单独核查并由交付链接给出，不借65a；opening append换Root未正式证明、skip/TODO、GAP-160及稳定吞吐/具体环境原因unknown继续保留。下方仅历史。

## 2026-10-08 review 接手状态

本轮完整验收另发现并处理R8–R12：原Work/多Road oracle、Host实际lifeline回收、Accepted显式续行与stale cut、SDK归档夹具准备和Join指导平面。K1-A/K1-F的有限闭环不因这些局部通过升级为GAP-160全闭合；最终完整输入、全阶段及CI仍须逐项登记于[验收记录](K1A与全项目release验收-2026-10-08.md)。

历史阶段R13–R17：正式停止边界、事件/HTTP身份、Root计数和协议/MCP权限oracle修复按各自输入有限结算，不重复本卡Fetch修复。R17正式红gen361为32pass/1fail/1skip、绿gen362为43pass/0fail/1skip，均0TODO；gen363真实E2E在更早Assessment gte2实际1失败，34pass/1fail/0skip/0TODO、输入相同。当时交错根因未定、实际MCP custom未运行且状态unknown，由R18/R19后续正式证据接续；全项目和新提交CI仍未闭合。详见[验收记录R17](K1A与全项目release验收-2026-10-08.md#r17mcp连接与未知工具权限边界有限修复主流程新失败未闭合)，不把历史待验重复施工或将局部绿扩成GAP-160。

历史阶段R18（gen363–368）：独立处理真实Change/transform退休中断竞态，正式008首红4pass/1fail/0cancel/0skip/1TODO证明send绕过interrupt，gen366另红0pass/1fail/0cancel/0skip/0TODO证明旧root缺lease在RelayProjection之前触发EMR-010。exact-cut一次stop、串行after、唯一Manager opening及退休请求准入前拦截/Root核对修正后，typed Fable构建gen367成功；完整008为9pass/0fail/0cancel/0skip/1TODO、6805.801416ms、exit0，仅该文件有限绿。gen364/365两次8cancel和先前编译失败均保留；同cache二窗口定点1pass不授cold guard证明，gen368另以独立Plugin/session、各自空stop cache的两fixture正式定点1pass/0fail/0cancel/0skip/0TODO、2264.682041ms通过。相关套件和实际E2E的本阶段待验由gen370/372接续；opening append期间Root换任仍无正式证明，最终全项目与CI仍pending。不将TMP诊断算正式绿，也不重复忙碌resume 0e949fb7b或本卡Fetch施工，见[验收记录R18](K1A与全项目release验收-2026-10-08.md#r18change与transform共享退休中断边界施工中尚未验收)。

本轮已认领 K1-A 和本卡 K1-F 的成功、普通异常、fatal 返回/抛错四叶再入证明。基线 `c05ee5a22`，起始工作区干净；`0e949fb7b` 忙碌 resume 隔离已在 HEAD 中，不重复施工。

正式旧实现 gen316：011 完成 1/1 文件，11 pass / 4 fail / 0 skip / 1 TODO。三种路径别名及别名异 Store 绑定明确失败；相同路径、真实 linked worktree 负控和原结算控制通过。009 完成 1/1，3 pass / 1 fail / 0 skip / 1 TODO，唯一失败为受控 realpath EIO 未拒绝绑定。原件见[本轮验收记录](K1A与全项目release验收-2026-10-08.md)。review 的 `/tmp` 脚本仅作来源，未替代正式测试。

首版修复 gen317 的009/011为19 pass / 0 fail / 0 skip / 2 TODO，2/2排空、资源检查accepted=true；仍退出1，仅pending policy，不能宣称整个包验收。随后把同key再入改为前后完全相同原始路径，并明确先绑定物理根/schema再acquire Store，避免路径解析错误新增引用。此时尚待执行的相关套件已由下述gen319收据接续；各次完整release另按实际输入登记。下面原施工步骤只保留为历史验收清单。

K1-A/K1-F四叶局部闭环：gen319完整knowledge-reuse/EFP+JS002/verification017/Host026为33/33、221 pass / 0 fail / 0 skip / 19 TODO，exit1仅pending，outer349 accepted=true/18.785ms。前轮gen318的唯一015失败是临时目录别名导致夹具未拦截物理路径，修正hook目标后完整复验，未弱化只读一次及双次diff断言。显式两阶段绑定的生成JS已核先spec绑定再acquire，仅作发射调序辅助证据；没有新增registry或重绑Store。Unknown再入、双waiter throwing、GAP-160整体继续保留。历史222输入本地全仓unit824/824、4914/0/126skip/388TODO仅pending；同提交官方CI截断627/824。该次完整release失败及其R4/R5后续修复、MSBuild未知原因均保留于验收记录，不将这项Fetch有限闭环扩大为整个GAP或Host验收。

已封口的历史完整输入8d3：本地unit824/824、4919/0/126skip/388TODO及精确官方CI824/824、4918/0/127skip/388TODO，均仅pending；不能据此关闭整个GAP或稳定吞吐。独立integration30/44截断、内层termination失败，四计数unknown；仅该输入的独立package成功。12文件、六物理body的各次有限补验和13项只读正负控均分别登记，取消/未执行不算通过，详见本轮验收记录第四次输入。此后R8–R12有限修复与R13后继失败分别记账，最终输入必须另有全阶段和精确CI收据；不借8d3结果，不重复K1-A产品修复与四叶再入。

下列从`b85533202`接续的步骤保留为原验收清单，状态由上面的正式执行收据覆盖。K1-U/V/W已有限完成，不重复；完整只读审计另存archive。

## K1-A原根因与已验收清单（历史，勿重复施工）

原实现调用链：PluginHost保存input.directory原字符串，CasebookTools把它传给Fetch；RuntimePath.gitCommonDir成功路径虽realpath，但只用于Store acquire。FetchTool原字典键的workspaceRoot取未经归一的字符串，同键才检查实际Store引用，两个别名因此成为两个key。当前键仍是`(workspaceRoot,shelfmark)`，但workspaceRoot已由工具绑定时捕获的物理根提供。Store身份和工作区身份分开，不能直接拿git common-dir代替工作区：linked worktree共享common-dir但文件不同。

以下是开工前的验收步骤；gen316业务红、gen319有限闭环及剩余边界已在上文登记：

1. 复用011双required owner/同actual Store/原Bookkeeper SendPrompt barrier；只建一次共享端口，保原Case、completion baseline、真实subject和marker，不能用两writer冒充同Store。
2. 三个反例分别absolute与字面`${directory}/.`、真实relative、实际symlink。两输入字符串不同但realpath/marker/subject字节相同。`path.join(dir,'.')`已归一，不能当反例；不全局chdir。
3. version-C后首工具进入原barrier，先核create1/program0/append0，再启动别名工具、立即装allSettled，放行同一barrier。不等旧实现未必给出的第二barrier，不sleep或概率重跑。
4. 两调用必须同一实际维护结果，create/program各1、Refresh1/Access1、零incident；核精确事件和双基线。以实际失败为业务红，不预填旧实现多几次调用。
5. 同包保真实linked worktree负控：common-dir相同、实际根不同、明确共用同Store。一个根变更Refresh停在barrier，另一个根无差异须独立Access并返回旧正文；放行后首根完成Refresh，不能误借flight/答案。仅操作fixture临时Git仓库。
6. finally先放barrier、等两工作settle，再reset/dispose/删自有symlink和目录；保原失败及清理错误。
7. 只在Fetch绑定边界捕获一次物理workspace root，key、marker、diff共用；relative构造时固定。不加owner入key、不让异Store并行、不用common-dir代替root、不造registry。
8. realpath失败先核装配合同：CasebookTools在marker未启用时不建工具，tryBuildSpecs失败降为空列表。补未启用/不存在root及I/O故障控制，保knowledge009零索引/零事件中立；不静默fallback再谎称别名闭合，不改全仓PluginHost输入合同。Surface构造异常和公开schema降级分别记账。
9. 手工改动后只用Fable入口；正式完整knowledge-reuse及相关EFP/JS002/需求017，保同key异Store拒绝、跨workspace隔离和已有门禁正控。准确列pass/fail/skip/TODO，保存原红/最终输入，原子提交正常推送。

实际改动是FetchTool.fs/fsi的两阶段绑定、Casebook/OpenCode/Tools.fs在acquire前绑定、FetchSurface.fs内部接线，以及正式009/011/015回归；公开FetchSurface签名不变，没有新增Surface、owner或registry。case-insensitive filesystem、绑定后symlink retarget或目录移动/替换、Git失败fallback、跨进程single-flight与installed Host保留。

## K1-F四叶有限完成与剩余边界

原finally Remove已存在，未新增生产清理机制。开工时结算后同key再入未证；现由011成功、普通observer异常、fatal callback返回/抛错四叶补齐：前后使用完全相同raw root、shelfmark及实际Store，第二调用真正追加新的合法Access并独立cold replay。已有保护通过，不虚构新产品红。005普通成功顺序执行可能改变shelfmark，不能代替这四叶；Unknown再次准入与双waiter throwing仍未验收。

下列保留原验收清单；其中committed malformed Access的owner返回/throw两叶已用`createAppendPayloadStoreAt(base,1,observe)`完成，只首Append坏，后续仍同Store转发合法请求，不造新Store或重发旧cut。第4、5项仍是独立剩余工作。

1. 原Case/version-B无差异，固定workspace/shelfmark/shared Store；首Fetch实际Access cut，核badfact/cut-tail/Prepared/incident，以及callback返回后的原incident或throw后的原sentinel。
2. 首调用settle后才同key/同Store第二Fetch，可用新explicit owner；须真正追加合法Access、新eventId/零Cuts、零Bookkeeper/Refresh、返回原fresh正文。observer增加一次，第二owner零callback，首callback仍一次。
3. Q&A、completion/maintenance baseline及前像前缀保留；Access可推进accessOrder，不能断言整个Case不变或所有canonical bytes不变，合法Access必须追加。
4. Unknown emptyCuts再入另叶：CurrentCommit fault每次PrepareLive都会发生，并非once；第二Access可能再Unknown，cold须沿真实Refresh+Access重放，不能套V单Refresh oracle。先不混此两叶包。
5. 双waiter＋throwing callback另补两叶同sentinel/实际settlement/cold；不能把W/U双waiter returning与013单waiter throwing相加销项。finally清理不等于资源物理关闭。

每包同步状态、正式红绿或已有保护、manifest/原件SHA及剩余边界。原K1-A→K1-F四叶顺序已有限完成，不重复认领；若续做Unknown再入或双waiter throwing须各自取证。D0-R按自身接缝卡，J3另完整窗口。
