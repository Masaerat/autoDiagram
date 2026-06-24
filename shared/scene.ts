import type { FlowNodeType, ReviewFinding } from "./flow.js";
import type { DiagramStyleId } from "./styleProfile.js";

export type SceneNodeType = "terminator" | "rounded_process" | "decision_diamond" | "junction_point";
export type SceneEdgeType = "arrow_connector" | "dynamic_connector" | "join_connector" | "fork_connector";
export type SceneRoute = "straight" | "orthogonal" | "horizontal" | "vertical";

export type ScenePoint = { x: number; y: number };

export type DiagramSceneNode = {
  id: string;
  type: SceneNodeType;
  flowType: FlowNodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  style: {
    fill: string;
    line: string;
    text_color: string;
    font_family: string;
    font_role: "cjk_sans" | "ui_sans";
    font_size_pt: number;
    line_weight_pt: number;
    rounding_px: number;
  };
};

export type DiagramSceneEdge = {
  id: string;
  type: SceneEdgeType;
  from: string;
  to: string;
  text: string | null;
  route: SceneRoute;
  points: ScenePoint[];
  style: {
    line: string;
    label_color: string;
    line_weight_pt: number;
    end_arrow: "triangle";
    arrow_size: "small" | "medium";
  };
};

export type DiagramScene = {
  version: "0.2";
  metadata: {
    title: string;
    created_by: "auto-diagram";
    style_profile: DiagramStyleId;
    fidelity: "semantic";
    render_engine: "svg_drawio";
    notes: string[];
  };
  page: {
    width: number;
    height: number;
    units: "px";
    origin: "top-left";
    target_width_in: number;
    background: string;
  };
  nodes: DiagramSceneNode[];
  edges: DiagramSceneEdge[];
  assets: [];
};

export type SceneEvaluation = {
  score: number;
  findings: ReviewFinding[];
};
