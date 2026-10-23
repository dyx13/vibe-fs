# 测试优化方案调查记录（2026-10-24）

本次只同步独立 upstream 工作树并制定方案。用户明确选择 master 合并另做；没有合入或重置自有 master，也没有实施测试优化。返回[方案](../../proposals/TEST-OPTIMIZATION-2026-10-24.md)。

## 固定源码

| 对象 | 值 |
|---|---|
| upstream/master | `d140299a8fef73c6e0871c738afa608f57c7b96f` |
| upstream 提交时间 | 2026-10-23 18:34:58 +08:00 |
| wanxiangli gitlink / 实际 HEAD | `3bcb47be43c4ba1225c5a1928e2f7b974e9aad74` |
| 独立工作树 | `/Users/yuanxi/.codex/worktrees/test-optimization-20261024/vibe-fs` |
| 方案分支 | `codex/test-optimization-20261024` |
| 未改动的主工作树 HEAD | `8db33b3429a70d5cdbea30e393363666b3649573` |
| 获取时的 origin/master | `540fe20e7f0c6e0cd53245fa08111e8fadd3dadc` |
| 已有整合分支 | `aa6efbecac756a37be8e40546fa64972a9f7b3d0` |

`git fetch --multiple origin upstream` 已完成。以最新 upstream 为 ref 创建独立工作树，再检出其确切 gitlink；没有把依赖切到另一个浮动 main。同步前后原工作树未跟踪文档 `万象术独特功能导论.md` 的 SHA-256 均为 `c8601b2d97486993410e3cbdf1ced0a001546a3bed550c101396d565eb5f47ad`，没有读取其正文或加入提交。

已有整合分支到最新 upstream 的增量为 18 个提交、611 个变更路径。`git merge-tree --write-tree --name-only` 预演返回 1、报告 138 个冲突路径：requirements 78、src 47、resources 7、scripts 3、子模块 1、根文档 2。它没有改变任何工作树或索引；用户随后选择独立同步，故没有开始冲突整合。冲突清单保存在 [merge-conflicts.txt](merge-conflicts.txt)。

## 选集问题的直接证据

[probe-focused-selection.mjs](probe-focused-selection.mjs)导入当前工作树的真实入口函数，将其产出的环境传给一个实际 Node 子进程读取。它不运行 requirement 用例、Fable 或完整验证。

从本工作树根目录复查：

```sh
node evidence/test-optimization-20261024/probe-focused-selection.mjs
```

[focused-selection.json](focused-selection.json) 是本次原始输出：

- `time-capability` 计划含 8 个实际文件；子进程读到的选集是 `null`。
- 同版 runner 的默认发现集为 752 个文件。根据其分支逻辑，缺选集会使用全量发现；本次没有真正执行这 752 个文件。
- 同时请求合法包与不存在包时，入口继续接受合法包的 8 个文件。
- 全量入口清除外部传入选集的保护仍成立；修复须保留这条保护。
- 实际诊断环境为 Node v26.6.0 / Darwin arm64；没有把它当作 Node 22 CI 的性能基线。

探针退出 0 只表示诊断完整输出，不表示聚焦功能已正确或测试已通过。真实选中/未选中用例、失败传播、参数拒绝和资源回收由方案 T1 的正式回归承担。

## 历史成本的用途

[historical-costs.json](historical-costs.json) 从两份已有本机日志提取父运行器的文件 start/drain 和最终摘要，并记录原日志 SHA-256。所有时间仅是各自历史输入下的观测，不能相互计算加速比，也不能作为当前 `d140299a8` 的基线。

2026-10-08 样本为 824 文件、286.46 秒；整合分支 generation 48 样本为 765 文件、486.99 秒。016 和少数资源生命周期用例排在前列，只用于确定 T2 的复测顺序。原日志未复制进本次提交；提取记录保留来源路径与摘要，完整候选验收结论仍归原收据。

## 已完成的检查及边界

| 检查 | 结果及范围 |
|---|---|
| 子模块 checkout 与身份 | 退出 0，实际 HEAD 等于主仓 gitlink，子模块无未提交改动 |
| `npm ci --ignore-scripts --no-audit --no-fund` | 退出 0，按锁安装 246 个包；没有执行安装脚本，不代表 native Host 已就绪 |
| `node scripts/wanxiangli-source.mjs check` | 退出 0，源码依赖和禁止跟踪 tgz 的检查通过；不代表库已编译 |
| `node scripts/verify.mjs --help` | 退出 0，确认当前 CLI 公布 `--suites` |
| `node --check evidence/test-optimization-20261024/probe-focused-selection.mjs` | 退出 0，只校验诊断脚本语法 |
| 入口探针 | 退出 0，结果见 JSON；复现选集缺失，未运行测试 |
| 方案及记录复查 | 相对链接存在；脚本摘要与原始输出相符；752 个发现文件、138 个冲突路径及两份历史完成数一致 |

本次不提供新版本构建、完整日常验证、发布、远端 CI 或部署通过的声明。方案阶段不修改运行器、测试、预算、并发或产品实现。
