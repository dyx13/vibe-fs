# S1b2 接续窗口最终收据

窗口：2026-10-10 13:34:50—15:04:50 UTC。产品提交：`93ad237cc63c248ce8a626d235d6b60621ca570f`，已普通推送master。起点`9d7589db0`。本记录只给有限判决，不授完整发布或GAP闭合。

## 固定输入

最终clean build为gen414，1516编译items、828 emitted modules、174公开Surfaces。Fable编译219093ms、owner230222ms、build阶段262.3s。compiler digest `b2a3cf5e58c2f8ecf3b86399f87fa77cb4b0dce9bfa76439183fd65c44549fc5`；artifacts digest `b9b5be1cbc07a797a404b4a89e6c510de0d316da7cdec0bbcc755df456eda4a8`。验证期间未改跟踪输入。最终收据在验证中断后另行提交，不冒充该输入的再验收。

## 判决

| 入口 | 实跑结论 | 边界 |
| --- | --- | --- |
| 真实Engineer提前消费反例 | 0pass/1fail，0cancel/skip/TODO | 正式产品红，先于实现 |
| 原生公开005最终输入 | 34pass/0fail/0cancel/0skip/0TODO，88638.381125ms | Node26.6.0；不可替代默认门禁 |
| 默认104相关文件 | 102/104排空后原5秒门禁失败，完整四计数unknown；组40043回收accepted=true、78.328ms | 冷child和既有OpenCode就绪超时，未减并发或扩大预算 |
| 原`npm run verify:release` | format/check/clean build通过；unit原300000ms backstop，205/817排空、10active、602queued，完整四计数unknown | 后续pipeline层未进入；诊断/退出未正常完成，后经调用方中断exit130，资源回收未确认 |
| 精确CI [38060575680](https://github.com/dyx13/vibe-fs/actions/runs/38060575680) | FAILED；unit原300000ms backstop，470/817排空、2active、345queued，完整四计数unknown；组3069回收accepted=true、11.880ms | Node22；005文件已排空且worker exit0、wall32515.593747ms，不据此推算全量计数；后续层未进入 |
| 独立真实package | exit0，gen414、2020members、12488972bytes | 工具包Node24.19.0，真实pack/解包/隔离consumer；不替代Node26平台或完整release |
| 独立唯一Long Stroke | 62业务步骤45.7s走完，journal482/699、SSE2689/3351；退出/回收未结束，调用方中断exit130，完整四计数unknown | 未报告E2E通过；未重跑或按场景另建环境 |

package tarball digest：`17147ab7b1c8577009ee6a111c0c5e09345eb36ff58d4fd70eb5367511cb2303`。产物路径`.fable-build/verify-logs/package/wanxiangshu-0.9.0.tgz`（运行时产物，不跟踪）。

## 保留的失败与调查

默认Node24原104文件103/104静默失败、单独005静默失败均保留。曾试用异步child，完整005为27pass/3fail/4cancel，未解除问题，已撤回。步骤打印已清理。Node26的单叶对照也取消，不能指定Node版本或preload为唯一根因。CPU profile仅说明冷初始化有实际模块加载与计算成本。

本地unit组44670经启动代码`detached:true`与日志确认属本次运行。对已失败组的SIGKILL及PID检查命令未返回确认；不能据发送命令声称回收成功。独立Long Stroke仅到业务流程结束，物理teardown仍是剩余边界。

## 下一步

先定位本地进程检查/回收的真实等待链与原300秒吞吐，保预算、并发与tier。再接自动检索Host历史/丢物理回调补据、Manager双append崩溃补据、完整life代次。H0b-C1/C2、Sphinx真实答案、J3/D0-R及相关GAP继续开放。

本目录保留正式红绿、默认失败、未采用诊断、当前release截断、精确CI与独立层日志。原始日志和本记录分别说明输入与截断点。
