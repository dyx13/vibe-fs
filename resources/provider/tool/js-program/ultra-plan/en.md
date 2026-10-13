class Js extends JsProgram {
  async run() {
    const draft = await this.file([
      ["facts", "afterFacts", "## Facts"],
      ["target", "afterTarget", "## Target"],
    ]);
    const current = draft.text("target", "afterTarget");
    if (!current.includes("undecidable")) return { changed: false };

    const rebuilt =
      draft.text("^", "target")
      + "## Target\n"
      + draft.text("afterTarget", "$").replace("undecidable", "decidable");
    this.rewrite(rebuilt);
    return { changed: true, headings: 2 };
  }
}
