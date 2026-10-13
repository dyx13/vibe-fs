# provider-language — WHAT

## [001] ProviderLanguage

语言是封闭强类型 `English | SimplifiedChinese`，对应资源文件 `en.md | zh-CN.md`，不以任意字符串作为内部语言事实。

## [002] 无会话语言绑定

不存在会话语言绑定，也没有任何持久化记录语言。会话、时序、重试、压缩、恢复、验证门等机制一律不参与语言决定；任何入口问某个会话的语言，得到的都是当前全局设置。

## [003] 派生会话同读全局

child、attached 和 internal execution 与 owner 读同一个全局设置，不继承任何存储值。全局设置变化时，派生会话与 owner 在下一次读取同时切换。

## [004] 全局偏好阶梯解析

全局偏好按顺序解析：`WANXIANGSHU_PROVIDER_LANGUAGE` → 宿主配置 `language` → 本地化环境探测 → English。环境探测在 `VSCODE_NLS_CONFIG`、`LC_ALL`、`LC_MESSAGES`、`LANG` 或 Node.js `Intl` 判定为中文时选 SimplifiedChinese。

显式配置优先于环境探测，包括显式 English。

## [005] Class A / Class B / Class C

进入 participant horizon 的内容按性质区分：

- **Class A（Provider Prose）**：面向模型的自然语言文本，包括提示词、角色规范、工具描述、执行后果和完成文案，必须完整本地化。
- **Class B（Technical Literals）**：工具名、参数、协议字段、枚举值、路径和命令等技术字面量，保持原样；标识符契约见 011。
- **Class C（Internal Diagnostics）**：不进入模型感知范围的内部诊断与日志，不属于 Provider 多语言体系。

## [006] 资源成对与缺失拒绝

每个 Provider 语义资源同时提供 `en.md` 和 `zh-CN.md`。请求缺失的本地化资源必须失败，不得静默回退到英文。

## [007] 模板参数一致

同一模板的各语言版本具有相同的 `{{name}}` 占位符集合。注入参数值不翻译；缺少填值或替换后仍有未填占位符必须报错。

## [008] 工具文本遵循全局语言

同一参与者看到的工具描述和调用契约中的 Class A 文本与当前全局语言一致，不与 system prompt 混用语言。全局语言变化后的下一次工具描述渲染即用新语言。

## [013] Class A 的交付语言

进入模型的 Class A 文本以当前全局语言为准。全局设置变化立即生效于下一次渲染，包括已在进行中的会话；同一会话的前缀可以随语言切换而整体变化，前缀法则只在语言不变期间强制。

角色提示词、内部指令、名册和工具 schema 的描述均遵守此规则；系统提示词中属于本项目的段落，不论来自哪个语言或安装视图，都须按当前全局语言呈现。

## [009] 内容、语言与布局分权

语义内容由领域所有者定义，语言由全局设置决定，布局由通用呈现机制负责。所有 Class A 文本通过统一资源机制装载，业务代码不以语言分支内嵌多语散文。

## [010] Role Law 的跨语言锚点

同一 Semantic Anchor ID 在英文与中文 Role Law 中成对出现。锚点匹配用于检查对应关系，不能代替 012 的语义一致性。

## [011] 协议标识符不翻译

同一工具名、参数名、协议字段和枚举值在各语言中保持原名，并指向同一契约。

## [012] 双语职责语义一致

Engineer、DevOps、Manager、Plan 和 Sphinx 内部 Engineer 的提示词、Role Law、工具描述及示例，必须共同表达 office-capability 和 delegation 定义的当前职责。中英文不得增加、削弱或互相矛盾；任何版本均不得保留违反这些职责的示例。Plan 的角色提示与各 stage 方法资源（`resources/provider/planning/s1|s2|s3/`）同样成对提供并按 [006] 拒绝缺失，其装配语义归 planning 条款。
