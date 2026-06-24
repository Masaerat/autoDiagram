import { describe, expect, it } from "vitest";
import { validateFlowSpec, type FlowSpec } from "../../../shared/flow.js";
import { flowToScene } from "../../../shared/scenePipeline.js";
import { diagramStyleIds, getStyleProfile } from "../../../shared/styleProfile.js";
import { buildDownloads, createFlowJob, jobResponse } from "../services/jobs.js";
import { renderFireworksTemplateSvg, sceneToFireworksTemplate } from "./fireworksTemplate.js";
import { renderSceneDrawio } from "./drawio.js";
import { renderSceneSvg } from "./svg.js";

const flow: FlowSpec = {
  title: "采购审批流程",
  nodes: [
    { id: "start", type: "start", label: "开始" },
    { id: "submit", type: "process", label: "提交申请" },
    { id: "check", type: "decision", label: "资料完整？" },
    { id: "approve", type: "process", label: "主管审批" },
    { id: "end", type: "end", label: "结束" }
  ],
  edges: [
    { id: "e1", from: "start", to: "submit", label: null },
    { id: "e2", from: "submit", to: "check", label: null },
    { id: "e3", from: "check", to: "approve", label: "是" },
    { id: "e4", from: "approve", to: "end", label: null }
  ],
  warnings: []
};

