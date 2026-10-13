class Js extends JsProgram {
  async run() {
    const draft = await this.file([
      ["facts", "afterFacts", "## 事实"],
      ["target", "afterTarget", "## 目标"],
    ]);
    const current = draft.text("target", "afterTarget");
    if (!current.includes("不可判定")) return { changed: false };

    const rebuilt =
      draft.text("^", "target")
      + "## 目标\n"
      + draft.text("afterTarget", "$").replace("不可判定", "可判定");
    this.rewrite(rebuilt);
    return { changed: true, headings: 2 };
  }
}
