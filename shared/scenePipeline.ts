import type { FlowSpec } from "./flow.js";
import { layoutFlow } from "./layout.js";
import type { DiagramScene, DiagramSceneEdge, DiagramSceneNode, ScenePoint } from "./scene.js";
import { getStyleProfile, styleForNodeType, type DiagramStyleId } from "./styleProfile.js";

function sceneNodeType(flowType: DiagramSceneNode["flowType"]): DiagramSceneNode["type"] {
  if (flowType === "decision") return "decision_diamond";
  if (flowType === "start" || flowType === "end") return "terminator";
  return "rounded_process";
}

function routeFromPoints(points: ScenePoint[]): DiagramSceneEdge["route"] {
  if (points.length <= 2) {
    const [a, b] = points;
    if (a && b && Math.abs(a.x - b.x) < 1) return "vertical";
    if (a && b && Math.abs(a.y - b.y) < 1) return "horizontal";
    return "straight";
  }
  return "orthogonal";
}

export function flowToScene(flow: FlowSpec, styleId?: DiagramStyleId): DiagramScene {
  const profile = getStyleProfile(styleId);
  const layout = layoutFlow(flow, profile.id);

  return {
    version: "0.2",
    metadata: {
      title: flow.title,
      created_by: "auto-diagram",
      style_profile: profile.id,
      fidelity: "semantic",
      render_engine: "svg_drawio",
      notes: ["Fireworks Tech Graph flowchart renderer: deterministic SVG and Draw.io output."]
    },
    page: {
      width: layout.width,
      height: layout.height,
      units: "px",
      origin: "top-left",
      target_width_in: 11,
      background: profile.canvas.background
    },
    nodes: layout.nodes.map((node) => {
      const style = styleForNodeType(node.type, profile);
      return {
        id: node.id,
        type: sceneNodeType(node.type),
        flowType: node.type,
        x: node.x,
        y: node.y,
        w: node.width,
        h: node.height,
        text: node.label,
        style: {
          fill: style.fill,
          line: style.stroke,
          text_color: style.text,
          font_family: profile.typography.fontFamily,
          font_role: "cjk_sans",
          font_size_pt: profile.typography.fontSize,
          line_weight_pt: style.strokeWidth,
          rounding_px: style.radius
        }
      } satisfies DiagramSceneNode;
    }),
    edges: layout.edges.map((edge) => ({
      id: edge.id,
      type: "arrow_connector",
      from: edge.from,
      to: edge.to,
      text: edge.label,
      route: routeFromPoints(edge.points),
      points: edge.points,
      style: {
        line: profile.edges.stroke,
        label_color: profile.edges.label,
        line_weight_pt: profile.edges.width,
        end_arrow: "triangle",
        arrow_size: profile.edges.arrowSize
      }
    })),
    assets: []
  };
}

export function sceneSummary(scene: DiagramScene) {
  return {
    title: scene.metadata.title,
    nodeCount: scene.nodes.length,
    edgeCount: scene.edges.length,
    score: 100
  };
}
