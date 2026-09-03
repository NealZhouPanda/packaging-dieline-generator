import { create0201Topology } from "./topology0201.js";
import { create0421Topology } from "./topology0421.js";
import { createE005CTopology } from "./topologyE005C.js";
import { createK016ATopology } from "./topologyK016A.js";
import { createC001GXTopology } from "./topologyC001GX.js";

const TOPOLOGY_BUILDERS = Object.freeze({
  "0201": create0201Topology,
  "0421": create0421Topology,
  E005C: createE005CTopology,
  K016A: createK016ATopology,
  C001GX: createC001GXTopology,
});

export function supportsBoxTopology(boxId) {
  return Object.hasOwn(TOPOLOGY_BUILDERS, String(boxId || ""));
}

export function phaseAngleAt(phaseAngles, progress, maxSteps = phaseAngles?.length || 1) {
  if (!phaseAngles?.length) return 0;
  const percent = Math.min(1, Math.max(0, Number(progress) || 0));
  const stepCount = Math.max(Number(maxSteps) || 0, phaseAngles.length) - 1;
  if (percent <= 0 || phaseAngles.length === 1) return phaseAngles[0];
  if (percent >= 1) return phaseAngles.at(-1);
  const cursor = stepCount * percent;
  const index = Math.floor(cursor);
  if (index >= phaseAngles.length - 1) return phaseAngles.at(-1);
  return phaseAngles[index] + (cursor - index) * (phaseAngles[index + 1] - phaseAngles[index]);
}

export function planeRuleFor(piece) {
  const rule = piece?.foldRule || {};
  return {
    parentId: rule.parentId ?? null,
    sourceLine: rule.sourceLine ?? null,
    phaseAngles: rule.phaseAngles?.length ? [...rule.phaseAngles] : [0],
  };
}

export function validateBoxTopology(topology) {
  if (!topology?.boxId || !Array.isArray(topology.pieces) || !topology.pieces.length) {
    throw new RangeError("盒形拓扑缺少 boxId 或面数据");
  }
  const ids = new Set();
  for (const piece of topology.pieces) {
    if (!piece.id || ids.has(piece.id)) throw new RangeError(`盒形拓扑面 ID 重复或为空: ${piece.id || "(empty)"}`);
    ids.add(piece.id);
    if (!piece.netRect && !piece.netPoints?.length) throw new RangeError(`盒形拓扑面 ${piece.id} 缺少轮廓`);
  }
  const roots = topology.pieces.filter((piece) => !planeRuleFor(piece).parentId);
  if (roots.length !== 1) throw new RangeError(`盒形拓扑必须有且只有一个根面，当前为 ${roots.length}`);
  for (const piece of topology.pieces) {
    const { parentId, sourceLine } = planeRuleFor(piece);
    if (parentId && !ids.has(parentId)) throw new RangeError(`盒形拓扑面 ${piece.id} 引用了不存在的父面 ${parentId}`);
    if (parentId && !sourceLine) throw new RangeError(`盒形拓扑面 ${piece.id} 缺少折叠轴`);
  }
  return topology;
}

export function createBoxTopology(geometry) {
  const boxId = geometry?.meta?.boxId || geometry?.parameters?.boxType;
  const builder = TOPOLOGY_BUILDERS[boxId];
  if (!builder) throw new RangeError(`盒形 ${boxId || "(unknown)"} 尚未接入贴图与 3D 协议`);
  return validateBoxTopology(builder(geometry));
}
