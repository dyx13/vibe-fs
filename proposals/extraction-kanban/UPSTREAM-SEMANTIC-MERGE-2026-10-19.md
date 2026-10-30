# 上游语义更新整合计划

2026-10-30 说明：本文件保留 2026-10-19 批次的方案、实际接线与验收历史，不重写已完成的 submodule 证据。用户现已确定两仓采用并列目录；新接线与版本取得方式尚待落实，见[当前约定](BOARD.md#companion-relationship-20261030)。本文“工作包”是施工范围，不是独立 npm 包；库更新与主体适配协同推进。下面的旧版本及阶段状态不能代替后续批次的现状。

2026-10-19。用户已授权按本计划逐包执行：先落盘计划和语义处置表，再按依赖推进；每包记录验收证据与剩余边界，保住本地已验证保证。本次不执行 Blogger/Chronicle 全退役，不清零历史 GAP，不清空运行数据。

## 固定输入

| 对象 | 本地输入 | 上游输入 | 共同祖先 |
|---|---|---|---|
| 主仓 | `b436802758c25b5c33e4a99f5349f57c812005b8` | `2f23502c60bac0abed11ebdd39d8555cc1d90457` | `7d8feff030adfdeae511bdc0d8bb77f3c00b2a1f` |
| wanxiangli | `8bb1021fc3519b0846e70af3319be9822d4b6b80`；主仓实际依赖 `vendor/wanxiangli-0.6.12.tgz` | 主仓固定的 `71c155f3a2d5e9d559beea602ce11694904c4e5f`，包版本 0.8.0 | `46d9c072af50389d069709e847d5772af3ec160a` |

初始两个工作区均干净。主仓分别独有 65/53 个提交，库分别独有 20/9 个提交。临时仓库 `git merge-tree --write-tree --name-only` 预演主仓得到 76 个冲突路径：48 源码、19 requirements、6 resources、3 其他；冲突类型为 51 content、24 modify/delete、1 add/add。这只是文本合并证据，不代表语义兼容或生产验收。

后续发现上游新提交时先登记为下一批，不在施工中漂移以上输入。原始调查依据为[前四模块差异](LOCAL-UPSTREAM-FIRST-FOUR-DIFF-2026-10-18.md)、[resources 和 time/wait 接收评估](UPSTREAM-INTAKE-ASSESSMENT-2026-10-18.md)、[现行看板](BOARD.md)。本批唯一语义处置索引为[处置表](UPSTREAM-SEMANTIC-DISPOSITION-2026-10-19.md)。

## 目标与施工纪律

目标是接收固定上游已经实现的产品模型，同时保住仍适用的原件、物理执行、资源归属、持久化及授权保证。旧工具或流程退役只解除其专属产品义务，不自动证明相邻保证已经迁入。

每包先读现行与目标 WHAT，确定条款归属及反例，再调整测试、实现和调用者，最后删除旧路径。生产源码逐处手工编辑，不用自动改写程序解决冲突。公共类型先定契约，再改调用方。锁文件、gitlink、构建图、插件接线和看板由同一施工者串行处理。

整合使用独立分支，保留双方提交历史；不 rebase 已发布 master，不 force push。库先交付可取得的固定 SHA，主仓再引用。每个可独立验收的小包可以提交；只有完成本批相关门禁的候选才能合入主仓 master。提交、推送、验证和部署分别记录。

本计划是施工记录，不替代 WHAT。处置表中的目标决策必须在对应包落入正式合同及测试后才成为已实现行为。

## 工作包与依赖

| 包 | 范围 | 依赖 | 状态 | 验收记录 |
|---|---|---|---|---|
| SM-01 | 固定版本、语义处置、条款与测试锚点冲突、基线证据 | — | DONE | 68a6785f1 已落盘；20项职责和6项冲突均有目标、责任包与反例 |
| SM-02A | 库历史整合、Journal/Process/Supervision/Trace 本地保证与上游 Work 规则并存 | SM-01 | LIB_READY | 152719c；核心 Node315/0/6skip，Bun273/0，独立编译及真实包外组合43/0；未非作者复审 |
| SM-02B | 新增模块接收：resources、time/wait、grounding、identity/events/fs 的实际边界 | SM-02A | LIB_READY | 七模块Node/Bun各191/0；独立编译及包外20/0；静止候选重包3/0，主仓未接线 |
| SM-02C | 库构建、声明、隔离安装、可获取提交；正式测试监督器保留 | SM-02B | LIB_READY | 最终05f6b5a：最低Node完整566项559pass/7skip/0fail/0TODO；16入口包外消费及声明编译通过；未非作者复审 |
| SM-03 | 主仓依赖、源码 submodule、状态根、生命周期、退役 Git 状态同步 | SM-02C | READY | gen2构建与8文件正式32/0/0TODO通过；扩大选集无普通失败，既有TODO、长编译监督及最终发行/真实Host边界保留 |
| SM-04 | 新 js.run 接入物理执行、输出预算、取消、资源归属和真实收尾 | SM-03 | READY | gen11正式13文件232/0/0TODO；完整PTY集通过，发行/真实Host与格式门禁仍归SM-07 |
| SM-05 | Trace/ANCHOR/前缀/显式子工作终值与现存历史消费者 | SM-03 | READY | gen15正式委派64/0/0skip/2TODO且排空；原件/前缀原生0普通失败，独立编译与真实Host34/0；旧GAP保留 |
| SM-06 | 身份和双侧门禁、失败预算与发送去重、结构化委派、Advisor/horizon | SM-04、SM-05 | READY | gen17正式身份/Advisor23/0/0TODO；权限55/0/4TODO、恢复/grounding85/0/3TODO，均排空；真实Host4/0，旧边界保留 |
| SM-07 | 同一候选的相关回归、真实 Host、包外消费及切换准备 | SM-06 | REVIEW | gen21：Node22/26物理各206/0；启用实际Git的25文件255/0/0skip/10TODO；完整发行未通过，未切换运行 |

SM-04 与 SM-05 的独立调查和测试可交错推进，公共接线串行。每次更新表中状态时同步下面的证据和剩余边界；不另建与 BOARD 竞争的状态表，BOARD 只链接本批工作包。

### SM-01 契约与基线

- 区分上游已经实现、仅有研究方案、当前进程实现和尚未有冷恢复保证的部分。
- `process-execution-017` 两侧编号冲突：本地二进制 Git 与上游退役时限政策分别定归属，禁止覆盖同编号测试掩盖义务丢失。
- 核对 `context-compression-017/031` 用户原文保留与 ANCHOR 替换的边界，以及 `work-008/034` 所述视图交棒与进程内摘要之间的恢复关系。
- 保留现行正式监督器、测试入口及精确输入；已有 TODO/skip/未归因失败单列。
- 完成条件：每项冲突有目标处置、责任包、反例和明确剩余范围；不要求此包实现全部合同。

### SM-02 库整合与接收

- 保留本地 statement 释放、业务封存/物理 close 分离、完整 Capture、Supervision、逐路 extent、Bun 背压、stdin 有序排空及原件协议。
- 接收上游连续未评审接力门、Reopened 配对、三字段 Reviewed 与 fence-owner 重放冲突；不以本地旧 Work 整文件替换。
- 修正既有接收反例：resources 模板与注入值裁剪顺序；time/wait 声明与实际导出、冻结 deadline 输入、窄能力与实现归属。其他新模块按实际调用者与风险核对。
- GAP-085 算法移到新的 grounding owner；Predictor 私有身份与公开角色集合的处理进入身份接收边界。
- 验收：受影响库套件、Node/Bun 物理用例、独立编译及实际安装包消费；检查 `.d.ts`、ESM、监督增强可拆除、声明依赖完整。真实 Host 证明留给后续包。

### SM-03 主仓接线与持久状态

- 固定包含双方修复的库 gitlink，采用 `file:wanxiangli`，让全新 clone 能取得和构建同一源码；检查生产包 bundle 闭包。
- 统一 `.Herdchestra` 的状态定位，Work/Ownership SQLite 与事件流各有唯一 owner；验证 linked worktree 共用状态根而工作 root 仍区分。
- 接收生命周期 replay-before-gate、开立闭集、派发窗口及终态结算修复。
- 删除运行数据 Git transport、hooks、ProcessGitRawStore/WriterStreamSync 等退役路径。保留通用 Git 消费者所需的二进制输入和真实物理结果。
- 验收：durable-events、durable-convergence、work、crash-reconciliation、change-integration、distribution 相关条款及实际冷读；新根不触碰旧运行目录。

### SM-04 物理执行

- 新 js.run 保留 sanity/next/watch、前后台、send、waitFor、park、timeout 协议；物理能力显式注入，不恢复旧 ExecutorTool 注册。
- 原始字节采集、真实目标终结、停止请求、监管范围结束、输出呈现分别保留。按新产品头尾规则呈现，同时满足完整 UTF-8 结果及真实 Host 窗口预算。
- 验证预取消、排队取消、启动握手、stdin EOF、signal 与高退出码、双路大输出、背压、spool 故障及后代收尾。pipe 交互不代证 PTY。
- 跨 Host 恢复按实际承诺单列证据；旧持久资源不能因工具改名直接清账。

### SM-05 历史与视图

- 物理捕获先于摘要/指导呈现；保留大 Opening、晚到原件、稳定身份、冻结 cut 与冷恢复，不把 summary 当原始事实。
- 子工作改读 js.deliver 终值，撤掉旧 DelegationHandoff、child LWR 物化和 LWR_prev 注入；未交付明确 undelivered。
- 对仍存在的 WorkRecord、inspect、Resume、Casebook 等逐入口验证范围、完成因果边界及暖冷一致，不靠单个 materializer 代证。
- ANCHOR 累计替换、原文保留、前缀稳定、checkpoint 与接力恢复使用同一份已裁定合同。

### SM-06 身份与恢复

- Predictor 私有身份及公开准入、office reset、真实 Fission 授权保留；接入 Advisor 无工具 office 与 horizon 数据投影。
- 持久失败预算和成功根绑定、同 live Journal 恢复发送去重在新派发链成立。
- GAP-140 A/B1 已验范围保留；B2 跨 OS 事实竞争和发送权不在本次自动销项。Advisor 专席与增量游标当前只在进程内；不宣称重启复用已经完成。

### SM-07 整体验收与切换

- 每包先定向 requirement 回归，全部接线后对同一固定候选运行 Fable 构建、相关集成、真实 Host 和独立安装包消费，再运行正式发布入口。
- 构建仅使用 `node scripts/build.mjs` 或仓库正式 verify；禁止 dotnet build。最低 Node 22.13、当前 Node 和 Bun 证据按各自实际入口记录，Bun 原生通过不代替尚未闭合的正式监督。
- 活动 work/PTY 由旧版本按原协议收束；未确认资源阻止运行切换。旧状态保留备查，不清空、不自动重播到新根。
- 最终记录提交、推送、验证、部署各自事实；未部署就明确未部署。

## 验收记录

### SM-01 开始

- 输入：上表两个固定本地提交；两个正式工作区 `git status --porcelain=v1` 均为空。
- 调查：固定上游源码、WHAT、库历史和临时三方预演；未运行产品测试。
- 当前交付：计划、处置表和现行入口链接。
- 剩余：契约冲突的正式去向、库候选及所有生产接线。既有看板中的 REVIEW/DOING/READY 不改变。

### SM-01 交付与 SM-02A 核心候选

- 计划与语义处置表提交 `68a6785f1`。origin/master 的并行方法文档提交 `522e942bc` 已包含它；独立整合分支正常快进保留对方改动，未强推。
- 两仓整合工作树已隔离。库从 8bb1021 合并固定 71c155f；五个文本冲突手工处理，候选版本0.8.1保留 supervision 导出、声明、说明和测试。原核心生产代码只有上游 lifecycle 规则发生变化。
- `node scripts/build.mjs` 十四入口通过；Node核心321项315pass/0fail/6skip/0TODO；Bun正确核心范围273pass/0fail；独立编译、可拆监管增强和真实Node/Bun安装包组合43pass/0fail/0skip/0TODO。
- 首轮Bun误纳入静态node:sqlite专用测试的6个加载错误保留，不改成通过。Journal的Bun实际消费由包外测试证明。库长期原始证据在 `evidence/semantic-merge-sm02a/README.md` 及同目录日志。
- 边界：这只证明已接入核心的限定范围，尚未完成新模块接收、最终依赖交付、主仓接线或非作者复审；原卡不销项。

### SM-02B 接收修正

- 库SM-02A提交为`152719c`。SM-02B保留原核心，修资源替换次序、冻结deadline、窄observer、声明与实际对象；时间拆为time/time-node/time-testing三个真实编译/发行单元，生产没有虚拟工厂。
- GAP-085的完整子树算法进入fs公开能力并由grounding调用；首个右括号和未来路径保证保留。新接收fs还复现并修正macOS逻辑根与realpath别名误拒，增加symlink根正反用例。
- 七个新增模块Node/Bun各191pass/0fail，独立编译/真实安装消费20pass/0fail；停止构建后重包3pass/0fail。库长期原始证据见`evidence/semantic-merge-sm02b/README.md`。
- 旧红、错误扫描前提和Bun调用范围错误均保留，不计通过。全库最终候选、所有导出闭包、非作者复审和主仓实际接线仍待。
- 新发现的源码归档规则冲突进入SM-02C：上游拒绝任何tgz，但本地有15份固定历史红/绿取证归档；必须保留证据身份并禁止它们变成运行依赖，不通过删证据或改名取得绿色。

### SM-02C 库固定候选

- SM-02B库提交`57a5f1e`，SM-02C库提交`f65e1065196b020d5e28163166645cf44377322e`，版本0.8.1。正式npm test构建16入口并运行563项：556pass、7skip、0fail、0TODO；新增全部公开入口实际打包安装闭包3pass、0fail，Node/Bun包外导入全部16入口且每个包成员与产物逐字相同。
- SC-06按根规则唯一例外清单固定15份历史证据的路径和SHA-256，实际索引/摘要检查通过；manifest禁止tarball依赖，实际包不包含evidence。原始失败日志不裁剪，日志换行/空格按原字节保存。
- 原始长期证据在库`evidence/semantic-merge-sm02c/README.md`。主仓准备引用自有fork可获取的确切SHA；最低Node22.13、真实Host和非作者复审尚未完成，原CUT/GAP状态保留。

## 本次保留的未完成边界

### SM-04 本批范围 READY

新循环已复用 NodeProcessHost 与库监管能力；完整原始 Capture、原生终结、停止、关闭、呈现分别保留。最低预算、实际 TOML/UTF-8、双语数据说明已接新入口。回调与 park 期限、实际注册取消和插件关闭均先保留反例，再逐处修复；证据见`evidence/semantic-merge-sm04/README.md`。上游 onTimeout 只有说明、没有实现与测试，本批删去该虚假承诺，不引入新回调协议。

generation8 合跑 process 与 managed-session-lifecycle-025 为321pass/64fail/1TODO；64红都在旧PTY集。迁移旧状态根并补齐测试端口 sticky 订阅后，generation9为89/34，揭示通用异常恢复会把资源收尾失败转换成业务完成。generation10只允许已认领完成走该恢复，收尾失败继续保留阻塞；旧PTY全集复验中。generation9正式12文件选集109/0/0TODO且排空、回收accepted=true，不能代证后续修正。格式检查仍有26路径未通过。

generation10 的旧PTY全集122/1，唯一剩余夹具向旧位置及非本轮scope预留；迁到共享状态根与确切AdmittedWork轮次后，冷读、blocker、未完成与未交付断言1/0。最终generation11正式13文件232pass/0fail/0skip/0TODO，13/13排空、进程组回收accepted=true，包含完整managed-session-lifecycle-025及真实插件、取消、完整编码预算、GNU wget和pipe/PTY各自证明。未部署，未提交合并事务。详见`evidence/semantic-merge-sm04/`。

当前绿色只覆盖对应日志范围。通用 JS 异步 CPU 隔离、整个 Long Stroke、旧 PTY 跨 Host 保证、发行与真实 Host 仍分列，不能用 pipe 或纯函数代证。正式发行前还须同一最终候选复验。

### SM-05 本批范围READY，历史缺口保留

generation10原生历史基线291项244pass/37fail/10TODO。37红包含旧squash专属调用及子LWR断言、三个Trace夹具差异；不把退役测试的删除当作冻结保证已保住。SC-02先保护Plan的U原文，SC-03先证明checkpoint身份不等于摘要耐久保存，再按现存owner限定ANCHOR寿命。仍存WorkRecord、inspect/Resume、完成冻结与原件捕获继续逐入口验收，Blogger全退役不在范围。

用户明确批准删除CommissionerRecord公共字段、渲染分支及双语资源，真实Attachment保留。SC-02/03按真实反例收窄：Plan用户原文始终保留；ANCHOR编号、替换与摘要只在当前进程有效，checkpoint只证明调用身份，U/P/持久账本承担交棒。没有新增持久摘要层。

generation13历史全选集276pass/0fail/1skip/10TODO、前缀全选集180pass/0fail/1skip/8TODO；启用被跳过的独立正负编译和真实Host证明后34/0/0skip/0TODO。generation15正式委派集（含实际Host指导）64pass/0fail/0skip/2TODO，7/7排空、回收accepted=true；因旧TODO退出1。物理执行和完整PTY生命周期复验206/0/0skip/0TODO，8/8排空、回收accepted=true。选集有重叠，不相加。原始红灯、新鲜度拒绝、收尾修正和全部日志见[evidence/semantic-merge-sm05](../../evidence/semantic-merge-sm05/README.md)。

剩余：GAP-109/111的全消费者等价性、历史TODO及Blogger全退役均未关闭；本包证据允许依赖包施工，不代表全发行通过。SM-07仍须统一候选、格式、最低Node、包外消费及实际切换核对。

### SM-06 本批范围READY，未扩成耐久Advisor或B2施工

generation17统一Fable构建通过；相关全选集360项316pass/0fail/3skip/41TODO。正式身份/Advisor/schema九文件23/0/0skip/0TODO；实际权限七文件55/0/0skip/4TODO；失败预算/grounding六文件85/0/1skip/3TODO；均完整排空、进程组回收accepted=true。跳过的grounding原生Host/实际provider序列化另启集成层4/0/0skip/0TODO。各组有重叠，不相加；含TODO的正式入口仍退出1。

保住旧身份原件时发现MailboxSubscribed先于非法Predictor截断；只保留该确切标记的只读解码，fold不恢复邮箱状态，AgentJournal拒绝新写入。三份旧NDJSON摘要与cut断言不变，未知case和缺字段仍拒绝。恢复误随旧Handoff退出的writer关闭探针，实际物理append前拒绝、零发送、预算冷读和同live Journal一次发送均复验。Advisor已证实并修复旧回答重放，只读本次future终态中的正式散文；当前进程席位/游标合同已校准。证据见[evidence/semantic-merge-sm06](../../evidence/semantic-merge-sm06/README.md)。

剩余：B2仍实测出现两条物理失败事实；GAP-158完整Fission公式、Sphinx真实调用、旧权限TODO、Advisor并发咨询/晚到终态及耐久席位均不关闭。Blogger全退役和旧GAP清零不进入本批。

### SM-03 本批范围READY，整包边界保留

- 依赖已切到自有 fork 的 `f65e106` 源码子模块，`file:wanxiangli` 实际安装及源码索引检查通过。主仓91份历史证据归档另有精确路径/摘要清单，唯一运行依赖归档退出；不删证据换取绿色。
- 主仓合并仍未提交。首轮正式Fable编译暴露旧接口与新接口的调用差异，原始日志暂存 `/tmp/vibe-fs-sm03-build-02.log`；在工作包验收前转入长期证据。构建失败不记通过。
- 持久归属、恢复关闭及DevOps终结前PTY收尾保留；状态定位转 `.Herdchestra`。Trace现存MaterialConfirmed原件、冻结cut和完成投影保留；上游索引优化不能绕过本地身份冲突验证。Blogger只退役本批已批准的squash路径，未执行全退役。
- 正式Fable构建generation1通过：1510编译项、171语义表面、825 ESM模块真实加载。SM-03六包正式选集触发5秒静默门禁，拆分后的长编译选集仍触发；原始失败保留，不放宽时限。原生84文件排空为474项452pass/11fail/11TODO；其中长编译正负边界实际通过。11红已逐项定位为夹具旧回执/旧状态根、规范化根路径与successor重复声明；后续9文件定向178项168pass/6fail/4TODO，剩余6项Journal旧.git夹具修正后23项21pass/0fail/2TODO。尚待同候选正式定向复验和发行/恢复其余门禁，不能把这些分次证据合成一次全绿。
- 主仓归档和确切gitlink三项反例通过；清单摘要篡改也必须与baseline Git blob比较。原始日志和范围说明进入 `evidence/semantic-merge-sm03/`。未合并/推送生产代码，未部署。计划文档推送曾遇并行master前移，保留远端提交，最终普通合并后推送。
- generation2正式构建通过。8文件正式选集32pass/0fail/0skip/0TODO，8/8排空且进程组回收accepted=true；验证范围为状态根/旧数据隔离/linked worktree、真实连接关闭、PTY冷归属、successor稳定身份及确切源码依赖。11文件扩大选集72pass/0fail/5TODO，Change/Git完整14文件202pass/0fail/5TODO，crash-reconciliation完整21文件55pass/0fail/18TODO，均已排空、进程组回收accepted=true；因TODO正式入口返回失败，不使用WXS_ACCEPT_TODO。三组存在重叠，不相加冒充独立用例总数。
- READY只允许依赖它的实现包继续施工；不代表整个requirement包或所有历史GAP关闭。长编译原生通过不替代5秒正式监督失败；完整发行、安装、最低Node和真实Host仍归SM-07。全量上游merge事务在相关包收束后提交，当前不把含未验收SM-04/05语义的候选提前放入master。

### SM-07 候选进入REVIEW，完整发行和切换未通过

最终库固定05f6b5acf63a29d758e08e3162bba4c547dfda8d，已普通推送且可从HTTPS全新clone干净检出。最低Node22.13完整库559pass/0fail/7skip/0TODO，16入口真实安装闭包及外部TypeScript严格编译通过。主仓手工格式和静态检查通过；gen21同一候选的完整物理/PTY正式集在Node22与Node26各206pass/0fail/0skip/0TODO，8/8排空并回收accepted=true。

启用实际Git集成的25文件正式选集255pass/0fail/0skip/10TODO，25/25排空、回收accepted=true；仍因TODO退出1，未记为完整验收。已修正全集发现的墓碑退休合同、漏显式交付的夹具、延迟Host激活的重启夹具及过宽编译依赖。委派Host闭包由399降至381，未提高392预算，交付值cell仍是同一个进程内owner。重启正控保留显式resume、deliver和join，不据此销GAP-149/158。

Node22和Bun的真实主仓包已分别完成npm pack、隔离安装、离工作区导入和bundled库消费。最终并行master文档合并后的构建、发行入口及包摘要见[evidence/semantic-merge-sm07](../../evidence/semantic-merge-sm07/README.md)和该目录delivery.json；提交与普通推送事实单独登记。运行中的原工作区未切换，未部署。

边界：正式发行02在416/870文件完成后触发5秒静默门禁，没有权威总计；相关修正的定向正式复验不覆盖未完成的全集。后续正式入口结果继续原样记录，不设置WXS_ACCEPT_TODO、不提高静默时限。B2、旧TODO、完整Fission公式、通用异步CPU隔离、Advisor晚到/并发及耐久席位、GAP-109/111、CUT既有边界、非作者复审及旧活动资源收束均保留。Blogger/Chronicle全退役、旧GAP清零和旧状态重播不在本批。
- 旧ExecutorTool/四动词注册表面与Git状态同步已退出。其测试须迁入新入口；下表未通过前，SM-04/05不得标完成，也不得把上游新测试单独通过当成本地保证已保住。

| 原测试 | 仍须迁入的保证 | 责任与证明边界 |
|---|---|---|
| process-execution 011 | 所有非法预算/规格在创建物理进程前拒绝，零副作用、启动握手取消 | SM-04；新Runnable和实际注册入口分别验证 |
| process-execution 013 | 无模型/会话蒸馏、完整结果预算、真实插件计数 | SM-04；头尾呈现取代旧尾部政策，不能只验工具纯函数 |
| process-execution 014 | CRLF/BOM/尾换行/控制字符原件、伪指令隔离、真实退出码及双语截断数据 | SM-04；实际js.run结果及注册呈现，不用合成TOML代证 |
| process-execution 015 | 完整wire字节/行数，minimum-1零启动，minimum正常/signal/停止/故障结果 | SM-04；新增预算形态不得静默丢弃这些边界 |
| 本地process-execution 017 | 二进制stdin/分路捕获、真实终结、握手期限、EOF排空 | SM-04；通用物理保证迁到仍存Process调用者。Git对象/ref/树读取与未知写入专属测试随已退出的GitRawStore退休，历史证明保留在固定本地输入，不复活状态transport |
| work-record 004/010的squash及旧子LWR分支 | 完成前沿、晚到原件和晚到摘要不改写冻结完成记录，暖冷一致；scope借用失效 | SM-05；退役的squash与子LWR专属断言移除，仍存WorkRecord/inspect/Resume入口另验，不据此关闭GAP-109/111 |
| managed-session-lifecycle 025的旧open-terminal命名竞争 | 旧工具专属命名失败后关闭已开的PTY | 该入口整体退役；不另造命名模拟器。其余025的资源归属、真实exit、恢复、run关闭及无法确认时阻止交付继续验收；pipe不代证PTY |

GAP-140 B2、CUT-03-R7/R8/R9、CUT-06-R5、CUT-04-R7/R8、CUT-00-R2/R3、R12-U1 及其它历史 TODO 保留原编号、证据与状态。迁移中发现其旧消费者退出时逐项登记适用性，不据此把父 GAP 改 DONE。Blogger 全退役方案、其状态清空建议和替代架构均不进入本批。
