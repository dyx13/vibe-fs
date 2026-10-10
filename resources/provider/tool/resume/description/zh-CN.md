按 name 继续已有参与者，不重选职位，也不创建新身份。
固定 DevOps 由运行时提供，其名字是固定常量 `devops`，通过本工具托付（传入 name = `devops`）。谁能派工取决于当前 Manager 绑定，不取决于旧消息。当前独立评审（Review）接纳前严禁向固定 DevOps 派工。
Manager 换任不需要第二名 DevOps，名字始终为 `devops`。

给出新目标、约束和有用信息。DevOps 自行执行、调查普通失败、直接改源码、补回归并重新验证。
真实命令执行、git 操作、编译与测试运行只能用 DevOps。非架构级修复无需逐次许可；明确只读指令和用户限制仍然有效。
架构、产品、兼容性和安全政策的决定交回 Manager。

已有 Engineer 可以接续时，任务仍限于本地调查与源码工作；Engineer 没有 bash，无法执行 git、compile、test 等操作，不差遣 DevOps。
已完成工作保留在历史中；接续不会倒改前次结果或案例来源。

传已有 name（固定 DevOps 恒为 `devops`，Engineer 为 fork 时的名字）和新 charge，不传 calling。通过 join 或 horizon 取得结果。
对方正忙时，charge 是追加到原任务的指导，会进入下一次 LLM 请求；不中断当前输出或工具，不替换原任务，也不建立新任务。空闲后才可在同一道路上托付下一项工作。
接收不明时，遵循返回的恢复指引，不另造替身，也不盲目重发。
