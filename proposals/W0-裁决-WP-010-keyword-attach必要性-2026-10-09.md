# keyword / attach 必要性 裁决记录（2026-10-09）

- 工作包：WP-010（L388）
- 现状锚点：`src/Wanxiangshu/Execution/Delegation/Fork/OpenCode/Tool.fs`（841-842、863-864）；`src/Wanxiangshu/Repository/Investigation/WarmStart/Runtime.fs`
- 意见原文：keyword、attach 功能的必要性存疑。

## 证据
1. `Fork/OpenCode/Tool.fs:841-842,863-864` 中 keywords 与 attach 均为可选参数，不构成强制负担。
2. `Repository/Investigation/WarmStart/Runtime.fs` 消费链存在：keywords 生成低信任定位提示，attach 提供只读背景。
3. `repository-investigation-007/009`（关键词上限：8 关键词、每词 4 条、共 24 条、64 KiB）与 `delegation-021`（attach 只读背景、不克隆 authority）条款固定语义。

## 三问
1. 现状防住哪类真实错误？答：低信任提示的定位收益与 attach 只读背景的越权风险边界。
2. 去除后哪条 WHAT 条款失守？答：`repository-investigation-007/009`、`delegation-021`。
3. 更简单的实现？答：无；参数已可选，删除需改条款、schema 与全部调用方，收益不明确。

## 结论
保留
理由：两参数已可选，不构成强制负担；有条款与消费链双重支撑；删除的维护成本与收益不成比例。
剩余边界：真实 LLM 调用频率需运行期数据，届时可复核。
