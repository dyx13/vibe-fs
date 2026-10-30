# 抽吸看板：唯一施工状态

盘点基线：`wanxiangshu@8f7f9be77`、`wanxiangli@46d9c07 / 0.5.2`，2026-10-15。**这是首次建板，除历史 CUT-01 外，尚未替任何人认领或宣称验收。** 后续改动由当轮协调者串行登记。

返回 [施工指南](README.md)；具体工作见 [职责卡](CARDS.md)。

<a id="companion-relationship-20261030"></a>
## 2026-10-30 项目关系与目录约定

本次仅修订文档：wanxiangli 是主程序的配套库，两仓协同演进；当前一个 npm 包包含多个可独立验证的模块。用户确定采用并列目录，现有主线 submodule／`file:wanxiangli` 接线尚待调整，版本取得方式未定。下一步须基于最新两仓提交盘点已使用入口的升级义务，再选择容易闭环的边缘职责；不为回避 Work 适配长期保留旧版本或预设分包发行。

调查起点是本地旧检出 `8db33b342`／`05f6b5a`，其中 vendor 0.6.12 和库 0.8.1 的观察仅对该快照成立。推送前 fetch 确认远端已到主仓 `540fe20e7`／库 `0ef8ad1`（0.66.1）；本轮文档基于该远端基线修订，保留后续实现和验收。没有修改源码、依赖、状态数据或任何历史 CUT/GAP 状态，没有运行产品测试或部署。现行分发实现见根 README，关系与术语见根 AGENTS.md。

<a id="upstream-merge-20261022"></a>
## 2026-10-22 upstream 合并计划

[本批计划](UPSTREAM-MERGE-2026-10-22.md)固定自有主仓 `87be7c641` / 库 `45849f5` 与上游主仓 `939ada1eb` / 库 `663ba59`。上游原拆分看板 45 DONE、1 REMOVED、1 DOING；HNI 仍在施工，当前 CI 运行中，前一提交停在格式门。三方预演主仓 182、库 39 个冲突路径。本次仅调查和制定计划，未合并产品源码、升级依赖或切换运行。

| 包 | 状态 | 证据与剩余边界 |
|---|---|---|
| M22-0 调查与计划 | DONE（计划） | 两仓 fetch、固定 SHA、CI 日志、静态契约核对及[三方预演](../../evidence/upstream-merge-plan-20261022/preflight.json)；未运行产品测试 |
| M22-1 基线与构建 | PLANNED | 影响闭包、冷构建及旧失败核对，不以自动合并代替验证 |
| M22-2 独立库 | PLANNED | 先合公共契约，保留精确数值、材料、时间与物理监督；公开包验证后固定版本 |
| M22-3 编程、交付与恢复 | PLANNED | reportMapping、voided、deliver/relay 与冷恢复成组处理 |
| M22-4 执行与宿主接线 | PLANNED | 新库消费者、Host 中立端口与 OpenCode 主流程；HNI 剩余范围如实保留 |
| M22-5 清旧与完整验收 | PLANNED | 唯一 owner、编译图、定向及同候选完整发行 |
| M22-6 源码交付 | PLANNED | 库先、主仓后，普通推送及精确 SHA CI；运行升级另记 |

本批状态不改变下方 MF、UM、CUT 等历史范围和验收结论。自有已验证修复的保留义务、各包依赖与停止条件均在本批计划中维护。

## 2026-10-21 已拆模块修正施工

**用户已于2026-10-21恢复施工。** 源码`764e6778e`、库`45849f5`/0.11.0；gen107完整本地发行通过，证据归档gen108后783编译产物原字节不变。候选`a6e3917ca`已以原SHA/force=false快进自有master及PR分支，完整Linux CI39539917238成功；PR #62描述已同步。原长测取消记录保留，新实验从零计时。当前入口见[恢复记录](MODULE-CONSTRUCTION-2026-10-21.md#resume-20261021)。

用户已授权按[本轮施工范围](MODULE-CONSTRUCTION-2026-10-21.md)持续施工至少五小时（全部计划提前完成除外），允许subagent与独立测试。固定主仓c78c9d53c、库a12ff4a，上游只读参照5880b824f/202a41ab；原运行目录保持原版。

| 包 | 状态 | 证据与剩余边界 |
|---|---|---|
| MF-00 | DONE（基线） | c78c9d53c完整CI成功；两仓输入、精确写集合和保留合同已登记 |
| MF-01 | DOING（物理隔离前置） | A的Closing真实红例已修，各runtime12+8全绿；B各16+7机制通过，class/toJSON兼容仍待后续。C最终源独立各16+2全绿、36PID回收，仍不等于生产接线；按用户流程优先要求D只存设计，边缘先记录。权限/ledger、完整sanity、启动与内存边界未闭合 |
| MF-02A | REVIEW（限定修复） | gen95目标集合38/0；严格S4夹具已证明持久准入；Host缺原子attempt中断，check到abort窗口仍在 |
| MF-02B | REVIEW（delivery/prefix/compression） | 库3db7b43及后续c4bc2ca已推；18入口公开包及Node/Bun各73+独立6项通过；gen102完整发行通过，旧TODO另列；projection后续分包审查 |
| MF-03A | REVIEW（续接恢复） | 新增6个原生write/fsync/unlink切点用例，本机gen106发行通过；Linux四位PID夹具已修，148adbb42完整远端CI通过，生产身份规范未放宽；不等于断电或完整GAP-151闭合 |
| MF-03B | REVIEW（限定长测） | 新Process/Supervision在Node22和Bun各满2h+2h通过，独立keeper各满4h，实际EOF/hash/TERM-KILL/Closed/Wait0通过；归档见本轮收尾。PTY2h交互/EOF经过，但暂停custodian后的超时recover占位失败，原exit1及唯一短例完整保留，按用户要求记P2不修。旧取消时长不累计；双路spool与Git大输出P2仍留档 |
| MF-04 | REVIEW（retention/防回退） | 库c4bc2ca/0.9.2已推，20入口包消费通过；数值ObservedAt反例已修，主仓9项011进gen101单元；021保住exact cut guard。legacy/series活动选材P2另记，多writer/GAP-151不销项 |
| MF-05 | REVIEW（已验子包） | permit/routing已接，库45849f5/0.11.0已推，22入口真包通过；gen107完整发行单元4537/0、集成725/0，旧skip/TODO单列；capacity/queue暂保留原owner，未证明收益且桥会缩窄Int64，其余authority/dispatch/session未认领闭合 |
| MF-06 | REVIEW（wait/Casebook/消融窄修） | gen102完整发行通过；消融严格集合22/0/1既有integration skip，4/4回收；独立真实ToolRegistry拒绝无效profile。hash碰撞及borrowed_surface边界P2另记，不为同构纯包增加适配 |

先前N1—N6和UM记录保留历史含义，发行阻断以最终通过CI的精确候选为准，不重复认领已修问题；历史TODO、异常收尾证据和全链缺口不自动销项。

<a id="upstream-view-delivery-20261020"></a>
## 2026-10-20 最新上游：view、交付与权限

[本批计划](UPSTREAM-VIEW-DELIVERY-MERGE-2026-10-20.md)固定自有 `f04553e5a` 与上游 `11052493b`。用户已授权逐包合并，root 在原计划独立工作树施工；前批接收和下方模块改进保持原状态，不重复认领 N1 的发行调查。

