import { buildGeometryMeta, roundMm, validateStandardParameters } from "./geometry/core.js";

const round2 = (value) => Math.round(value * 100) / 100;

function computeC001GXParams(length, width, depth, caliper, tongueStyle = 2) {
  const inner = round2((caliper * 2) / 3);
  const outer = round2(caliper / 3);
  const r = caliper / 2;
  const x = caliper + 3;
  const w1 = roundMm(width - caliper + outer);
  const w2 = roundMm(width - caliper);
  const c = Math.min(20, depth - 34);
  const a = roundMm(width / 2 + c / 2 - r);
  const y = r + 3;
  const x1 = caliper;
  const x2 = 5;
  const y1 = 10;
  const lockCutWidth = caliper + 10;
  const x3 = tongueStyle === 1 ? 0 : lockCutWidth;
  const y2 = tongueStyle === 1 ? 0 : caliper;
  const y3 = tongueStyle === 1 ? 0 : 1;
  const ar = Math.floor(a / 4);
  const cr = c / 2;
  const h = width / 2;
  const h1 = Math.ceil(length / 4);
  const h2 = Math.floor(width / 5);
  const hr = Math.floor(width / 20);
  const sw1 = h1;
  const f = Math.min(20, depth / 5);
  const fr = Math.min(5, c / 4);
  const sw = sw1 + 1;
  const sr = 5;
  const sd = roundMm(caliper * 1.5);
  const t2 = 49.79218 + 1.168335 * (caliper - 3);
  const t3 = 37.4182 + 0.36 * (length - 300) - 0.138 * (width - 200) + 0.23 * (caliper - 3);
  const t4 = 53.81767 - 0.36 * (length - 300) + 0.135 * (width - 200) + 0.23 * (caliper - 3);

  return {
    l: length,
    w: width,
    d: depth,
    cal: caliper,
    sty13: Number(tongueStyle) || 2,
    inner,
    outer,
    r,
    x,
    w1,
    w2,
    c,
    a,
    y,
    x1,
    x2,
    y1,
    x3,
    y2,
    y3,
    ar,
    cr,
    h,
    h1,
    h2,
    hr,
    sw1,
    f,
    fr,
    sw,
    sr,
    sd,
    t2,
    t3,
    t4,
  };
}

function arcPoint(cx, cy, radius, degrees) {
  const angle = (degrees * Math.PI) / 180;
  return [roundMm(cx + radius * Math.cos(angle)), roundMm(cy + radius * Math.sin(angle))];
}

function arcPointNeg(cx, cy, radius, degrees) {
  return arcPoint(cx, cy, radius, -degrees);
}

