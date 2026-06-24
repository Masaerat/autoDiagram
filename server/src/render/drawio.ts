import type { LayoutResult } from "../../../shared/flow.js";
import type { DiagramScene, DiagramSceneEdge, DiagramSceneNode } from "../../../shared/scene.js";
import { flowToScene } from "../../../shared/scenePipeline.js";
import { defaultDiagramStyleId, getStyleProfile, type DiagramStyleId } from "../../../shared/styleProfile.js";
import { escapeXml } from "./xml.js";

function drawioColor(value: string, fallback: string): string {
  return value.startsWith("#") ? value : fallback;
}

function styleForNode(node: DiagramSceneNode, styleId?: DiagramStyleId): string {
  const profile = getStyleProfile(styleId);
  const fill = drawioColor(node.style.fill, profile.dark ? "#111827" : "#ffffff").replace("#", "");
  const stroke = drawioColor(node.style.line, profile.edges.stroke).replace("#", "");
  const text = drawioColor(node.style.text_color, profile.typography.textColor).replace("#", "");
  const strokeWidth = Math.max(1, Math.round(node.style.line_weight_pt));

  if (node.type === "decision_diamond") {
    return `rhombus;whiteSpace=wrap;html=1;fillColor=#${fill};strokeColor=#${stroke};strokeWidth=${strokeWidth};fontColor=#${text};fontStyle=1;`;
  }

  const arcSize = node.flowType === "start" || node.flowType === "end" ? 50 : Math.max(6, Math.round((node.style.rounding_px / node.h) * 100));
  return `rounded=1;whiteSpace=wrap;html=1;arcSize=${arcSize};fillColor=#${fill};strokeColor=#${stroke};strokeWidth=${strokeWidth};fontColor=#${text};fontStyle=1;`;
}

function edgeGeometry(edge: DiagramSceneEdge): string {
  if (edge.points.length <= 2) {
    return '<mxGeometry relative="1" as="geometry" />';
  }

  const waypoints = edge.points
    .slice(1, -1)
    .map((point) => `<mxPoint x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}" />`)
    .join("");
  return `<mxGeometry relative="1" as="geometry"><Array as="points">${waypoints}</Array></mxGeometry>`;
}

export function renderSceneDrawio(scene: DiagramScene, title = scene.metadata.title, styleId?: DiagramStyleId): string {
  const profile = getStyleProfile(styleId ?? scene.metadata.style_profile);
  const cells: string[] = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />'];

  for (const node of scene.nodes) {
    cells.push(
      `<mxCell id="${escapeXml(node.id)}" value="${escapeXml(node.text)}" style="${styleForNode(node, profile.id)}" vertex="1" parent="1"><mxGeometry x="${node.x.toFixed(1)}" y="${node.y.toFixed(1)}" width="${node.w.toFixed(1)}" height="${node.h.toFixed(1)}" as="geometry" /></mxCell>`
    );
  }

  for (const edge of scene.edges) {
    const value = edge.text ? escapeXml(edge.text) : "";
    const edgeColor = drawioColor(edge.style.line, profile.edges.stroke);
    const labelColor = drawioColor(edge.style.label_color, profile.edges.label);
    cells.push(
      `<mxCell id="${escapeXml(edge.id)}" value="${value}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;strokeColor=${edgeColor};strokeWidth=${profile.edges.width};fontColor=${labelColor};fontStyle=1;" edge="1" parent="1" source="${escapeXml(edge.from)}" target="${escapeXml(edge.to)}">${edgeGeometry(edge)}</mxCell>`
    );
  }

  return `<mxfile host="AutoDiagram" agent="auto-diagram" version="0.3.0">
  <diagram id="flow" name="${escapeXml(title)}">
    <mxGraphModel dx="${scene.page.width}" dy="${scene.page.height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${scene.page.width}" pageHeight="${scene.page.height}" background="${profile.canvas.background}" math="0" shadow="${profile.effects.shadow ? 1 : 0}">
      <root>
        ${cells.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

export function renderDrawio(layout: LayoutResult, title = "流程图"): string {
  return renderSceneDrawio(
    flowToScene(
      {
        title,
        nodes: layout.nodes.map((node) => ({ id: node.id, type: node.type, label: node.label })),
        edges: layout.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to, label: edge.label })),
        warnings: []
      },
      defaultDiagramStyleId
    ),
    title,
    defaultDiagramStyleId
  );
}