| 包 | 当前状态 | 证据与剩余边界 |
|---|---|---|
| UM-0 固定版本与合并计划 | DONE（计划） | fetch 与静态源码核对；新增 17 提交、386 路径；三方预演 162 冲突路径；未运行产品测试 |
| UM-1 Pair Hint 与保证书清理 | READY（限定） | gen43 构建/格式/静态通过；正式七文件175/0/2旧TODO，实际Host两文件109/0/1旧TODO，均排空回收；[原始证据](../../evidence/upstream-view-delivery-20261020/README.md)，完整发行及部署待后续 |
| UM-2 view/Anchor 与 Plan 编程面 | SOURCE_READY_LIMITED | 整合分支39b5dd04d；gen48核心165/0/1skip/1旧TODO，checkpoint集成23/0；证据um2-delivery.json；不算完整验收，不单独推master |
| UM-R 完整模型与旧功能退役 | SOURCE_READY_LIMITED | 固定11052493b真实合并，库fc75b85已推送，15入口及包外消费62/0/4skip；最终主仓证据见[收据](../../evidence/upstream-view-delivery-20261020/umr-delivery.json) |
| UM-3 Manager reviewOnly | SOURCE_READY_LIMITED | 原生真实Host逐次授权、零拒绝读取/启动、绑定方法、park与重开通过；保留本地受监管rg；正式监督结果见最终收据 |
| UM-4 交付见证与真实工作收束 | SOURCE_READY_LIMITED | 结算后入格、精确provider围栏、自然stop不完成、冷回收不补造交付、Advisor实际intent归属已落实；不接半成品reportMapping，最终收据列明持久/进程链证据 |
| UM-5 同候选验收与源码集成 | RESULTS_IN_RECEIPT | 定向验收、完整发行、普通推master的最终状态均以[收据](../../evidence/upstream-view-delivery-20261020/umr-delivery.json)为准；控制流风格债不改基线掩盖。未切换原运行目录，未部署 |
| UM-6 合并复核与 PR | RESULTS_IN_REVIEW_RECEIPT | 修复控制流、持久交付、冷续接和资源关闭阻断，迁移退役模型的验证夹具；各轮通过/失败证据、PR及剩余优先级见[复核收据](../../evidence/upstream-view-delivery-20261020/umr-review.json)。固定目标之外的新上游仍有冲突，最终预演与GitHub状态单列，不把本地check通过等同上游CI或可合并 |

用户已明确选择完整对齐上游新模型，包含旧功能退役；此前暂缓大范围退役的处置被替代。UM-2—UM-R—UM-4 作为一致候选进入 master，最终验收和推送结果以收据为准。旧 GAP 不一并清零；超过Int32的便捷数字cursor投影与既有发行门禁另记，64位持久cut仍验证。最终下载测试使用已有临时GNU wget，未增添产品依赖。原运行目录保持原版本。

<a id="module-improvement-20261020"></a>
## 2026-10-20 已拆模块改进

当前范围和依赖见[下一批计划](MODULE-IMPROVEMENT-2026-10-20.md)。以主仓 d69fa8ef3、库 05f6b5a 为起点；本次完成计划及源码同步，未实施下列产品修复。旧卡的历史 DONE/REVIEW、旧失败及 GAP 不因新计划而改变。

| 包 | 当前状态 | 证据与剩余边界 |
|---|---|---|
| N0 两仓同步与入口 | DONE（源码同步） | 独立库及子模块 HEAD/main/origin/main 均为05f6b5a；旧修复分支保留；gitlink不变，未部署 |
| N1 验证与发行阻断 | PLANNED（首包） | E03/E04；先定因，原5000ms静默门和旧TODO保留 |
| N2 物理模块与启动成本 | PLANNED | 依赖N1相关入口；E07有限取证，期限/取消/背压不退化 |
| N3 持久归属与真实退役 | PLANNED | 依赖N1/N2；承接E02的一个真实组合，不关闭整个PTY/GAP |
| N4 原件与独立进程历史读取 | PLANNED | 依赖N1；承接E01的一条现存消费链，不重建退役LWR |
| N5 rg窄范围易用性 | BACKLOG | 依赖N2；E06按实际需要选常用参数，其余继续拒绝 |
| N6 B2原子决策前提 | BACKLOG（先原型） | 依赖N3/N4持久边界；沿用freshness与成本合同，不直接接全历史重放 |

N1—N4为待认领顺序，本次不填写作者以外的复审完成记录。公共契约、构建图和两仓集成串行；独立调查可并行。计划中的每包证据在其对应段落追加，跨包和完整发行结论分别报告。

## 上游语义整合批次

2026-10-19 用户已授权按[整合计划](UPSTREAM-SEMANTIC-MERGE-2026-10-19.md)推进 SM-01—SM-07，具体处置见[语义处置表](UPSTREAM-SEMANTIC-DISPOSITION-2026-10-19.md)。owner：本 chat 的 root；SM-01已提交，SM-02A/B/C库候选05f6b5a限定验收LIB_READY，SM-03至SM-06限定范围READY，SM-07候选进入REVIEW；完整发行未通过，未切换运行。证据与未决范围只在整合计划更新。公共编辑面为两仓 manifest/锁/gitlink、构建图、实际插件接线与本看板，串行集成。原 CUT/GAP 的状态、失败和剩余范围继续保留；本批局部通过不销父项。Blogger 全退役不在范围。

2026-10-20 用户已授权下一批 M1—M6，唯一进度及证据索引为[增量接收计划](UPSTREAM-INTAKE-2026-10-20.md)，语义去向见[处置表](UPSTREAM-INTAKE-DISPOSITION-2026-10-20.md)。固定参照 upstream 0932e0c08，库保持 05f6b5a；小的边缘问题记录后继续，期限、取消与历史读取退化阻断交付，原 CUT/GAP 不自动改变。

## 列与流转

```text
BACKLOG → READY → DOING → LIB_READY → INTEGRATING → REVIEW → DONE
                        ↘        BLOCKED 作为原列上的阻塞标记        ↗
```

| 状态 | 进入条件 | 离开条件 |
|---|---|---|
| BACKLOG | 蓝图已列范围；尚未完成本卡准备 | 当前契约/调用者/反例/写集合及前置核对完毕，协调者改 READY |
| READY | 可认领；不等于已经分配 | 认领记录与公共编辑面预约已合入，才改 DOING |
| DOING | 一个 owner 正在准备/实现最小闭环 | 独立职责、产物和拆除测试通过，改 LIB_READY |
| LIB_READY | 基础库已证明独立，主仓该职责尚未全部切换 | 已取得被测精确包与接线预约，改 INTEGRATING |
| INTEGRATING | 在独立主仓候选上接线和清旧 | 受影响链与旧退出证据完整，进入 REVIEW |
| REVIEW | 本卡必要证据齐备，候选已固定，进入非作者审查 | 复核及最终主仓集成候选核验通过，满足下述清单后才改 DONE |
| DONE | 冻结范围的证据门禁通过；拆分/接收卡四类证据齐备，有主线提交 | 出现新反例关联修复卡并注明失效承诺；历史 DONE 不再代证当前完整职责 |
| DECISION | 抽取收益或产品去留尚需裁决 | 形成明确的抽取子范围后转 BACKLOG/READY，或记 RETAINED/REMOVED |
| OPTIONAL | 不在当前主线完成条件中 | 明确授权和真实前提具备后转 BACKLOG/READY |
| RETAINED / REMOVED | 已批准保留 / 已批准并完成删除 | 写清主线提交、理由及承接义务；两者均不记为“抽取成功” |

BLOCKED 不另吞掉原列：写 `DOING + BLOCKED`，保留 owner、阻塞原因、解除证据和下一检查人。受阻的公共预约主动释放或明确保留，不默认霸占。支持性卡 CUT-00、32、33、37 可不经过 LIB_READY，但仍须真实接线/使用与评审。

