## 编辑已有文件

### 默认入口：{{editCall}}

当你能够同时声明当前文本与最终文本时，使用 edit()。它读取目标已有 UTF-8 文件的一份不可变
快照，让所有 change 都在同一份快照上规划，并且至多暂存一个 Rewrite 意图；它不会立即写盘。

规范形态：

```js
this.edit({{editTarget}}{
  find: "const timeout = 1000;",
  put: "const timeout = 5000;",
});
```

changes 可以是一个 object，也可以是非空数组。每个规范 change 都是
{ find, put, all? }：

- find：描述当前文本的非空 string 或非零宽 RegExp。
- put：命中 span 的完整最终文本，必须是 string。
- all：默认 false。预期恰好一处命中时省略；只有每一处精确且互不重叠的命中都应得到同一段
  put 时才设为 true。

四种常见形态是刻意保持机械化的：

```js
// 精确替换一段。
this.edit({{editTarget}}{
  find: "const timeout = 1000;",
  put: "const timeout = 5000;",
});

// 在锚点后插入：put 中先原样保留锚点，再写最终新增文本。
this.edit({{editTarget}}{
  find: 'import { load } from "./load.js";',
  put: 'import { load } from "./load.js";\nimport { save } from "./save.js";',
});

// 删除：put 为空字符串。删除整行时，把换行一起放进 find。
this.edit({{editTarget}}{
  find: "const obsolete = true;\n",
  put: "",
});

// 替换每一处精确命中。多重性由 all 决定，不由 RegExp 的 g flag 决定。
this.edit({{editTarget}}{
  find: /\boldApi\b/,
  put: "newApi",
  all: true,
});
```

同一文件的独立修改放进一次调用：

```js
const report = this.edit({{editTarget}}[
  { find: "const timeout = 1000;", put: "const timeout = 5000;" },
  { find: "const retries = 2;", put: "const retries = 3;" },
]);
// report = { path, changed, operations, replacements }
```

所有 change 都寻址原始快照，绝不寻址数组中更早 change 产生的文本。因此第二个 change 不能查找
第一个 change 新生成的文本。只要原始 span 不重叠，change 顺序任意；若两个 change 重叠，把它们
合并成一个直接声明合并 span 最终文本的 change。

精确性与换行：

- string find 是精确匹配。一致使用 CRLF 的文件可以用普通 LF 引用；edit() 会在结果中恢复
  CRLF。混合换行文件保持逐字节精确。
- RegExp 的 i、m、s、u 与 sticky y 等 flag 保留。g 不决定多重性；all 才决定。
  sticky RegExp 从不可变快照的 offset 0 开始。
- put 是字面最终文本，不是 JavaScript replacement 语法。`$1` 会原样写成 `$1`；需要按 capture
  计算或生成输出时，在 JavaScript 中构造完整文本并使用 rewrite()。
- oldText/newText 与 search/replace 可作为无歧义的恢复别名，但新代码一律写规范 find/put。
- 未知字段与奇异 change object 会失败为 INVALID_EDIT，而不是被忽略；这样 `al: true` 一类拼写
  错误会在静默改变多重性之前被拦截。声明形态先于目标读取验证，因此 malformed change 不会被
  path failure 掩盖。

失败策略保守，而且直接面向修复：

- INVALID_EDIT：形态或类型错误。使用 { find, put, all? }。
- EDIT_NOT_FOUND：精确命中为零。reason 会给出最接近 string 候选附近的当前带行号文本；只有
  置信度保守且候选唯一时，才额外给出可直接复制的修正 change。修正后的 find 是当前文件中真实
  存在的精确子 span，不会用近似整行代替原范围。建议只修正 find，绝不自动应用。
- EDIT_AMBIGUOUS：未设置 all: true 却命中多处。reason 会列出候选行；加入只有目标位置拥有的
  上下文，或仅在每一处都应修改时设置 all: true。
- EDIT_OVERLAP：规划出的原始 span 相互重叠。请合并；数组顺序永远不是隐藏优先级。

以上失败全都发生在本次 edit 调用暂存任何内容之前。近似匹配只用于诊断，绝不是修改许可。
成功的 no-op 返回 changed: false 且不暂存写入。诊断窗口与 copy-ready payload 都有上界；超长
单行或 put 不会把普通 mismatch 变成超大失败。由于同一 program 对一个路径只能声明一次修改，
不要对同一路径调用两次 edit()/rewrite()。

### 高级逃生舱：{{rewriteCall}}

当最终文件需要计算、重排、生成，或无法表示为少量互相独立的精确 span 时，使用 rewrite()。
newText 是完整结果文件，不是 patch。目标必须已经存在，否则失败为 FILE_NOT_FOUND。调用只暂存
一个 Rewrite 意图，不会立即写盘。先在内存中构造并验证完整 newText，最后恰好调用一次 rewrite()。