describe("Fireworks flowchart renderer", () => {
  it("keeps lightweight validation warnings for incomplete decisions", () => {
    expect(validateFlowSpec(flow)).toContain("判断节点“资料完整？”建议至少有两条出边。");
  });

  it("renders all 8 Fireworks styles as valid SVG shells", () => {
    for (const styleId of diagramStyleIds) {
      const scene = flowToScene(flow, styleId);
      const svg = renderSceneSvg(scene, styleId);
      const profile = getStyleProfile(styleId);

      expect(svg).toContain("<svg");
      expect(svg).toContain(profile.name === "Dark Luxury" ? "luxGlow" : profile.canvas.background);
    expect(svg).toContain(`arrow-${styleId}`);
      expect(svg).toContain("资料完整？");
    }
  });

  it("uses Origin as the default plain draw.io-like style", async () => {
    const job = await createFlowJob(flow, []);
    const response = jobResponse(job);

    expect(response.style.id).toBe("origin");
    expect(response.style.name).toBe("Origin");
    expect(response.preview.svg).toContain("<rect");
    expect(response.preview.svg).toContain("<polygon");
    expect(response.preview.svg).toContain("<path");
    expect(response.preview.svg).not.toContain("PROCESS FLOW");
    expect(response.preview.svg).not.toContain("node-title");
    expect(response.preview.svg).not.toContain("blueprint_title_block");
  });

  it("maps scenes to rich Fireworks template data", () => {
    const scene = flowToScene(flow, 5);
    const template = sceneToFireworksTemplate(flow, scene, 5);

    expect(template.template_type).toBe("flowchart");
    expect(template.containers[0].label).toBe("PROCESS WORKSPACE");
    expect(template.nodes.some((node) => node.kind === "hexagon")).toBe(true);
    expect(template.arrows.some((arrow) => arrow.source_port && arrow.target_port)).toBe(true);
    expect(template.legend.length).toBeGreaterThan(1);
  });

  it("changes structure, not only colors, across Fireworks styles", () => {
    const scene = flowToScene(flow, 1);
    const flat = sceneToFireworksTemplate(flow, scene, 1);
    const terminal = sceneToFireworksTemplate(flow, scene, 2);
    const blueprint = sceneToFireworksTemplate(flow, scene, 3);
    const notion = sceneToFireworksTemplate(flow, scene, 4);

    expect(flat.nodes.map((node) => node.kind)).not.toEqual(terminal.nodes.map((node) => node.kind));
    expect(terminal.window_controls).toBe(true);
    expect(terminal.nodes.some((node) => node.kind === "terminal")).toBe(true);
    expect(blueprint.blueprint_title_block).toBeTruthy();
    expect(notion.containers[0].label).toBe("");
  });

  it("can call the Fireworks skill template renderer for styles 1-7", async () => {
    const scene = flowToScene(flow, 1);
    const svg = await renderFireworksTemplateSvg(flow, scene, 1);

    expect(svg).toContain("<svg");
    expect(svg).toContain("Flat icon flowchart");
    expect(svg).toContain("PROCESS FLOW");
    expect(svg).toContain("node-title");
  });

  it("renders decision nodes as diamonds and routes arrows from node edges", () => {
    const scene = flowToScene(flow, 1);
    const decision = scene.nodes.find((node) => node.id === "check")!;
    const incoming = scene.edges.find((edge) => edge.to === "check")!;
    const svg = renderSceneSvg(scene, 1);

    expect(decision.type).toBe("decision_diamond");
    expect(svg).toContain("<polygon");
    expect(incoming.points.at(-1)?.y).toBe(decision.y);
    expect(incoming.points.at(-1)?.x).toBeGreaterThanOrEqual(decision.x);
    expect(incoming.points.at(-1)?.x).toBeLessThanOrEqual(decision.x + decision.w);
  });

  it("wraps long linear flows into readable columns instead of one very tall or very wide page", () => {
    const longFlow: FlowSpec = {
      title: "Long linear flow",
      nodes: [
        { id: "start", type: "start", label: "Start" },
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `step_${index + 1}`,
          type: "process" as const,
          label: `Step ${index + 1}`
        })),
        { id: "end", type: "end", label: "End" }
      ],
      edges: Array.from({ length: 9 }, (_, index) => ({
        id: `edge_${index + 1}`,
        from: index === 0 ? "start" : `step_${index}`,
        to: index === 8 ? "end" : `step_${index + 1}`,
        label: null
      })),
      warnings: []
    };
    const scene = flowToScene(longFlow, "origin");

    expect(scene.page.width).toBeGreaterThan(scene.page.height);
    expect(scene.page.height).toBeLessThan(960);
    expect(scene.page.width).toBeLessThan(1400);

    const template = sceneToFireworksTemplate(longFlow, scene, 1);
    const templateColumns = new Set(template.nodes.map((node) => node.x));
    expect(template.height).toBeLessThan(980);
    expect(templateColumns.size).toBeGreaterThan(1);
  });

  it("sizes long labels so text has room inside nodes", () => {
    const longLabelFlow: FlowSpec = {
      title: "Long labels",
      nodes: [
        { id: "start", type: "start", label: "Start" },
        { id: "review", type: "process", label: "收集客户提交的营业执照法人身份证和授权委托书并完成一致性核验" },
        { id: "check", type: "decision", label: "资料是否完整且关键字段一致" },
        { id: "end", type: "end", label: "End" }
      ],
      edges: [
        { id: "e1", from: "start", to: "review", label: null },
        { id: "e2", from: "review", to: "check", label: null },
        { id: "e3", from: "check", to: "end", label: "是" }
      ],
      warnings: []
    };

    const scene = flowToScene(longLabelFlow, "origin");
    const reviewNode = scene.nodes.find((node) => node.id === "review")!;
    const checkNode = scene.nodes.find((node) => node.id === "check")!;

    expect(reviewNode.w).toBeGreaterThan(228);
    expect(reviewNode.h).toBeGreaterThan(78);
    expect(checkNode.w).toBeGreaterThan(158);

    const template = sceneToFireworksTemplate(longLabelFlow, scene, 1);
    const reviewTemplateNode = template.nodes.find((node) => node.id === "review")!;
    expect(reviewTemplateNode.width).toBeGreaterThan(228);
    expect(reviewTemplateNode.height).toBeGreaterThan(78);
    expect(reviewTemplateNode.sublabel).toBeTruthy();
  });

  it("falls back to Flat Icon for invalid style ids", async () => {
    const job = await createFlowJob(flow, [], 999);
    const response = jobResponse(job);

    expect(response.style.id).toBe("origin");
    expect(response.style.name).toBe("Origin");
  });

  it("returns deterministic jobs without optimization iterations", async () => {
    const job = await createFlowJob(flow, [], 8);
    const downloads = buildDownloads(job);
    const response = jobResponse(job);

    expect(response.rendererMode).toBe("svg_drawio");
    expect(response.style.name).toBe("Dark Luxury");
    expect(response.iterations).toHaveLength(0);
    expect(downloads.svg.content).toContain("<svg");
    expect(downloads.svg.content).toContain("luxGlow");
    expect(downloads.drawio.content).toContain("<mxfile");
    expect(Object.keys(response.downloads)).not.toContain("visio");
  });

  it("stores skill-generated SVG for built-in template styles", async () => {
    const job = await createFlowJob(flow, [], 1);
    const response = jobResponse(job);

    expect(response.preview.svg).toContain("Flat icon flowchart");
    expect(response.preview.svg).toContain("PROCESS FLOW");
  });

  it("syncs Draw.io export with selected style colors", () => {
    const scene = flowToScene(flow, 7);
    const drawio = renderSceneDrawio(scene, flow.title, 7);

    expect(drawio).toContain("strokeColor=#10a37f");
    expect(drawio).toContain("background=\"#ffffff\"");
  });
});