拆分/接收卡按[上游拆分交付清单](UPSTREAM-DELIVERY-CHECKLIST.md#done-gate)判定 DONE：真实消费者、公开产物、关键反例、旧职责退出缺一不可。相关失败、TODO/skip、未运行或失效证据不能计通过；不得在失败后自行缩小承诺或仅挂子卡就关闭父卡。事先定义的调查、取证与原型子卡按各自结果验收，不代替生产父项。本次只收紧流转规则，不批量改写历史卡片状态。

## 总看板

“前置”是本卡**完成主仓切换**所需的先行卡处置，不是要求所有前置完成才能只读调查，也不是要求本库 import 前置库。CUT-00 统一管准备；其他“—”仅表示没有额外前置。父卡出现 RETAINED 时，调用方要改成明确的既有协议，不能把“不抽”当成“新库已可用”。

| ID | 职责 | 泳道 | 当前列 | 切换前置 | Owner | Reviewer |
|---|---|---|---|---|---|---|
| CUT-00 | 两仓准备、差异裁决与并行开工 | 协作 | DONE | — | eng-cut00 | manager（历史登记；原 `cards/CUT-00.md` 当前缺失） |
| CUT-01 | 工作生命周期与原子日志接线 | 已交付 | DONE | — | 历史已合入 | 证据见收尾记录 |
| CUT-02 | 非 PTY 进程执行 | 物理 | DONE | CUT-00 | eng-cut02 | manager |
| CUT-03 | 原始轨迹与固定区间 | 上下文 | DONE | CUT-00 | eng-cut03 | manager |
| CUT-04 | 唯一资源归属与关闭 | 执行 | DONE | CUT-00, CUT-01 | eng-cut04 | manager |
| CUT-05 | 双语资源与包内定位 | 表达 | DONE | CUT-00 | — | 2026-10-15 主线提交 2f98049e5：wanxiangli 0.7.0 resources 模块合入，库侧 8 测试 + 主仓 provider-language 25 项回归全绿，证据链见 cards/CUT-05.md §10 |
| CUT-06 | WorkRecord 取材与视图 | 上下文 | BACKLOG | CUT-03 | — | — |
| CUT-07 | 参与者身份与执行绑定分离 | 权威 | LIB_READY | CUT-00 | — | 2026-10-15 库侧 identity 模块 24 测试全绿并随 0.7.0 发布；主仓切换按 eng-cut07 报告推迟至后续集成队列（主仓消费面与 Interaction 层进行中改动交叠，避免同窗冲突），证据链见 cards/CUT-07.md §10 |
| CUT-08 | 能力事实与双侧门禁 | 权威 | BACKLOG | CUT-07 | — | — |
| CUT-09 | 来源、逻辑根与关闭权威 | 权威 | BACKLOG | CUT-07 | — | — |
| CUT-10 | 模型路由与精确容量许可 | 执行 | BACKLOG | CUT-07 | — | — |
| CUT-11 | 派发认领与外部效果记账 | 执行 | BACKLOG | CUT-09, CUT-10 | — | — |
| CUT-12 | 会话关联与执行事实 | 执行 | BACKLOG | CUT-04, CUT-11 | — | — |
| CUT-13 | 委派、复用与结果认领 | 执行 | BACKLOG | CUT-06, CUT-12 | — | — |
| CUT-14 | 失败预算、恢复决议与结算 | 执行 | BACKLOG | CUT-10, CUT-11, CUT-12 | — | — |
| CUT-15 | 前缀世代与候选提交 | 上下文 | BACKLOG | CUT-03 | — | — |
| CUT-16 | 压缩覆盖与 checkpoint | 上下文 | BACKLOG | CUT-03, CUT-06, CUT-15 | — | — |
| CUT-17 | 请求投影与信息边界 | 表达 | BACKLOG | CUT-05, CUT-06, CUT-08, CUT-15, CUT-16 | — | — |
| CUT-18 | 规范事实编码与校验 | 存储 | DONE | CUT-00 | eng-cut18 | 2026-10-15 主线提交 2f98049e5：wanxiangli events 模块合入 0.7.0，库侧 34 测试 + durable-events 244 项回归全绿，证据链见 cards/CUT-18.md §10 |
| CUT-19 | 多 writer 存储与收敛 | 存储 | BACKLOG | CUT-18 | — | — |
| CUT-20 | PTY 与完整输出外存 | 物理 | BACKLOG | CUT-02, CUT-04 | — | — |
| CUT-21 | 显式时间与因果等待 | 物理 | DONE | CUT-00 | — | 2026-10-15 库侧 time/wait 模块随 0.8.0 发布（库 commit 8422617，全量 460 测试绿）；主仓 NodeTiming/Deadline/VirtualTiming/Wait Registry/CompletionMailbox 桥接切至 0.8.0，干净 HEAD worktree 验证 time-capability 24/0、causal-wait 52/0、subsystems OK；主仓共享工作树全量 build 因他人 Interaction 进行中改动阻断（非本卡引入），证据链见 cards/CUT-21.md §10 |
| CUT-22 | attention、concern 与邮箱归属 | 权威 | BACKLOG | CUT-09 | — | — |
| CUT-23 | Git 工作树、委任与集成 | 仓库 | BACKLOG | CUT-12, CUT-13 | — | — |
| CUT-24 | 文件读取、锚点与原子编辑 | 仓库 | DONE | CUT-00 | eng-cut24 | 2026-10-15 主线提交 2f98049e5：wanxiangli fs 模块合入 0.7.0（38 测试绿），repository-programming 158 项回归全绿，证据链见 cards/CUT-24.md §10 |
| CUT-25 | 受限 JS 编程面与执行组合 | 仓库 | BACKLOG | CUT-02, CUT-08, CUT-24 | — | — |
| CUT-26 | 需求发现与材料溯源 | 仓库 | DONE | CUT-00 | eng-cut26 | 2026-10-15 主线提交 2f98049e5：wanxiangli grounding 模块合入 0.7.0（13 测试绿）；主仓 requirement-grounding 残留 002/007 两项为 GAP.md 既有登记缺口（GAP-085，非本卡回归），证据链见 cards/CUT-26.md §10 |
| CUT-27 | Casebook / 知识复用去向 | 产品裁决 | DECISION | CUT-06, CUT-19, CUT-24 | — | — |
| CUT-28 | Fission 多 lane 执行 | 执行 | BACKLOG | CUT-03, CUT-10, CUT-12, CUT-13 | — | — |
| CUT-29 | Strength / 投机调查去向 | 产品裁决 | DECISION | CUT-06, CUT-10, CUT-13, CUT-19 | — | — |
| CUT-30 | Rulebook、指导与退化观察去向 | 产品裁决 | DECISION | CUT-03, CUT-05, CUT-16, CUT-19 | — | — |
| CUT-31 | Sphinx 与认识运行时去向 | 产品裁决 | DECISION | CUT-09, CUT-10, CUT-11, CUT-13, CUT-19 | — | — |
| CUT-32 | 可独立验证的执行设施 | 验证 | BACKLOG | CUT-00 | — | — |
| CUT-33 | 两仓构建、打包与发布闭环 | 验证 | BACKLOG | CUT-00 | — | — |
| CUT-34 | OpenCode 适配边界 | 宿主 | BACKLOG | CUT-11, CUT-12, CUT-17, CUT-25 | — | — |
| CUT-35 | 顶层组装与逐域恢复 | 宿主 | BACKLOG | CUT-13, CUT-14, CUT-16, CUT-17, CUT-19, CUT-22, CUT-23, CUT-27, CUT-28, CUT-29, CUT-30, CUT-31, CUT-34 | — | — |
| CUT-36 | 第二宿主真实 canary | 可选 | OPTIONAL | CUT-34, CUT-35 | — | — |
| CUT-37 | 消融、诊断与实测成本 | 验证 | BACKLOG | CUT-00 | — | — |
| CUT-38 | 全仓残余职责与终局交账 | 收尾 | BACKLOG | CUT-00, CUT-01, CUT-02, CUT-03, CUT-04, CUT-05, CUT-06, CUT-07, CUT-08, CUT-09, CUT-10, CUT-11, CUT-12, CUT-13, CUT-14, CUT-15, CUT-16, CUT-17, CUT-18, CUT-19, CUT-20, CUT-21, CUT-22, CUT-23, CUT-24, CUT-25, CUT-26, CUT-27, CUT-28, CUT-29, CUT-30, CUT-31, CUT-32, CUT-33, CUT-34, CUT-35, CUT-37 | — | — |

CUT-02/03/04 的 LIB_READY 仅指现有基础版；满足主仓更大契约所需的补足在各卡内执行。完成 CUT-00 和本卡接线准备后，可认领并直接进入 INTEGRATING；发现基础协议不成立时回退 DOING，不用历史测试成绩代替新需求。

<a id="source-audit-repairs"></a>
## 2026-10-15 源码复核后的关联修复

复核基线：主仓 `7d8feff03`、独立库 `46d9c07 / 0.5.2`。[问题报告与修复计划](SOURCE-AUDIT-2026-10-15.md) 已确认 CUT-02/03/04 仍有接线缺陷及未承接职责。上表 DONE 保留历史合入记录，**不再作为对应完整职责已闭合的证明**；后续依赖这些能力的卡须同时检查下列修复卡。CUT-01 的迁移边界未被推翻，新增的是独立套件的验证缺口。

源码报告轮次仅交付复核与计划。2026-10-15 后续已获用户授权开始修复；以下认领只覆盖明确工作包，整卡须分别取得库、生产接线及旧职责退出证据。进度与原始命令摘要见 [修复记录](REPAIR-PROGRESS-2026-10-15.md)。

| ID | 职责与范围 | 当前列 | 完成前置 | Owner | Reviewer |
|---|---|---|---|---|---|
| [CUT-01-R1](SOURCE-AUDIT-2026-10-15.md#repair-lifecycle) | Journal 测试关闭同步、构造锁竞争和 Process 平台证明 | DONE | 库完整候选与精确包 Node/Bun 验证通过；未测平台不扩张 | root；audit_process（复审） | 交叉复审 |
| [CUT-02-R1](SOURCE-AUDIT-2026-10-15.md#repair-process) | 无损输出、Draining 物理监管、相对 PATH；补 D-03 | DONE | 所选非 PTY 生产接线、192 项需求及实际安装包验收；原有 5 TODO 保留 | audit_process；audit_trace（监管）；root（集成） | 交叉复审 |
| [CUT-03-R1](SOURCE-AUDIT-2026-10-15.md#repair-trace) | 原件权威、完整 Opening、稳定 cut、Proxy 重入证明；补 D-02 | DOING | 原件接管及所列局部修复已验收；完整GAP-101/109/111由新R7、CUT-06-R5、R8/R9逐包承接。GAP-108入口范围已验，Bun差异另归CUT-17-R3，不借局部证明关闭父卡 | root；audit_trace（已交接） | 交叉复审 |
| [CUT-04-R1](SOURCE-AUDIT-2026-10-15.md#repair-ownership) | PTY 真实终结、早到回执、持久预留/恢复、统一 blocker | DOING | O-02/O-03/O-04 已修；R6-A/B/C 已完成所列实现及独立复审；原自然 Unknown 按用户决定单列待办，脱离控制终端及整体闭合未完 | root（剩余监管/恢复）；audit_ownership（已交接） | 交叉复审 |
| [CUT-01-R2](SOURCE-AUDIT-2026-10-15.md#second-review-fixes) | J-01：原生 statement 释放及 Unknown 后即时恢复写入 | DONE | 0.6.2 源码及精确包的非作者复验、真实 get 释放 oracle 和去 finalize 突变通过；新发现另记 R3，不覆盖 0.6.1 历史 | root | independent_journal_r2、independent_boundaries_r2 |
| [CUT-04-R2](SOURCE-AUDIT-2026-10-15.md#second-review-fixes) | O-05/06/07、B-01：收尾确认、共享端口隔离、永久准入关闭及依赖声明 | DONE | 非作者确认原限定范围成立；真实 focused 778 与 0.6.2 主仓包消费通过；收尾新反例记 R3，O-01/T-01 不销项 | root | independent_pty_r2、independent_boundaries_r2 |
| [CUT-01-R3](SOURCE-AUDIT-2026-10-15.md#independent-review-fixes) | J-02/E-03/E-04：显式关闭重试、真实追加竞争与 Bun 释放 oracle | DONE | 库 eef4825 / 0.6.2 已交付，320 项及非作者 30 项、25 轮竞争和七种突变通过；主仓 7d12e3462 固定包、隔离消费通过 | root | independent_journal_r2、independent_boundaries_r2 |
| [CUT-04-R3](SOURCE-AUDIT-2026-10-15.md#independent-review-fixes) | O-08/09/10：Drain 退订、Cancel Unknown 后实际回收、共享端口订阅寿命 | DONE | 主仓 7d12e3462 及 481 项归属链、193 项进程套件；最终候选 61 项由非作者复验，59 pass、2 TODO；O-01 活后代反例不计通过 | root | independent_pty_r2、independent_boundaries_r2 |
| [CUT-04-R4](SOURCE-AUDIT-2026-10-15.md#terminal-cancellation-review) | O-11：实际完全取消后拒绝旧 PTY 入口，保留 canonical DevOps 的可复用分支 | DONE | 主仓本提交；四项先红、实际 focused 778、485 项归属链及精确主包消费通过；非作者原反例零 Spawn、DevOps 连续复用和 12 个测试 PID 收尾通过 | root | independent_pty_r2 |
| [CUT-02-R5](REGRESSION-REVIEW-2026-10-16.md) | 全部修改双版复审；P-04 首次 Spool 创建失败清理 | DONE | 原 lock 历史构建、双版实跑、首次写失败先红及非作者清理通过；最终 196 项进程、format/check、主包隔离消费通过；主仓本提交 | root | regression_process_r5、regression_trace_journal_r5 |
| [CUT-04-R5](REGRESSION-REVIEW-2026-10-16.md) | O-13/O-14 修复引入的回退；O-12 原真实回调漏清理及冷无绑定防错 | DONE | 真实 fd、实际 terminal、held/retry/cancel/旧token及冷 guard 正反对照通过；492 项归属链、主包消费通过；主仓本提交，O-01 不销项 | root | regression_ownership_r5、regression_process_r5 |
| [CUT-02-R6-V](REMAINING-REPAIRS-2026-10-16.md) | Capture 的 Bun 错误事件注入夹具 | DONE | 库 b6984d9；Node Process/Supervision 69/69、Bun Capture/Supervision 19/19；生产包未变，Bun 另四项不销项 | root | 本轮自检；未另作非作者复审 |
| [CUT-04-R6-A](PTY-SUPERVISION-2026-10-16.md) | O-01 活监管实例与控制终端会话内后代终结 | DONE | 本提交修正独立复审发现的两项 P1 和一项 P2；709 项相关测试 676 pass / 0 fail / 5 skip / 28 TODO；clean 509 精确包 Bun/OpenCode 消费、Linux 物理口九项通过；仅关闭声明的会话范围，脱组及 R6-B/C 不销项 | root | pty_scope_review_r8、pty_integration_review_r8、pty_host_evidence_review_r8 |
| [CUT-04-R6-B](PTY-RUN-ADMISSION-2026-10-16.md) | O-01 跨进程每轮 PTY 准入 | DONE | 本提交修正两项新增回退和既有 Load void 遗漏；clean 523，1175 项相关测试 1112 pass / 0 fail / 16 skip / 47 TODO；非作者反例、真实双进程 CAS/Bun PTY、精确包隔离消费通过；R6-C/O-01 整体未闭合 | root | r6b_admission_review、r6b_unknown_review、r6b_requirements_review |
| [CUT-04-R6-C](PTY-RESTART-RECOVERY-2026-10-16.md#r12-u1-分层取证与本轮验收2026-10-17) | O-01 跨重启物理接管 | DONE | 已确认的发布缺陷已修；1232 项相关回归 0 普通失败，精确包 Node/Bun/OpenCode 消费通过，三名非作者复查完成。按用户决定验收本轮范围；R12-U1 单列待办，O-01/GAP-133 整体不销项 | root | r6c_protocol_review、r6c_ownership_review、r6c_observation_review |
| [CUT-04-R12-U1](PTY-RESTART-RECOVERY-2026-10-16.md#r12-u1-分层取证与本轮验收2026-10-17) | 原自然 Unknown 追踪 | BACKLOG | 用户决定暂存；原 441 行没有内层现场，仍未唯一归因。已保全分层证据并实演 Unknown 捕获；有新现场或用户重启此包时再处理，不把未复现写成已修复 | root（后续） | 待重新认领 |
| [CUT-03-R6](TRACE-ORIGINALS-2026-10-17.md) | T-01 原件捕获、冷恢复、消费者切换和旧路径退出 | DONE | 原 T-01 N3–N6、复审候选 N7–N9 及既有 T01-04/05/06 均已修并分开记录。库0.6.4、2270项0普通失败、两项integration、非作者Node/Bun及精确包仓外强杀恢复均通过；R12-U1、GAP-101 不销项，未部署用户Host | root | t01r_originals；capture/recovery 初审后参与修正 |
| [CUT-02-R6-A](PROCESS-CONTRACT-2026-10-18.md) | GAP-091及Process契约统一、独立编译与消费者切换 | DONE | f0bfa9bbb四文件纯闭包、真实Git/PTY消费者及隐藏入口退出已验；Node128文件897pass/0普通fail/25skip/72TODO、Bun72pass、真实Host及2e500包通过。非作者独立编译2/2、实际Node/Bun冷接管与无owner拒绝3/3；正式包装器既有缺口归CUT-00-R1，不关闭整个Process | root | review_process_a |
| [CUT-02-R6-B](PROCESS-WIRE-BUDGET-2026-10-18.md) | GAP-092 完整wire总预算与执行前拒绝 | DONE | 双语最小预算、实际TOML与Host窗口、BOM和预取消已验；129文件911pass/0普通fail/15skip/29TODO，正式96pass/1skip，真实Host及独立编译通过。b1f7804固定包Node/Bun各46/46、128MiB五次、PTY124/124，非作者双语各18观察；R6-D/E旧P1单列，随本原子提交交付 | root | review_guidance_r3、review_process_a |
| [CUT-02-R6-E](PROCESS-CANCELLATION-2026-10-18.md) | P1：真实取消监听及排队准入 | DONE | 真实await监听、局部typed取消及许可交接零启动已修；正式113pass/1skip、10/10/owned accepted，Bun79/79、真实Host1/1。4d594fd精确包双运行时各61+4通过、128MiB五次、PTY124/124；非作者各8观察通过，R6-D/R12不销项，随本原子提交交付 | root | review_guidance_r3 |
| [CUT-02-R6-D](PROCESS-TERMINATION-2026-10-18.md) | P1：保留原生exit与signal区别 | DONE | D1/D2声明的文本与binary原生终结事实已验收，随本主线提交交付；scope/capture、PTY持久结算、R12及完整Process不随D关闭 | root | review_process_a（方案）、review_guidance_r3（原型）；D1/D2复审见子项 |
| [CUT-02-R6-D1](PROCESS-TERMINATION-D1-2026-10-18.md) | 目标终结事实及单次执行/文本 Git 消费者 | DONE | 54c7a9266后发现的stop假完整回退已修；652红、660物理反例和663字节承接均长期保留。最终663相关229/0/0TODO、12/12、owned accepted；replay路径修正，原652收据不覆盖，不销R12 | root | d1_review_host、d1_review_git、d1_review_tests |
| [CUT-02-R6-D2](PROCESS-BINARY-D2-2026-10-18.md) | 二进制 GitRawRunner 的原生事实 | DONE | 随本提交交付，库8bb1021/0.6.12已正常推原分支；663原017 Node正式及Bun原生/非作者各19/0、独立闭包20/0、Host27/0，真实消费者/四cut/冷读/精确包通过，旧ODB及raw CAS退出。661/662尾17红经EOF余量确证iterator漏交后修正，受控事件不冒称OS读错。存储52/0另3TODO与P2性能代价保留 | root；d1_review_host（原型/包验收） | d1_review_git、d1_review_tests（非作者）；host消费者验收不作算法非作者 |
| [CUT-02-R6-C](PROCESS-RUNTIME-2026-10-18.md) | Node/Bun环境、参数和stdin的真实回执边界 | REVIEW | 环境/argv/stdin及第二跳实现与非作者复审通过；0.6.6放大原有提前清组竞态，继续由R7-A修到0.6.7。最终82项双运行时、347库项、900主仓普通项及精确消费者通过；完整隔离025仍有失败未归因，验收不销项；Bun背压与正式监督另列 | root | review_process_a、review_bun_adapter_c |
| [CUT-02-R7](REMAINING-REPAIRS-2026-10-16.md#bun-capture) | P1：输出真实性与Bun上游背压 | REVIEW | R7-A/B实现及非作者限定范围验收通过；当前0.6.8主包完整PTY124/124，但旧6cc27首轮隔离失败仍未归因，父项不以新绿覆盖旧失败；不延伸完整RSS或脱组监管保证 | root | 三名非作者分界复核 |
| [CUT-02-R7-A](PROCESS-OUTPUT-EXTENT-2026-10-18.md) | P1：逐路extent阻止自然清组截断 | REVIEW | 实现及非作者复审通过：0.6.7双运行时各82/82、精确包26项及128MiB矩阵12/12。后续0.6.8保留extent并通过独立包及完整PTY；旧6cc27首轮隔离失败未归因，验收仍不销项，R7-B所列范围另包DONE | root | review_process_a、review_bun_adapter_c |
| [CUT-02-R7-B](PROCESS-BACKPRESSURE-2026-10-18.md) | P1：Bun实际上游背压及有界输出 | DONE | 库df14f48/0.6.8正常推送；354项349pass/5skip、Bun物理88/88。三名非作者核对源码、精确安装、32流/取消/fd复用、四场双路128MiB与Linux双运行时各14场景。主包0d60/2076文件，正式76pass/1skip、真实Host、五次128MiB及完整PTY124/124；work011五fail修前同现另记。远端自有生成目录删除待工具人工确认，未部署Host | root | review_bun_adapter_c、review_process_a、review_guidance_r3 |
| [CUT-00-R1](FINITE-PHYSICAL-WAIT-R1-2026-10-19.md) | P2：正式监督器对确切有界物理等待的契约 | DONE | 689七文件321/0及最低Node22.13完整006独立84/0；后续修正本代理引入的endACK/下一begin跨通道竞争，702原七文件323/0/0TODO，Node26/真实22.13受控native与socket非作者对照通过。原红与夹具误判保留，不关R2/R3/R12 | root | d1_review_git、d1_review_tests、d1_review_host |
| [CUT-00-R2](REMAINING-REPAIRS-2026-10-16.md#bun-verification) | P2：Bun真实verdict与完整运行监督 | READY | 非作者反例证明新run-bun可在import阶段无界挂起，已删除入口及正式声明；Bun原生业务通过仅作物理证据。下一包接真实verdict、文件完成/汇总和owned收尾，不解析pass文本或伪心跳 | root（计划） | review_guidance_r3确认边界 |
| [CUT-00-R3](REMAINING-REPAIRS-2026-10-16.md#isolated-pty-evidence) | P2：旧精确包隔离 PTY 失败的因果取证 | READY | 固定 6cc27 包、夹具和运行环境，保存完整内层输出/状态/收尾，比较原生与正式入口及前序组合；后续同包、新包 124/124 不解释首轮失败。预设有限取证矩阵，无新因果证据则保留未知与 C/R7-A REVIEW，不重开 R12-U1 | root（计划） | 待复核 |
| [CUT-00-R4](WORK-REVIEW-FIXTURE-2026-10-18.md) | P2：work011评审夹具缺part身份、篡改历史及SDK封装错误 | DONE | 旧/新包及工作区原样五fail同现；三处输入前提已修，保留完整历史及真实派发次序，Work159pass/1TODO、非作者最终shared011为5pass/1TODO。错误filter归因及作者提前取gate回退已撤回修正，不放松生产绑定或原件校验 | root | review_process_a |
| [CUT-06-R1](WORK-RECORD-RANGES-2026-10-17.md) | GAP-111 跨 invocation frame 的 bounded 取材与 coverage | DONE | 本原子提交修正范围与正式陈述，1199项0普通失败；Node/Bun核心28pass/0fail/2TODO，非作者源/消费者/独立新进程恢复及精确包外Node/Bun均通过，库0.6.4未变。只关闭本包范围，不关闭整项GAP-111/109 | root | gap111_review |
| [CUT-06-R3](WORK-RECORD-RANGES-2026-10-17.md#independent-review) | GAP-111 独立复审：部分摘要及formal-only Terminal去重 | DONE | e7新回退与输入已有的formal-only重复均已修；最终核心Node/Bun各56pass/0fail/2TODO，相关1227项0普通失败；非作者570范围/冷进程/消费者及eeaa8b精确包外14材料组、真实Sync/Fork和新进程冷读通过，随本原子提交交付；R2不销项 | root | g111r_ranges、g111r_consumers、g111r_contracts |
| [CUT-06-R2](WORK-RECORD-HISTORY-2026-10-17.md) | GAP-111 已完成范围的历史表示稳定性 | DONE | Terminal时原子固定WorkRecord摘要引用，真实Sync/Fork使用确切完成终点；Node/Bun核心69pass/1TODO、相关1239项0普通失败，非作者源/暖冷行为及旧精确包blob升级消费通过。575精确包df0ccd隔离默认入口和同包非作者Node/Bun实际消费者均通过，随本原子提交交付；历史关联缺失不自动迁移，R12-U1暂缓 | root | g111r_contracts |
| [CUT-06-R4](WORK-RECORD-HISTORY-2026-10-17.md#r4-review) | R2 独立复审：并发事实下的完成因果边界 | DONE | 并发晚摘要/原件、多head父边及完成歧义已修；1311项0普通失败、Bun核心91pass/1TODO、真实checkpoint/消费者/冷恢复、旧R2包升级及229980精确包独立Node/Bun消费通过。三名非作者复验完成，撤回的五个越界白盒用例不计正式验收；GAP-111/109、旧缺边历史与R12-U1边界保留，随本原子提交交付 | root | r2_freeze_review、r2_replay_review、r2_consumer_review |
| [CUT-17-R1](GUIDANCE-INGRESS-2026-10-17.md) | GAP-108 指导呈现回流的真实 Host 路径核查 | DONE | 正常Host原件隔离成立，原直接capture TODO改为保真负控和实际Host证明；引用误删P1已修。1350项相关回归0普通失败、实际Host网络/持久/冷读、Trace正反编译及f047精确包隔离Node/Bun消费通过；旧错历史及完整CUT-17不销项，R12-U1暂缓，随本原子提交交付 | root | root自审；未做非作者复审 |
| [CUT-17-R2](GUIDANCE-INGRESS-2026-10-17.md#r2-review) | R1 独立复审：来源身份、Host 链路与验收归因 | DONE | 四项R1回退已修，捕获前还原删除，原件/呈现职责分开；O1撤为review误判。600核心Node/Bun25pass/1skip、真实Host1/1、1363项0普通失败及2e0f精确包非作者Node/Bun各12组暖/新OS冷读通过；三名非作者复验完成，旧错历史/完整CUT-17不销项，R12-U1暂缓，随本原子提交交付 | root | g108r_provenance、g108r_host、g108r_evidence |
| [CUT-17-R3](GUIDANCE-BUN-LIFETIME-2026-10-18.md) | Bun指导整文件挂起的原因与生命周期修正 | DONE | 缺模拟终态累积16枚Retiring与启动HOME前提已修；同包20/5超时→25/0，单槽先红转绿。Bun原生26pass/1skip、Node相关265pass、正式runner100/100、实际Host及2e0f包通过。非作者确认fixture边界；发现新无界入口后已删除，正式Bun监督归CUT-00-R2 | root | review_guidance_r3 |
| [GAP-085](GROUNDING-SCOPE-GAP085-2026-10-19.md) | 规则包整个自子树的作用域校验 | DONE | 候选667：整目录及未来路径逐规则校验，首]字符类泄漏修正；14文件128/0/0TODO、owned accepted，三名非作者Node/Bun规则、真实Plugin读写及冷重放通过；2076文件同一、D2和库字节未改。按本卡范围随本提交交付，完整WHAT002异常包名旧边界另账 | root | d1_review_git、d1_review_tests、d1_review_host |
| [GAP-159](PREDICTOR-OFFICE-GAP159-2026-10-19.md) | 显式 office 配置与真实 Fission 准入 | DONE | 候选680：Predictor私有身份/隐藏模型槽/公开准入一致；修正670空reset与673旧后cut释放早期故障两项本轮回退。35文件327/0普通fail/15既存TODO，owned accepted；三名非作者类型、Node/Bun真实入口与旧原件冷读通过，同事件cut正控保留。不关闭完整GAP-158或其余TODO | root | d1_review_git、d1_review_tests、d1_review_host |
| [GAP-140](REMAINING-REPAIRS-2026-10-16.md#gap140) | 持久失败预算、耗尽与重放裁决 | DOING | A已验；[B1已验](SINGLE-JOURNAL-RECOVERY-G140-B1-2026-10-19.md)同live Journal non-idle send2→1/接管，700独立22项、706长期JSON边界及永久6项绿。710相邻148文件655pass/0普通fail+6skip95TODO、收尾通过；021改真实旧原件读取，历史类型解码TODO保留。B2跨OS facts2且不同身份count1冲突已确认，须先freshness/真实writer原型；普通冷Workflow缺Host-stop仍待验 | root | A/B1非作者通过；B2原子命令及durable跨OS发送权未闭 |
| [CUT-03-R7](REMAINING-REPAIRS-2026-10-16.md#trace-opening) | Opening 完整原件范围与 checkpoint 语义 | READY | 对账现行 WHAT；注册 Host 捕获→提交→新 OS 冷读逐字和范围一致，缺证/冲突拒绝，旧 cut 保持；不包办下游视图 | root（计划） | 待非作者复审 |
| [CUT-06-R5](REMAINING-REPAIRS-2026-10-16.md#trace-consumers) | inspect、Resume、Casebook 与 Fork/Join 范围消费 | BACKLOG | R7 后；逐个真实入口验证同 invocation、完成表示及暖冷一致，保留范围隔离与完成冻结，不借单一 materializer 代证全部消费者 | root（计划） | 待非作者复审 |
| [CUT-03-R8](REMAINING-REPAIRS-2026-10-16.md#trace-compaction) | 实际 compaction/reanchor、coverage 与呈现 | BACKLOG | R5 后；真实 Host 覆盖旧 epoch、失败 append、原文、持续追平、provider wire 与冷恢复，不恢复捕获前正文还原；Fission 另验 | root（计划） | 待非作者复审 |
| [CUT-03-R9](REMAINING-REPAIRS-2026-10-16.md#trace-fission) | 真实 Fission 汇聚与唯一完成前沿 | BACKLOG | R8 后；实际 lane 乱序/迟到/失败/取消/N−1 takeover、唯一完成和新 OS 冷读，Trace 不复制 lane 状态机，不关闭其他 GAP-158 条款 | root（计划） | 待非作者复审 |
| [CUT-04-R7](REMAINING-REPAIRS-2026-10-16.md#bootstrap-recovery) | 实际Bootstrap恢复、准入和持久终结 | READY | 可独立调查；两个真正Host的Reserve/物理启动/Started/Ended崩溃矩阵、认证与留账、命令不重发，协议切换有原实例退役步骤 | root（计划） | 待非作者复审 |
| [CUT-04-R8](REMAINING-REPAIRS-2026-10-16.md#detached-processes) | 主动脱组监管父项 | BACKLOG | 拆成原型 A 与生产 B；A 的肯定结论不算生产完成，否定结论保留能力缺口；父项只按实际声明平台和接线证据关闭 | root（计划） | 待非作者复审 |
| [CUT-04-R8-A](REMAINING-REPAIRS-2026-10-16.md#detached-prototype) | 主动脱组可行性原型 | BACKLOG | R7 身份/恢复协议固定后，先定平台、权限和有限矩阵；真实 setsid、leader 先退、忽略 TERM、Host 强杀及无关进程隔离。交付肯定或否定结论，不改生产 | root（计划） | 待非作者复审 |
| [CUT-04-R8-B](REMAINING-REPAIRS-2026-10-16.md#detached-integration) | 已证实机制的生产接线 | BACKLOG | 依 A 肯定结论及冻结承诺；真实 Host、关闭中崩溃、认证接管、发布失败及持久清账，精确包和非作者复验；旧路径退出，在途实例有处置 | root（条件满足后） | 待非作者复审 |
| [CUT-04-R9](REMAINING-REPAIRS-2026-10-16.md#platform-capacity) | 声明平台、运行时与有限容量实测 | BACKLOG | 先冻结版本、并发/输出规模及资源阈值，再验证精确包/PTY/恢复/背压/收尾；RSS 与队列分开。脱组仅在 R8-B 已交付的平台纳入，不承诺未测平台或无限规模 | root（计划） | 待复审 |

2026-10-18 复盘修订：依据[修复原因与改进措施](LOCAL-FIRST-FOUR-MODULES-REPORT-2026-10-18.md#repair-retrospective)，已完成项退出待施工顺序；每包明确范围、关键反例、验收及排除项。下一 P1 为 D1，再接 D2；验证设施与旧失败取证独立，Trace 按 R7→R5→R8→R9，Bootstrap 另包，脱组分原型/接线两包。C/R7-A 保持 REVIEW，R12-U1 继续暂缓。本次只更新文档，不新增验收结论、不合并 upstream。[当前唯一施工计划](REMAINING-REPAIRS-2026-10-16.md#current-plan)。

2026-10-19施工交付：D1停止完整性及D2 binary Git声明范围随本提交验收，候选663、库8bb1021/0.6.12。原661/662尾17红、EOF因果证据、修复回退及review误判分开长期记录；独立闭包20/0、原017两Host19/0、D1相关229/0、Host27/0，存储3TODO与P2延迟代价保留。D1/D2退出待施工顺序，其余P1按现行计划继续；R12-U1仍暂缓。

2026-10-18 上游样本评估：CUT-05 resources 与 CUT-21 time/wait 的[只读接收评估](UPSTREAM-INTAKE-ASSESSMENT-2026-10-18.md)完成，两项接收均暂缓。resources 需修参数裁剪并验证实际资源入口；time/wait 需对齐公开合同、能力边界和旧算法归属后再接线。原卡施工列及当前 16 包状态不变；未认领新的生产修改，未合并 upstream。[候选范围、反例、验收与预算](REMAINING-REPAIRS-2026-10-16.md#intake-candidates)已补入现行计划。

## 波次：什么时候拉哪张卡

波次不是日期排期，也不是整波完成才能开始下一波。以表中实际前置和编辑面为准，满足一张就拉一张。

| 波次 | 优先拉取 | 允许提前并行的工作 | 不要做 |
|---|---|---|---|
| W0 | CUT-00；复核 CUT-01 | 各 owner 只读盘点及准备反例 | 宣称所有草稿接口已定 |
| W1 | CUT-02、03、04；独立的 05、07、18、21、24、26 | 32、33、37 可调查和小步增强；27、29、30、31 可做产品盘点 | 九人同时改 ToolRegistry 或全仓 format |
| W2 | CUT-06、08、09、10、15、19、20、25 | 具体 Host 能力 canary 可只读准备 | 因未迁完 EventStore 阻塞无关内存库 |
| W3 | CUT-11、16、22；前置就绪后的12 | 请求/结果契约评审 | 两份状态账双写，以“以后同步”兜底 |
| W4 | CUT-13、14、17、23、28；已裁决的27、29、30、31 | 对应 Host 接线和最终闭包拆除准备 | 把产品裁决卡当成自动删库许可 |
| W5 | CUT-34、35，接入已就绪的真实个体 | 经明确授权的36先做 canary | 先建设万能宿主框架再找使用方 |
| W6 | CUT-38 | 未关闭项拆成明确后续责任 | 把“暂留”写成“全部抽干” |

## 冲突矩阵

| 编辑面 | 常见相邻卡 | 处理 |
|---|---|---|
| Process/Surface、进程请求与 Spool | 02、20、21、25 | 拆分实际文件；共同入口由当轮集成者串行改 |
| Trace、Prefix、Blogger、WorkRecord、消息投影 | 03、06、15、16、17、28、30 | 区间与覆盖协议先约定；捕获、压缩、投影各自一个状态 owner |
| Authority、Dispatch、ChatExecution、ModelRouting | 07—14、22、28、34 | 精确身份和结算次序共同评审；不互相补字段绕过协议 |
| Composition/Durable、Journal、EventStore | 11、12、18、19、27、29—31、35 | 一次迁移一个明确事实族；生产写入口只有一个 |
| ToolRegistry、ToolRuntimeScope、插件 Hook | 02、04—17、23—31、34、35 | 业务库可并行；接线一次只一张候选 |
| Repository/Programming、JsSandbox、能力生成 | 08、24、25、26、29 | 文件行为与权限判定分开；共享类/声明先冻结 |
| 两仓包元数据、编译清单、资源清单、vendor | 所有卡 | 唯一发布/集成负责人，禁止同时改锁与 tarball |

<a id="shared-surfaces"></a>
## 公共编辑面预约

初始没有预约。认领正文用 [模板](TEMPLATES.md#claim)，协调者在下表填实际值；“截止”写明确交接事件，不按离线时长自动剥夺。

| 编辑面或精确路径 | 持有卡 | 当前修改者 | 起始 base | 释放条件 | 状态 |
|---|---|---|---|---|---|
| `src/Wanxiangshu/Process/{ProcessRunner,NodeProcessHost,NodeProcessWait,Surface}.fs(.fsi)` | `CUT-02` | `eng-cut02` | `b322c180b` | `CUT-02 完成进程执行接线与 process-execution 测试回归`（2026-10-15 devops 构建/check/process-execution/009/025 全绿，主线提交 62dbebc5d，证据见 cards/CUT-02.md） | `已释放` |
| `src/Wanxiangshu/Context/Trace/*.fs(.fsi)` | `CUT-03` | `eng-cut03` | `b322c180b` | `CUT-03 完成确认轨迹子范围接线与 semantic-trace 测试回归`（2026-10-15 全套验证全绿含裁决后 005 重入段，主线提交 62dbebc5d，证据见 cards/CUT-03.md） | `已释放` |
| `src/Wanxiangshu/Execution/Session/Ownership.fs(.fsi), src/Wanxiangshu/Mission/Lifecycle/DurableWorkHost.fs(.fsi)` | `CUT-04` | `eng-cut04` | `b322c180b` | `CUT-04 完成资源归属接线与 session/work 测试回归`（2026-10-15 删除清单闭合与 work 009/044、025 全绿，主线提交 62dbebc5d，证据见 cards/CUT-04.md） | `已释放` |
| `Mission/WorkRecord/{Materialize,Surface}.fs(.fsi)`、`Context/Companion/Blogger/Projection.fs` 的范围说明、`Persistence/Journal/Surface.fs(.fsi)` 的 scoped 借用、`Execution/Delegation/{SyncDelegate/Surface,Fork/OpenCode/ToolSurface}.fs(.fsi)` 的观察接缝、work-record WHAT/004/010/011/辅助夹具及本包文档 | `CUT-06-R1` | root | `53cba28de` | 实际跨界反例、冷恢复和同步/异步消费者验收及非作者、精确包复验均通过，随本原子提交交付；库 10bbb32 / 0.6.4 未改 | `已释放` |
| `Mission/WorkRecord/Materialize.fs`、work-record 004/010 测试及 GAP/本包进度文档 | `CUT-06-R3` | root | `e7a150937` | 两项Terminal重复反例、1227项相关需求、非作者最终候选及eeaa精确包外复验完成，随本原子提交交付；其他代理只读 | `已释放` |
| `Mission/WorkRecord/{CompletionProjection,Materialize}.fs(.fsi)`、`Composition/Durable/{Projection,DomainFamilyBridge}.fs(.fsi)`、SyncDelegate/Runtime、Fork/Host/{Runtime,RunLifecycle}、Fork/OpenCode/ToolSurface、Journal/Surface的既有ContextReanchored解码、对应owner编译清单、work-record WHAT/004/010及本包证据文档 | `CUT-06-R2` | root | `2ec1a5400` | 完成表示、确切终点、真实消费者和独立冷恢复、1239项相关回归及精确包非作者验收完成，随本原子提交交付；库0.6.4不变 | `已释放` |
| EventStore 的因果成员契约/Integrator、各规则签名、Journal writer/接线、Trace/WorkRecord 完成投影及相关规范/门禁/证据 | `CUT-06-R4` | root；r2_consumer_review 仅 work-record/004 末尾与独占测试 helper | `49b64879c` | 正式新增22项、1311项相关需求、三名非作者和229980精确包隔离消费通过，随本原子提交交付；越界白盒测试已撤回，库0.6.4不变 | `已释放` |
| `OpenCode/Host/PairProgrammingThoughtTransform.fs`、`Context/Trace/Materialization.fs(.fsi)`、prefix-stability/014及独占辅助夹具、旧grounding-007/Host-032与共享Plugin夹具、相关契约与证据 | `CUT-17-R1` | root | `2aaaf6077` | 真实Host网络/原件/引用/冷读、1350项相关回归及f047精确包隔离消费完成；归因与边界同步，随本原子提交交付，库0.6.4未改 | `已释放` |
| `src/Wanxiangshu/Foundation/CanonicalJson.fs(.fsi), src/Wanxiangshu/Persistence/EventStore/CanonicalEventCodec.fs(.fsi)` | `CUT-18` | `eng-cut18` | `62dbebc5d`（认领时未运行 git，base 以 DevOps 核实为准） | `CUT-18 完成 wanxiangli/events 0.6.0 验证、vendor tarball 落位与 durable-events 测试回归`（2026-10-15 随 0.7.0 主线提交 2f98049e5 合入，durable-events 244 项全绿，证据见 cards/CUT-18.md） | `已释放` |
| `src/Wanxiangshu/Process/{Deadline,NodeTiming,VirtualTiming}.fs(.fsi), src/Wanxiangshu/Execution/Session/Wait/{Registry,CompletionMailbox}.fs(.fsi)` | `CUT-21` | `devops`（受委派集成） | `2f98049e5` | `CUT-21 完成 wanxiangli 0.8.0 time/wait 发布与主仓桥接切换`（2026-10-15 库 commit 8422617，干净 HEAD worktree 验证全绿后主线合入） | `已释放` |

## 两仓集成队列

一个候选发布到主仓后，再拉下一项。库实现 PR 可以多个待审；同名版本发布和主仓锁更新不能并发。填写完整性摘要，不以文件名作唯一身份。

| 排位 | 卡 | 库 commit / version / tarball SHA-256 | 主仓 base / candidate | Reviewer | 剩余门禁或历史例外 | 状态 |
|---|---|---|---|---|---|---|
| 1 | CUT-02 | — | 4be1c4105 | manager | GAP-092（仅 015 预声明 todo，无新增门禁） | 已合入 |
| 2 | CUT-03 | — | 042ae616a | manager | 无新增门禁（GAP-101 均为预声明 todo） | 已合入 |
| 3 | CUT-04 | — | 6b5b71cc7 | manager | 无新增门禁（GAP-133 均为预声明 todo） | 已合入 |
| 4 | CUT-05/07/18/24/26 | wanxiangli 8422617 之前的主线形态（0.7.0 tarball） | 2f98049e5 | manager | GAP-085（requirement-grounding 002/007 为 GAP.md 既有登记缺口，非本批回归） | 已合入 |
| 5 | CUT-07 主仓切换 | 库侧已随 0.7.0 发布（identity 24 测试绿） | 待定（下一集成窗口） | manager | 主仓消费面与 Interaction 层进行中改动交叠，推迟至 Interaction 改动合入后串行执行 | 排队中 |
| 6 | CUT-21 | wanxiangli 8422617 / 0.8.0 | 2f98049e5 之上的本轮主仓提交 | manager | 主仓共享工作树全量 build 因他人 Interaction 改动中间态阻断；本卡验证已在干净 HEAD worktree 完成（time-capability 24/0、causal-wait 52/0、subsystems OK） | 已验证待合入 |

## 边界修订与产品裁决登记

这里只记协作决策与来源，不建立第二份业务规则。实际语义须落实到原 WHAT 或新库局部规则。详细差异见 [COVERAGE.md](COVERAGE.md#draft-conflicts)。

| 决策号 | 影响卡 | 待判问题 | 当前处置 | 决策/证据 |
|---|---|---|---|---|
| D-01 | 07、09、11 | 草稿中的未知来源回退 human 与现行权威证据冲突 | 保留现行拒绝/明确未知；开工时裁定精确接口 | 待认领；不得先删权威闭包 |
| D-02 | 03、06、15、16、28 | 单观察者 Trace 与并发捕获、推理、retry 排除、Fission 合流、Opening 范围不完全等价 | Opening、固定cut及原件接管按CUT-03-R6验收；来源/身份/canonical覆盖的独立复审与旧历史边界已补。Fission/Invocation完整产品链的GAP仍保留 | [本批范围与下一包](REPAIR-PROGRESS-2026-10-15.md) |
| D-03 | 02、20、21 | 基础 pipe 留尾不等于主仓硬期限、完整外存及 PTY | 默认基础版保持留尾；显式 Capture/监管承接所选非 PTY 完整采集和同组期限/取消。PTY、脱组后代、宿主崩溃恢复不扩成已承接 | [精确包与真实反例](REPAIR-PROGRESS-2026-10-15.md) |
| D-04 | 18、19 | 单流 SQLite CAS 与多 writer 合法分叉不是同一承诺 | 两种协议分开，不用前者替代后者 | 待 CUT-18/19 |
| D-05 | 27、29、30、31 | 新库草稿“不再建”与仍生效的产品功能冲突 | 默认暂留并维护；抽取/删除需逐卡裁决 | 待认领；不是删除批准 |
| D-06 | 32、33、38 | 相对主线净改进与完整发布验收 | 合并可用净改进准入，验证结果仍原样报告 | 用户 2026-10-14T23:59:13Z 授权；[比较记录](../lifecycle-cutover-closeout.md) |
| D-07 | 00、34、36 | 库规则仍写旧仓修改待授权、宿主名尚未确认 | 本计划不偷偷覆盖规则；各任务按当前授权更新过时范围，第二宿主先明确对象 | 历史登记称 CUT-00 已落盘，但 `cards/CUT-00.md` 当前缺失；主仓与 wanxiangli 按当前授权推进，CUT-36 保持 OPTIONAL |

## 更新纪律

认领/换人/换 base/变更协议/发布包/合入主线/关闭旧 owner 时更新看板。单卡实现日志不直接写进总表，只链接本卡证据。没有真实日志的计数留空，不写零；没有人接手的字段保持 `—`。

看板是协作状态的唯一来源；CARDS 是范围，COVERAGE 是义务索引，GAP 是证明债务，它们不维护竞争的“完成率”。
