# keyword / attach 必要性 裁决记录（2026-10-10）

- 工作包：WP-010（L388）
- 现状锚点：
  - `src/Wanxiangshu/Execution/Delegation/Fork/OpenCode/Tool.fs`（fork 与 resume 的 `keywords`、`attach` 均为可选参数；commission 无此二参）
  - `src/Wanxiangshu/Execution/Delegation/Fork/Payload.fs · ForkChildAssignment.Attachment`（attach 进首 prompt 的 TOML 数据字段）
  - `src/Wanxiangshu/Repository/Investigation/WarmStart/Prompt.fs`（`MaxKeywords = 8`、`TopKPerKeyword = 4`、`MaxHintsTotal = 24`、`MaxWarmStartBytes = 64 KiB`、`isDirectConsumer` 仅 Engineer/DevOps）
  - `src/Wanxiangshu/Repository/Investigation/WarmStart/Runtime.fs`（无关键词零工作、单查询 fail-open、低信任附表）
- 意见原文：keyword、attach 功能的必要性存疑。

## 证据

1. 两参数均为可选，不构成强制负担。来源：`Tool.fs` fork/resume 的 `optionalStringSchemaDescribed`（`ArgKeywords`、`ArgAttach`）；commission 参数表无此二参。
2. keywords 有完整消费链与有界语义。来源：`WarmStart/Runtime.fs`（`normalizeKeywords` 整行查询、空即 `Ok None` 零搜索、单查询失败只返回空）；`WarmStart/Prompt.fs:31-40`（8 / 4 / 24 / 64 KiB 上限，仅 Engineer、DevOps 为直接消费者）。
3. keywords 的低信任定位有条款与测试双重固定。来源：`repository-investigation-006/007/008/009`；测试 `repository-investigation/tests/007.test.mjs`（上限 8、零关键词零搜索、重复调用真重搜）、`009.test.mjs`（乱序/失败不改合并序、稳定去重、整条目截断与预算）。
4. attach 只作只读背景，有 typed 渲染隔离。来源：`delegation-019`（首 prompt 指令与背景字段分离）、`delegation-021`（attach 只读、不转义务、不克隆 authority）；实现 `Payload.fs` 把 attach 写成 `attached_work_record` TOML 数据字段，从不拆成指令注释；测试 `delegation/tests/019.test.mjs`、`021.test.mjs`（含敌意文本仍是背景字段、空白即缺席）。
5. 资源面两参数均已双语描述且语义收窄。来源：`resources/provider/tool/fork/arg-keywords/{en,zh-CN}.md`（“帮助定位上下文；不扩大、不重新定义 charge”）；`resources/provider/delegation/fork-attach-argument/{en,zh-CN}.md`（同一 mission 内另一 Byname 的 canonical work record 作背景）；另有 `fork-attach-self`、`fork-attach-unknown` 两对。
6. 使用频率无运行期实测，只有静态存在证据。`fork`/`resume` schema 含两参、资源与测试覆盖完整，但仓库内无调用遥测，本次未运行产品、未接真实宿主，故真实 LLM 调用频率写「未验证」。
7. attach 有一条未闭合边界。来源：`delegation/tests/021.test.mjs` 末尾 `test.todo`（GAP-153：实际 fork 只附指定同伴历史、不克隆 authority、不转移未竟义务，尚无端到端证明）。

## 三问

1. 现状防住哪类真实错误？
   - keywords：新 child 无仓库上下文时的盲目全仓搜索与高成本试错；以有界、低信任、fail-open 的定向数据替代自动抽词（`repository-investigation-007` 禁止从任务自动抽词）。
   - attach：跨同伴背景缺失时的重复调查；以 typed 数据字段隔离背景，防止背景被误当任务或权威（`delegation-019/021`）。
2. 去除后哪条 WHAT 条款失守？
   - 删 keywords：`repository-investigation-006/007/008/009` 失去唯一显式输入源（007 要求只接受显式关键词、无关键词零工作，charge 本身不能替代）。
   - 删 attach：`delegation-019/021` 的 attachment 数据字段与只读语义失去生产输入；`participant-horizon-012/013` 的定向数据边界少一半。
3. 更简单的实现？
   - 无。两参数已可选，不用即零成本（零搜索字节保留、空白 attach 缺席）。删除反而要改 schema、解码、`ForkChildAssignment` 类型、首 prompt 渲染、WarmStart 整链、中英资源、两套测试与 GAP，收益不明。

## 结论

保留。

理由：
1. 两参数可选且零用零成本，不构成强制负担。
2. 各自有完整消费链与条款固定语义，删除将同时掏空 `repository-investigation-006—009` 与 `delegation-019/021` 的输入源，无替代方案。
3. 误导风险已有针对性隔离（keywords 低信任+有界+fail-open+仅直接消费者；attach TOML 数据字段+敌意文本测试），残留缺口只有 GAP-153 一条未闭合边界测试，不构成删除理由。

保留边界（后续施工与使用必须遵守）：
- keywords：只接受显式非空关键词行，每行一条完整查询；上限 8 词、每词 4 条、共 24 条、64 KiB，超限只删整条；只向 Engineer、DevOps 直接交付片段，其他角色只传关键词；无关键词零搜索且保留任务原文；低信任定向数据，经真实只读观察核实后才能作事实。
- attach：只填同一 mission 内另一 person 的 Byname；渲染为 `attached_work_record` TOML 数据字段，不转未竟义务，不克隆 authority；空白即缺席。

剩余边界：
- 真实 LLM 调用频率未验证（无遥测）。有运行期数据时可复核。
- GAP-153（实际 fork 只附指定同伴历史的端到端证明）仍为 `test.todo`，应由后续工作包补边界测试，不在本裁决内施工。

## 删除执行清单（未触发，仅备查）

若将来复核改为删除，按以下清单执行（本次不亲自删产品代码）：
1. schema：`Tool.fs` fork/resume 去 `keywords`、`attach` 参数与解码；`Tool.fsi`、`ToolSurface.fs` 同步。
2. 类型与渲染：`Fork/Payload.fs` 去 `Attachment` 字段；`Surface.fs` 去 `attached_work_record` 字段；keywords 侧退役 `WarmStart/{Prompt,Runtime,Surface}` 整链或改为无输入死码清理。
3. 条款：改写或退休 `repository-investigation-006/007/008/009`、`delegation-019/021`、`participant-horizon-012/013` 相关条目。
4. 资源：删 `resources/provider/tool/fork/arg-keywords/` 中英、`resources/provider/delegation/fork-attach-*` 三对中英、`fork/warm-start-unavailable` 中英（若只为 keywords 存在）。
5. 测试：删改 `repository-investigation/tests/007`、`009`、`delegation/tests/019`、`021` 及 warm-start support。
6. 描述与门禁：核对语言对等门、消融映射与工具描述引用，全仓 grep 无残留。
7. GAP：`GAP-084`（字节保留边界）、`GAP-153`（attach 端到端）状态同步更新。
