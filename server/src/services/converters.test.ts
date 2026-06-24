import { describe, expect, it } from "vitest";
import { drawioImageToMermaid, drawioToMermaid, mermaidToDrawio } from "./converters.js";

const mermaid = `flowchart TD
  start((开始)) --> submit[提交申请]
  submit --> check{资料完整？}
  check -->|是| approve[主管审批]
  check -->|否| supplement[补充资料]`;

describe("diagram format converters", () => {
  it("converts basic Mermaid flowcharts to uncompressed Draw.io XML", () => {
    const result = mermaidToDrawio(mermaid);

    expect(result.drawio).toContain("<mxfile");
    expect(result.drawio).toContain("提交申请");
    expect(result.drawio).toContain("edgeStyle=orthogonalEdgeStyle");
    expect(result.nodeCount).toBeGreaterThanOrEqual(5);
    expect(result.edgeCount).toBe(4);
  });

  it("lays out Mermaid nodes on aligned graph ranks instead of a single straight line", () => {
    const result = mermaidToDrawio(`flowchart TD
      A((Start)) --> B[Collect]
      B --> C{Valid?}
      C -->|Yes| D[Approve]
      C -->|No| E[Fix]
      D --> F((End))
      E --> B`);
    const geometries = Array.from(result.drawio.matchAll(/<mxGeometry x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)" as="geometry"/g));
    const xs = new Set(geometries.map((match) => match[1]));
    const ys = new Set(geometries.map((match) => match[2]));

    expect(geometries.length).toBeGreaterThanOrEqual(6);
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
    expect(result.drawio).toContain("<Array as=\"points\">");
  });

  it("preserves standard Mermaid decision labels and quoted node text", () => {
    const result = mermaidToDrawio(`flowchart TD
      start((Start)) --> input["Collect form"]
      input --> check{"Ready?"}
      check -->|Yes| approve["Approve"]
      check -- No --> fix["Fix data"]
      fix --> check`);

    expect(result.nodeCount).toBe(5);
    expect(result.edgeCount).toBe(5);
    expect(result.drawio).toContain('value="Ready?"');
    expect(result.drawio).toContain('value="Yes"');
    expect(result.drawio).toContain('value="No"');
    expect(result.drawio).not.toContain('value="&quot;Collect form&quot;"');
  });

  it("parses multiple Mermaid statements on one line", () => {
    const result = mermaidToDrawio("flowchart TD; A[Start] --> B{Ready?}; B -->|Yes| C[Ship]; B -->|No| D[Fix]");

    expect(result.nodeCount).toBe(4);
    expect(result.edgeCount).toBe(3);
    expect(result.drawio).toContain('value="Ready?"');
    expect(result.drawio).toContain('value="No"');
  });

  it("converts Draw.io XML back to Mermaid", () => {
    const drawio = mermaidToDrawio(mermaid).drawio;
    const result = drawioToMermaid(drawio);

    expect(result.mermaid).toContain("flowchart TD");
    expect(result.mermaid).toContain('submit["提交申请"]');
    expect(result.mermaid).toContain("check -->|是| approve");
    expect(result.nodeCount).toBeGreaterThanOrEqual(5);
    expect(result.edgeCount).toBe(4);
  });

  it("converts uploaded .drawio file contents back to Mermaid", () => {
    const drawioFileContent = mermaidToDrawio(`flowchart TD
      upload[Upload .drawio] --> parse[Parse mxfile]
      parse --> output[Mermaid code]`).drawio;
    const result = drawioToMermaid(drawioFileContent);

    expect(result.mermaid).toContain('upload["Upload .drawio"]');
    expect(result.mermaid).toContain("upload --> parse");
    expect(result.nodeCount).toBe(3);
    expect(result.edgeCount).toBe(2);
  });

  it("converts Draw.io SVG images with embedded mxfile data back to Mermaid", () => {
    const drawio = mermaidToDrawio(`flowchart TD
      A[Submit] --> B{Ready?}
      B -->|Yes| C[Ship]`).drawio;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><metadata>${drawio.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</metadata></svg>`;
    const result = drawioImageToMermaid(svg);

    expect(result.mermaid).toContain("flowchart TD");
    expect(result.mermaid).toContain('A["Submit"]');
    expect(result.mermaid).toContain("B -->|Yes| C");
  });
});
