# 上游语义更新处置表

固定版本、施工依赖和验收记录见[整合计划](UPSTREAM-SEMANTIC-MERGE-2026-10-19.md)。以下是本批处置决策和待实现义务，不是已迁移证明。正式产品合同仍由对应 WHAT 拥有。

2026-10-30：SD-16 保留本批 submodule 处置历史；用户现已确定两仓采用并列目录，替代接线和版本取得方式尚待实施，见[当前约定](BOARD.md#companion-relationship-20261030)。本次不改写历史验收，也不因目录决定而宣称依赖已经切换。

## 职责处置

| ID | 本地保证或旧职责 | 上游目标与已见差异 | 处置与实际落点 | 责任包 | 必需反例与剩余边界 |
|---|---|---|---|---|---|
| SD-01 | Journal statement 确切释放、业务封存、失败后显式 close 重试 | 上游原核心未吸收本地修复 | 保留在 wanxiangli/eventstore；保持 Unknown 不重发 | SM-02A | Node/Bun 真实 SQLite；读错后 finalize、COMMIT 丢回执、close 首次失败后重试 |
| SD-02 | Work/Journal/DurableWork 独立职责 | 上游新增接力门、Reopened、Reviewed 和围栏归属修正 | 接收上游 Work 规则，同时保留本地 Journal 保证 | SM-02A、SM-03 | 连续未评审接力零写、两种 sequence 重开、settled fence 精确与异载荷重放 |
| SD-03 | 完整 Capture、Spool、extent、Bun 背压 | 上游 JsRunLoop 直接 spawn、字符串片缓冲与 exit 观察不能代证 | 保留库能力并接新物理执行；呈现按新头尾合同 | SM-02A、SM-04 | 双路大输出/hash、暂停消费、逐路 EOF、采集故障；内存与呈现预算分开 |
| SD-04 | stdin 原字节、Bun flush、Worker 有序 EOF | 新 js.run send 是带换行的交互文本合同 | 内部原字节协议保留，模型 send 的文本语义明确投影，不混用 | SM-02A、SM-04 | 非周期大输入、延迟消费、断管、Unknown 不重发；send 换行独立测试 |
| SD-05 | Exited/Signaled、停止请求、故障与真实监管结果 | 新循环未携带独立原生 signal 事实 | 保留物理结果分型，适配新 outcome/watch/onExit | SM-04 | exit143 与 SIGTERM 不同；退出后输出未齐、超时与取消不覆盖已知终结 |
| SD-06 | PTY 持久预留、范围监管、重启认证、发布失败恢复 | 旧四工具退役，js.run pipe 交互不等于 PTY | 退出旧模型工具；保留实际内部消费者、旧实例收尾及所承诺监管能力 | SM-03、SM-04 | Reserve/Started/Ended 丢回执、Host 强杀、原实例认证、不重发创建/输入 |
| SD-07 | 二进制 Git 与真实存储错误 | Git 运行状态 transport 退役，process-execution-017 发生编号冲突 | 删除同步专属实现；通用 Git 原字节与结果保证迁到仍存消费者和正确条款 | SM-01、SM-03、SM-04 | 非零/signal/缺回执、NUL 树名、不可读不冒充不存在；不复活旧 sync |
| SD-08 | Trace 完整 Opening、MaterialConfirmed/TerminalBound、稳定原件身份 | 上游库 Trace 核心仍未吸收这些协议 | 保留原件 owner 和捕获修复；投影使用公开材料入口 | SM-02A、SM-05 | 大 Opening、晚到绑定、opaque metadata、旧 cut 不改、新进程冷恢复 |
| SD-09 | child WorkRecord、完成冻结、因果前沿 | 子工作正式输出改为 js.deliver 值 | 旧 child LWR 组合退出；仍存范围查询和完成表示保证逐消费者迁移 | SM-05 | 未 deliver 为 undelivered；并发晚材料不改已完成范围；不扩大为整个 GAP-111 已闭 |
| SD-10 | LWR_prev、父子 delta handoff、Blogger squash | 上游已退役对应路径 | 接收退役，不恢复旧组合；Trace、Chronicle 及现存历史消费者义务仍在 | SM-05 | 接力不注入合成 LWR；缺身份拒绝；原件不因摘要丢失 |
| SD-11 | 指导引用与物理原件隔离 | 新摘要与指导投影增加呈现层 | 保留捕获前不还原正文、引用原字和来源身份判断 | SM-05 | user 引用、跨代、合法物理编辑、summary 不变成原始事实 |
| SD-12 | GAP-085 包自身整个子树作用域校验 | grounding 算法转入 wanxiangli/grounding | 修复移入新 owner；主仓桥不保留第二算法 | SM-02B、SM-06 | 未来路径、整目录、字符类与自身 APPLIES-TO、真实插件及冷重放 |
| SD-13 | Predictor 私有身份、公开 office/reset/Fission 准入 | 新 identity 库及 Advisor 扩大角色接线面 | 保留私有/公开边界；Advisor 无工具且不创造调用者 authority | SM-02B、SM-06 | 公开 selector 拒绝 Predictor、同 cut 正控、reset 与旧原件恢复 |
| SD-14 | 持久失败预算、成功根绑定、同 Journal 恢复发送去重 | 新委派与恢复入口 | 保留已验 A/B1 并接实际入口；B2 不冒充已闭 | SM-06 | 同 live Journal 只发一次、成功根精确绑定、冷 OS 预算恢复；跨 OS 竞争单列 |
| SD-15 | 正式监督器对确切有界物理等待 | 上游改测试夹具与构建图 | 保留本地 native verdict、begin/end ACK 和最低 Node 回归，统一新夹具路径 | SM-02C、SM-07 | pre-import 挂起、有界 native/socket、跨通道次序；旧隔离 PTY 红保留 |
| SD-16 | vendor tarball 依赖与包外消费 | 上游 file:wanxiangli + 源码 submodule | 采用源码依赖并固定整合库 SHA；保留生产 bundle 和包外可消费保证 | SM-02C、SM-03 | 新 clone、缺依赖拒绝、离 cwd 导入、完整打包闭包；不读邻仓源码兜底 |
| SD-17 | .git/wanxiangshu 状态和 Git 同步 | .Herdchestra 唯一新根，旧根 leave-unread | 接收新合同；活动旧资源先正常收束，旧数据备查不清空 | SM-03、SM-07 | linked worktree、非 Git、submodule 隔离，旧坏数据不影响新根；无重复启动 |
| SD-18 | resources 参数保真、time/wait 窄能力 | 既有样本存在公开合同与产物差异 | 在实际接收前修正，删除已由库承接的旧算法；不复制 wrapper 掩盖差异 | SM-02B | 首尾空白/BOM、真实 horizon 模板、声明消费、冻结 deadline、取消隔离 |
| SD-19 | Advisor 专席与 view 增量 | 已有成员及进程内 seat/cursor，durable link 仍待做 | 接收已实现入口并记录进程寿命边界；不自动扩成持久专席工程 | SM-06 | 同进程复用、三条独立材料、失败不伪造 advice、无工具；不宣称重启复用 |
| SD-20 | Blogger/Chronicle 活跃链 | 整体废弃仅研究方案 | 保留当前活跃职责；仅接收已实现的 squash 等具体退役 | 全部包 | 不删除 Blogger 事件 codec，不清空 .Herdchestra，不把 Advisor 当替代记忆层 |

## 契约冲突与落地顺序

| ID | 冲突 | 本批方向 | 正式落地及验收 |
|---|---|---|---|
| SC-01 | process-execution-017 两侧不同命题和测试 | 上游退役时限政策可接收；本地 Git 同步专属部分随消费者退出，通用物理保证转入仍适用条款。编号与锚点不能机械覆盖 | SM-03/04 逐个旧测试核对真实调用者，定向套件证明保留保证；SM-01 只冻结处置 |
| SC-02 | context-compression-017 的 Y/LWR 用户原文豁免与 031 的 ANCHOR 无豁免替换 | 先区分 Y/LWR 前缀替换与模型显式 view；物理原件始终保真。Plan 的 U 保留还受 work-034 约束，不以通用 view 绕过 | SM-05 核对真实 pipeline 次序、角色门和原文输出，必要时同步收窄合同；未验前不宣称两者已经兼容 |
| SC-03 | work-008/034 声称通过 checkpoint 与 thenRemove 交棒，但 AnchorLedger 只存进程内摘要，ViewCheckpointCommitted 只含 session/call 身份 | durable checkpoint 不是摘要已耐久保存的证据；查明工具原件能否按确切调用恢复视图，禁止按重启后锚点编号猜测 | SM-05 冷恢复反例先行；按现行 owner 的持久材料与明确寿命合同修正，失败保持显式拒绝 |
| SC-04 | process 输出旧截尾与新 run 头尾呈现 | 保留底层完整采集与总编码预算；模型呈现采用新头尾语义 | SM-04 分开测原字节、每路计数、最终 wire、语言与 Host 窗口 |
| SC-05 | 生命周期规则与旧核内 reviewed/fence 载荷 | 上游规则与兼容拒绝合同为目标；已有本地原件与旧事实拒绝证据保留 | SM-02A 先库回放，SM-03 再真实 Host；不重写旧 append-only 字节 |
| SC-06 | 上游禁止任何tracked tgz与本地15份不可改写的历史红/绿取证归档冲突 | 运行依赖改源码，历史证据保留原名原字节；以固定清单/摘要限定取证例外，不开放新依赖归档 | SM-02C明确规则和实际Git索引检查，证明取证归档不进入生产闭包或安装依赖 |

## 初始证据及未决范围

SM-03已落点：SD-02/16/17的本批接线为READY；主仓gitlink固定库`f65e106`，状态归`.Herdchestra`，旧Git状态transport及工具注册退出，PTY实际监管/恢复/收尾保留。SC-01上游时限条款保留017；内部原字节与独立物理回执进入process-execution-018，旧Git对象/ref/树操作没有新消费者、不复活。SC-06扩展为库15份、主仓91份历史原件，清单、SHA-256、baseline Git blob三者一致。正式8文件32/0/0TODO仅证明计划列明范围；扩大选集的既有TODO与长编译监督问题仍保留，详见计划和原始日志。SM-04/05/06尚未验收。

SM-04本批范围READY：SD-03/04/05/06与SC-04接入真实NodeProcessHost，按停止请求、原生终结、范围关闭与输出完整性分别回执；完整原件采集与模型头尾预算分开。generation11正式13文件232/0/0TODO，含完整旧PTY生命周期。物理收尾失败不得经通用恢复提前结算work，完成认领后的结果兑现仍保留。发行、格式、真实Host切换及通用异步CPU隔离边界不据此关闭，SM-05/06继续施工。

SM-05本批范围READY：SD-08/09/10/11及SC-02/03的实际合同、反例和边界见计划。显式子终值不再读取旧child LWR；CommissionerRecord按用户单独明确授权删除，实际Attachment保留。Plan原文暖冷保真，ANCHOR寿命明确限定当前进程。generation15正式委派64/0/0skip/2TODO且完整排空；物理回归206/0/0TODO。独立编译及真实前缀Host34/0。旧TODO和全消费者GAP不因此销项。

SM-06本批范围READY：SD-12/13/14/19的实际注册入口与边界见计划及SM-06证据。generation17正式身份/Advisor23/0/0TODO、权限55/0/4TODO、恢复/grounding85/0/3TODO，均排空；grounding真实Host4/0。为保留已验旧身份cut，仅恢复确切MailboxSubscribed的只读历史解码，不恢复邮箱owner或写路径；三份旧原件摘要不变。Advisor不重放旧回答，席位/游标限当前进程。B2、完整Fission公式、Advisor晚到/并发和耐久归属均未关闭。

SM-07进入REVIEW：最终库05f6b5a已可获取，最低Node完整库559/0/7skip，16入口实际包外导入及声明编译通过。gen21主仓Node22/26完整物理正式集各206/0/0TODO；启用真实Git的25文件255/0/0skip/10TODO且完整排空。TODO仍使入口失败，完整发行未通过，旧活动资源阻止运行切换。最终构建、包摘要、提交和普通推送的各自事实见计划及SM-07证据；不将局部正控写成父CUT/GAP关闭，不执行Blogger全退役或旧状态重播。

2026-10-19，主仓与库工作区均干净；固定上游已在临时调查仓库取到。处置依据包括前一轮固定源码、WHAT、库历史与合并预演。尚未为本批运行产品验证，以上各条均不表示迁移完成。每包的新证据写入整合计划相应记录，并在本表追加实际去向；原始处置不因局部通过被改写成整项完成。
