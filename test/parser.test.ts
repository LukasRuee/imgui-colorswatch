import * as assert from "assert";
import {
  findImVec4Matches,
  detectFormat,
  toRGBA,
  formatComponent,
  formatArgList,
} from "../src/parser";

describe("parser: findImVec4Matches", () => {
  it("detects constructor-style ImVec4(x, y, z, w)", () => {
    const text = "ImVec4 col = ImVec4(1.0f, 0.5f, 0.0f, 1.0f);";
    const matches = findImVec4Matches(text);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].bracket, "(");
    assert.strictEqual(matches[0].originalFormat, "float");
    const rgba = toRGBA(matches[0]);
    assert.strictEqual(rgba.r, 1);
    assert.strictEqual(rgba.g, 0.5);
    assert.strictEqual(rgba.a, 1);
  });

  it("detects brace-init ImVec4{ x, y, z, w }", () => {
    const text = "auto c = ImVec4{0.2f, 0.4f, 0.6f, 0.8f};";
    const matches = findImVec4Matches(text);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].bracket, "{");
    assert.strictEqual(matches[0].originalFormat, "float");
  });

  it("detects declaration form ImVec4 var = { x, y, z, w };", () => {
    const text = "ImVec4 buttonColor = { 255, 128, 0, 255 };";
    const matches = findImVec4Matches(text);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].bracket, "{");
    assert.strictEqual(matches[0].originalFormat, "int");
    const rgba = toRGBA(matches[0]);
    assert.ok(Math.abs(rgba.r - 1) < 1e-6);
    assert.ok(Math.abs(rgba.g - 128 / 255) < 1e-6);
  });

  it("treats integer 0-255 values as int format", () => {
    const text = "ImVec4(255, 0, 0, 255)";
    const matches = findImVec4Matches(text);
    assert.strictEqual(matches[0].originalFormat, "int");
  });

  it("treats bare 0/1 integers as float (ImGui shorthand) by default", () => {
    const text = "ImVec4(1, 0, 0, 1)";
    const matches = findImVec4Matches(text);
    assert.strictEqual(matches[0].originalFormat, "float");
    const rgba = toRGBA(matches[0]);
    assert.strictEqual(rgba.r, 1);
    assert.strictEqual(rgba.b, 0);
  });

  it("handles variable whitespace and no 'f' suffix", () => {
    const text = "ImVec4(   1.0 ,0.5,0.25   ,1  )";
    const matches = findImVec4Matches(text);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].originalFormat, "float");
  });

  it("handles a trailing comma before the closing bracket", () => {
    const text = "ImVec4{1.0f, 0.0f, 0.0f, 1.0f,}";
    const matches = findImVec4Matches(text);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].hasTrailingComma, true);
  });

  it("finds multiple matches on a single line", () => {
    const text = "col1 = ImVec4(1,0,0,1); col2 = ImVec4{0,1,0,1};";
    const matches = findImVec4Matches(text);
    assert.strictEqual(matches.length, 2);
    assert.strictEqual(matches[0].bracket, "(");
    assert.strictEqual(matches[1].bracket, "{");
  });

  it("finds matches across multiple lines in a larger document", () => {
    const text = [
      "// style palette",
      "static const ImVec4 kWarning = ImVec4(1.0f, 0.65f, 0.0f, 1.0f);",
      "static const ImVec4 kError   = ImVec4(0.9f, 0.1f, 0.1f, 1.0f);",
      "ImGui::PushStyleColor(ImGuiCol_Button, ImVec4{50, 50, 50, 255});",
    ].join("\n");
    const matches = findImVec4Matches(text);
    assert.strictEqual(matches.length, 3);
  });

  it("does not match unrelated identifiers containing ImVec4-like substrings", () => {
    const text = "MyImVec4Wrapper foo; NotImVec4(1,2,3,4);";
    const matches = findImVec4Matches(text);
    // Neither "MyImVec4Wrapper" nor "NotImVec4(...)" should match because of
    // the \b word boundary anchoring on the literal token "ImVec4".
    assert.strictEqual(matches.length, 0);
  });

  it("does not match a bare ImVec4 with no argument list", () => {
    const text = "ImVec4 color; // declared, not initialized with a literal";
    const matches = findImVec4Matches(text);
    assert.strictEqual(matches.length, 0);
  });

  it("computes correct component offsets for in-place editing", () => {
    const text = "x = ImVec4(1.0f, 0.5f, 0.25f, 1.0f);";
    const [m] = findImVec4Matches(text);
    assert.strictEqual(text.slice(m.start, m.end), "(1.0f, 0.5f, 0.25f, 1.0f)");
    assert.strictEqual(m.components[0].raw, "1.0f");
    assert.strictEqual(text.slice(m.components[1].start, m.components[1].end), "0.5f");
  });
});

describe("parser: detectFormat", () => {
  it("flags any decimal point as float", () => {
    assert.strictEqual(detectFormat(["0.0", "0", "0", "1"]), "float");
  });
  it("flags any f-suffix as float", () => {
    assert.strictEqual(detectFormat(["0f", "0", "0", "1"]), "float");
  });
  it("flags values above 1 with no decimal as int", () => {
    assert.strictEqual(detectFormat(["200", "10", "0", "255"]), "int");
  });
  it("defaults ambiguous bare 0/1 ints to float", () => {
    assert.strictEqual(detectFormat(["1", "1", "0", "1"]), "float");
  });
});

describe("parser: formatComponent / formatArgList", () => {
  it("formats float components with two decimals and an f suffix", () => {
    assert.strictEqual(formatComponent(0.5, "float"), "0.50f");
    assert.strictEqual(formatComponent(1, "float"), "1.00f");
  });

  it("formats int components as rounded 0-255 values", () => {
    assert.strictEqual(formatComponent(1, "int"), "255");
    assert.strictEqual(formatComponent(0.5, "int"), "128");
  });

  it("rebuilds an arg list preserving parens and no trailing comma", () => {
    const [m] = findImVec4Matches("ImVec4(1.0f, 0.0f, 0.0f, 1.0f)");
    const text = formatArgList(m, { r: 0, g: 1, b: 0, a: 1 }, "float", true);
    assert.strictEqual(text, "(0.00f, 1.00f, 0.00f, 1.00f)");
  });

  it("rebuilds an arg list preserving braces and a trailing comma", () => {
    const [m] = findImVec4Matches("ImVec4{255, 0, 0, 255,}");
    const text = formatArgList(m, { r: 0, g: 0, b: 1, a: 1 }, "int", true);
    assert.strictEqual(text, "{0, 0, 255, 255,}");
  });

  it("leaves alpha component from the original color when showAlpha is false", () => {
    const [m] = findImVec4Matches("ImVec4(1.0f, 0.0f, 0.0f, 0.4f)");
    // showAlpha=false: alpha is taken from the *original* parsed value (0.4),
    // not from whatever the picker's color.alpha happened to be (here 1.0).
    const text = formatArgList(m, { r: 0, g: 0, b: 0, a: 1.0 }, "float", false);
    assert.strictEqual(text, "(0.00f, 0.00f, 0.00f, 0.40f)");
  });
});