function buildC001GXElements(p) {
  const {
    l, w, d, cal, sty13, r, x, w1, w2, a, y, x2, y1, x3, y3,
    ar, cr, h, h1, h2, hr, sw1, fr, sw, sr, sd, t2, t3, t4,
  } = p;

  const bodyBottom = roundMm(d - cal);
  const glueBottom = roundMm(d - y);
  const v1 = arcPointNeg(0, bodyBottom, r, 90 + t3);
  const v2 = arcPointNeg(l, bodyBottom, r, 90 - t3);
  const v3 = arcPointNeg(-l - w, bodyBottom, r, 90 - t4);
  const v4 = arcPointNeg(-w, bodyBottom, r, 90 + t4);

  const lockLeft = roundMm(-l - w + (l - sw1) / 2);
  const lockRight = roundMm(lockLeft + sw1);
  const dustLeftCx = roundMm(-w2 + a * 0.4 + r / 4);
  const dustRightCx = roundMm(l + w2 - a * 0.4 - r / 4);
  const midX = l / 2;
  const notchLeft = roundMm(midX - sw / 2);
  const notchRight = roundMm(midX + sw / 2);
  const bottomOuterY = roundMm(bodyBottom + w * 0.7);
  const sideDrop = w <= 180 && cal >= 5 ? 40 : w < 180 ? 15 : 25 + Math.max(0, d - 200) * 0.05;
  const sideBottomY = roundMm(bottomOuterY - sideDrop);
  const sideArcCy = roundMm(sideBottomY - hr);
  const sideSlopeY = roundMm(sideArcCy - h2 + hr);
  const backArcCy = roundMm(bottomOuterY - hr);
  const backInnerY = roundMm(bottomOuterY - hr - h2 + 10);
  const leftClearX = roundMm(-Math.abs(v1[0]) - 1.56);
  const rightClearX = roundMm(l + Math.abs(v1[0]) + 1.56);

  const elements = [
    [0, 1, 0, -r, 0, glueBottom],
    [0, 1, l, -r, l, glueBottom],
    [0, 1, roundMm(l - r), bodyBottom, r, bodyBottom],
    [0, 1, 0, -cal, l, -cal],
    [0, 0, 0, -r, 0, -cal],
    [0, 0, l, -r, l, -cal],
    [1, 0, 0, bodyBottom, r, 0, 90],
    [1, 0, l, bodyBottom, r, 90, 180],
    [0, 1, -w, 0, -w, glueBottom],
    [0, 1, -w2, 0, -r, 0],
    [0, 1, roundMm(-w + r), bodyBottom, leftClearX, bodyBottom],
    [1, 0, -r, -r, r, 270, 0],
    [0, 0, -w, 0, -w2, 0],
    [1, 0, -w, bodyBottom, r, 0, 90],
    [1, 0, 0, bodyBottom, r, 90, roundMm(90 + t3)],
    [0, 0, leftClearX, bodyBottom, v1[0], v1[1]],
    [0, 1, roundMm(l + r), 0, roundMm(l + w2), 0],
    [0, 1, rightClearX, bodyBottom, roundMm(l + w1), bodyBottom],
    [1, 0, roundMm(l + r), -r, r, 180, 270],
    [0, 0, roundMm(l + w2), 0, roundMm(l + w1), 0],
    [0, 0, roundMm(l + w1), 0, roundMm(l + w1), bodyBottom],
    [1, 0, l, bodyBottom, r, roundMm(90 - t3), 90],
    [0, 0, v2[0], v2[1], rightClearX, bodyBottom],
    [0, 1, roundMm(-l - w), 0, roundMm(-l - w), glueBottom],
    [0, 0, roundMm(-l - w), 0, lockLeft, 0],
    [0, 0, lockRight, 0, -w, 0],
    [0, 0, lockLeft, 0, lockLeft, 10],
    [0, 0, lockRight, 0, lockRight, 10],
    [0, 1, lockLeft, 10, lockRight, 10],
    [0, 1, roundMm(-l - w + Math.abs(v3[0] + l + w)), bodyBottom, roundMm(-w - Math.abs(v4[0] + w)), bodyBottom],
    [1, 0, roundMm(-l - w), bodyBottom, r, roundMm(90 - t4), 90],
    [0, 0, roundMm(-l - w + Math.abs(v3[0] + l + w)), bodyBottom, v3[0], v3[1]],
    [1, 0, -w, bodyBottom, r, 90, roundMm(90 + t4)],
    [0, 0, roundMm(-w - Math.abs(v4[0] + w)), bodyBottom, v4[0], v4[1]],
    [
      2, 0, -w2, 0, -w2, -y1, roundMm(-w2 + x2), -y1 - x2,
      roundMm(dustLeftCx + ar * Math.cos((-170 * Math.PI) / 180)),
      roundMm(-a + ar + ar * Math.sin((-170 * Math.PI) / 180)),
    ],
    [1, 0, dustLeftCx, roundMm(-a + ar), ar, 90, 170],
    [2, 0, dustLeftCx, -a, -x, -a, -x, -y, roundMm(-r - x + 4.85), roundMm(-r + 0.97)],
    [1, 0, -r, -r, r, roundMm(270 - t2), 270],
    [
      2, 0, roundMm(l + w2), 0, roundMm(l + w2), -y1, roundMm(l + w2 - x2), -y1 - x2,
      roundMm(dustRightCx + ar * Math.cos((-10 * Math.PI) / 180)),
      roundMm(-a + ar + ar * Math.sin((-10 * Math.PI) / 180)),
    ],
    [1, 0, dustRightCx, roundMm(-a + ar), ar, 10, 90],
    [2, 0, dustRightCx, -a, roundMm(l + x), -a, roundMm(l + x), -y, roundMm(l + r + x - 4.85), roundMm(-r + 0.97)],
    [1, 0, roundMm(l + r), -r, r, 270, roundMm(270 + t2)],
    [0, 0, roundMm(-l - w), 0, roundMm(-l - w - 25), 6.7],
    [0, 0, roundMm(-l - w), glueBottom, roundMm(-l - w - 25), roundMm(glueBottom - 6.7)],
    [0, 0, roundMm(-l - w - 25), 6.7, roundMm(-l - w - 25), roundMm(glueBottom - 6.7)],
  ];

  if (sty13 === 1) {
    elements.push(
      [0, 0, 0, -cal, 0, -w],
      [0, 0, 0, -w, r, -w],
      [0, 0, l, -cal, l, -w],
      [0, 0, l, -w, roundMm(l - r), -w],
      [0, 0, notchLeft, -w, roundMm(midX - fr), -w],
      [0, 0, notchRight, -w, roundMm(midX + fr), -w],
      [1, 0, midX, -w, sr, 180, 0],
      [0, 1, 0, -w, notchLeft, -w],
      [0, 1, l, -w, notchRight, -w],
      [0, 0, r, -w, 0, -w],
      [0, 0, roundMm(l - r), -w, l, -w],
      [2, 0, notchLeft, -w, notchLeft, roundMm(-w - sd), notchRight, roundMm(-w - sd), notchRight, -w],
    );
  } else {
    elements.push(
      [0, 0, 0, -cal, 0, roundMm(-w - cal)],
      [0, 0, 0, roundMm(-w - cal), r, roundMm(-w - cal)],
      [0, 0, x3, -w, x3, roundMm(-w + y3)],
      [0, 0, l, -cal, l, roundMm(-w - cal)],
      [0, 0, l, roundMm(-w - cal), roundMm(l - r), roundMm(-w - cal)],
      [0, 0, roundMm(l - x3), -w, roundMm(l - x3), roundMm(-w + y3)],
      [0, 0, notchLeft, -w, roundMm(midX - fr), -w],
      [0, 0, notchRight, -w, roundMm(midX + fr), -w],
      [1, 0, midX, -w, sr, 180, 0],
      [0, 1, x3, -w, notchLeft, -w],
      [0, 1, roundMm(l - x3), -w, notchRight, -w],
      [0, 0, r, roundMm(-w - cal), 10, roundMm(-w - cal)],
      [1, 0, 10, -w, cal, 0, 90],
      [0, 0, roundMm(l - r), roundMm(-w - cal), roundMm(l - 10), roundMm(-w - cal)],
      [1, 0, roundMm(l - 10), -w, cal, 90, 180],
      [2, 0, notchLeft, -w, notchLeft, roundMm(-w - sd), notchRight, roundMm(-w - sd), notchRight, -w],
    );
  }

  const tongueStepY = roundMm(-w - cal - 3.2);
  const tongueArcY = roundMm(-w - cr);
  const tongueRootY = roundMm(sty13 === 1 ? -w : -w - cal);
  if (tongueArcY < tongueStepY - 0.001) {
    elements.push(
      [0, 0, r, tongueRootY, r, tongueStepY],
      [0, 0, r, tongueStepY, r, tongueArcY],
      [1, 0, roundMm(r + cr), tongueArcY, cr, 90, 180],
      [0, 0, roundMm(r + cr), roundMm(tongueArcY - cr), roundMm(l - r - cr), roundMm(tongueArcY - cr)],
      [1, 0, roundMm(l - r - cr), tongueArcY, cr, 0, 90],
      [0, 0, roundMm(l - r), tongueArcY, roundMm(l - r), tongueStepY],
      [0, 0, roundMm(l - r), tongueStepY, roundMm(l - r), tongueRootY],
    );
  } else {
    elements.push(
      [0, 0, r, tongueRootY, r, tongueStepY],
      [1, 0, roundMm(r + cr), tongueStepY, cr, 90, 180],
      [0, 0, roundMm(r + cr), roundMm(tongueStepY - cr), roundMm(l - r - cr), roundMm(tongueStepY - cr)],
      [1, 0, roundMm(l - r - cr), tongueStepY, cr, 0, 90],
      [0, 0, roundMm(l - r), tongueStepY, roundMm(l - r), tongueRootY],
    );
  }

  const lockTabDrop = d > 150 ? 15 : 6;
  const lockTabRadius = d > 150 ? 5 : 4;
  const lockTabBottom = d > 150 ? 20 : 10;

  elements.push(
    [0, 0, r, bodyBottom, r, bottomOuterY],
    [0, 0, r, bottomOuterY, roundMm(midX - h1 - 10.5), bottomOuterY],
    [1, 0, roundMm(midX - h1 - 10.5), backArcCy, hr, 270, 0],
    [0, 0, roundMm(midX - h1 - 10.5 + hr), backArcCy, roundMm(midX - h1 - 10.5 + hr), backInnerY],
    [0, 0, roundMm(midX - h1 - 10.5 + hr), backInnerY, roundMm(midX + h1 + 10.5 - hr), backInnerY],
    [0, 0, roundMm(midX + h1 + 10.5 - hr), backArcCy, roundMm(midX + h1 + 10.5 - hr), backInnerY],
    [1, 0, roundMm(midX + h1 + 10.5), backArcCy, hr, 180, 270],
    [0, 0, roundMm(l - r), bottomOuterY, roundMm(midX + h1 + 10.5), bottomOuterY],
    [0, 0, roundMm(l - r), bodyBottom, roundMm(l - r), bottomOuterY],
    [0, 0, roundMm(-w + r), bodyBottom, roundMm(-w + r), sideBottomY],
    [0, 0, roundMm(-w + r), sideBottomY, roundMm(-h - 10.5), sideBottomY],
    [1, 0, roundMm(-h - 10.5), sideArcCy, hr, 270, 0],
    [0, 0, roundMm(-h - 10.5 + hr), sideArcCy, roundMm(-h - 10.5 + hr), sideSlopeY],
    [0, 0, roundMm(-h - 10.5 + hr), sideSlopeY, leftClearX, bodyBottom],
    [0, 0, roundMm(l + w1), bodyBottom, roundMm(l + w1), sideBottomY],
    [0, 0, roundMm(l + w1), sideBottomY, roundMm(l + h + 10.5), sideBottomY],
    [1, 0, roundMm(l + h + 10.5), sideArcCy, hr, 180, 270],
    [0, 0, roundMm(l + h + 10.5 - hr), sideArcCy, roundMm(l + h + 10.5 - hr), sideSlopeY],
    [0, 0, roundMm(l + h + 10.5 - hr), sideSlopeY, rightClearX, bodyBottom],
    [0, 0, roundMm(-l - w + Math.abs(v3[0] + l + w)), bodyBottom, roundMm(lockLeft - 37.5), backInnerY],
    [0, 0, roundMm(lockLeft - 37.5), backInnerY, roundMm(lockLeft - 37.5), backArcCy],
    [1, 0, roundMm(lockLeft - 37.5 + hr), backArcCy, hr, 180, 270],
    [0, 0, roundMm(-w - Math.abs(v4[0] + w)), bodyBottom, roundMm(lockRight + 37.5), backInnerY],
    [0, 0, roundMm(lockRight + 37.5), backInnerY, roundMm(lockRight + 37.5), backArcCy],
    [1, 0, roundMm(lockRight + 37.5 - hr), backArcCy, hr, 270, 0],
    [0, 0, roundMm(lockLeft - 37.5 + hr), bottomOuterY, roundMm(lockRight + 37.5 - hr), bottomOuterY],
    [0, 1, lockLeft, 0, lockRight, 0],
    [0, 0, lockLeft, 0, lockLeft, -lockTabDrop],
    [1, 0, roundMm(lockLeft + lockTabRadius), -lockTabDrop, lockTabRadius, 90, 180],
    [0, 0, lockRight, 0, lockRight, -lockTabDrop],
    [1, 0, roundMm(lockRight - lockTabRadius), -lockTabDrop, lockTabRadius, 0, 90],
    [0, 0, roundMm(lockLeft + lockTabRadius), -lockTabBottom, roundMm(lockRight - lockTabRadius), -lockTabBottom],
  );

  return elements;
}

export function generateC001GX({
  length,
  width,
  depth,
  caliper,
  paperType = "corrugated",
  c001gxTongueStyle = 2,
}) {
  validateStandardParameters(
    { length, width, depth, caliper, paperType },
    { whiteCard: true, whiteCardMax: 1 },
  );
  const style = Number(c001gxTongueStyle) || 2;
  const params = computeC001GXParams(length, width, depth, caliper, style);
  const elements = buildC001GXElements(params);
  const meta = buildGeometryMeta("C001GX", elements);
  return {
    parameters: {
      boxType: "C001GX",
      length,
      width,
      depth,
      caliper,
      c001gxTongueStyle: style,
      paperType,
    },
    elements,
    meta,
    compensation: {
      of: caliper,
      of1: caliper,
      l1: length,
      w1: width,
      f: width / 2,
      f1: width / 2,
      g: 25,
      t: 15,
      r: 3,
    },
  };
}
