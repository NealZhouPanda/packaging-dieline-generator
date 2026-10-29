import { pointBounds } from "./svg.js";

const round = (v) => Math.round(v * 1000) / 1000;
const degrees = (v) => v * 180 / Math.PI;
const radians = (v) => v * Math.PI / 180;
const polar = (x, y, r, angle) => [x + r * Math.cos(radians(angle)), y - r * Math.sin(radians(angle))];

/** T004C: tuck lid, interlocking bottom and double-fold Euro-slot hanger.
 * Coordinates are dieline millimetres (official CHOOSE=3). Rounded corners
 * remain circular, independently of dimension or paper-thickness changes.
 */
export function generateT004C({ length: l, width: w, depth: d, caliper: cal, paperType = "white-card", t004cTongueStyle = 2 }) {
  for (const [name, value, min, max] of [["长", l, 50, 2000], ["宽", w, 50, 1200], ["高", d, 50, 1500], ["纸厚", cal, paperType === "white-card" ? 0.4 : 1.5, paperType === "white-card" ? 0.8 : 5]]) {
    if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`T004C ${name}须为 ${min}–${max} mm`);
  }
  const style = Number(t004cTongueStyle) === 1 ? 1 : 2;
  const of = cal <= 1 ? cal : Math.max(1, cal / 2);
  const r = Math.max(0.8, cal), n = Math.max(0.5, cal / 2), m = Math.max(0.15, cal / 10);
  const w1 = w - Math.min(3, Math.max(0.5, cal)), w2 = w - 2 * cal;
  const g = Math.min(25, Math.ceil(w / 3)), c = g, cr = c / 2;
  const a = Math.min(l / 2, w / 2 + c / 2 - cal), ar = Math.floor(a / 4);
  const x = Math.max(cal + 3, 2 * r - 0.2), x1 = 2 * cal, x2 = Math.min(5, Math.floor(a / 12)), y1 = Math.floor(a / 6);
  const y = cal > 2 ? cal : Math.min(3.2, cal + 2.4);
  const x3 = style === 1 ? 0 : Math.min(20, Math.round(w2 / 10) + cal);
  const y2 = style === 1 ? 0 : cal / 2, y3 = style === 1 ? 0 : Math.min(1, cal);
  const h = w / 2, h1 = Math.ceil(l / 4), h2 = Math.floor(w / 5), hr = Math.max(1, Math.floor(w / 20));
  const sw = Math.min(40, l / 2), sr = Math.min(5, hr), sd = Math.min(6, Math.floor(w / 15));
  const b = 50, b1 = r, br = 10, bf = 12;
  const H = d - of, back = l + w, end = 2 * l + w;
  const topCx = 0.2 - r, bottomCx = n - r, bottomCy = H + r - m;
  const bottomDx = Math.sqrt(r * r - (r - m) ** 2);
  const bottomCut = bottomCx - bottomDx;
  const bottomAngle = degrees(Math.atan2(r - m, -bottomDx));
  // A circular relief at the sloping rear-bottom cut, tangent to its side.
  const guideAngle = degrees(Math.atan2(h - r + m, h1 + bottomCx));
  const tangentAngle = 90 - guideAngle - degrees(Math.asin(Math.min(1, r / Math.hypot(h - r + m, h1 + bottomCx))));
  const rearStart = polar(back - bottomCx, bottomCy, r, tangentAngle);
  const dustCx = -w1 + x1 + x2 + (a - ar + ar * Math.sin(radians(10)) - y1 - x2) * Math.tan(radians(10)) + ar * Math.cos(radians(10));
  const rightDustCx = l + w - x1 - x2 - (a - ar + ar * Math.sin(radians(10)) - y1 - x2) * Math.tan(radians(10)) - ar * Math.cos(radians(10));
  const dustAngle = cal <= 2 ? 45 : 90;
  const dustTip = polar(topCx, -r, r, 270 - dustAngle);
  const e = [];
  const line = (type, x1, y1, x2, y2) => e.push([0, type, x1, y1, x2, y2]);
  const arc = (cx, cy, radius, from, to) => e.push([1, 0, cx, cy, radius, from, to]);
  const poly = (...points) => {
    const clean = [];
    for (let i = 0; i < points.length; i += 2) {
      if (!clean.length || Math.hypot(points[i] - clean.at(-2), points[i + 1] - clean.at(-1)) > 1e-7) clean.push(points[i], points[i + 1]);
    }
    e.push([2, 0, ...clean]);
  };
  line(1, 0, -of, 0, H); line(1, l, -of, l, H); line(1, 0, H, l, H); line(1, 0, -of, l, -of);
  arc(topCx, -r, r, 270, 0); arc(l - topCx, -r, r, 180, 270);
  line(0, -w1, 0, -w1, H); line(1, -w1 + x1, 0, topCx, 0); line(0, -w1 + x1, 0, -w1, 0);
  line(1, -w1, H, bottomCut, H); arc(bottomCx, bottomCy, r, 0, bottomAngle);
  line(1, back, 0, back, H); line(1, l - topCx, 0, back, 0); line(1, l - bottomCut, H, back, H);
  arc(l - bottomCx, bottomCy, r, 180 - bottomAngle, 180);
  line(1, end, Math.max(1, cal / 2) * Math.tan(radians(15)), end, H);
  line(1, end, H, back - bottomCut, H); arc(back - bottomCx, bottomCy, r, tangentAngle, 180);
  const e1 = Math.max(1, cal / 2), bevel = g * Math.tan(radians(15));
  line(0, end, e1 * Math.tan(radians(15)), end - e1, 0); line(0, end - e1, 0, end - e1, -b + br);
  arc(end - e1 - br, -b + br, br, 0, 90); arc(back, -e1, e1, 270, 0);
  line(0, back + e1, -e1, back + e1, -b + br); arc(back + e1 + br, -b + br, br, 90, 180);
  line(1, end - e1 - br, -b, back + e1 + br, -b);
  function hole(cy, reverse) {
    const k = back + l / 2, left = k - sw / 2 + sd / 2, right = k + sw / 2 - sd / 2;
    arc(left, cy, sd / 2, 90, 270); arc(right, cy, sd / 2, 270, 90);
    if (!reverse) { line(0, left, cy + sd / 2, right, cy + sd / 2); line(0, left, cy - sd / 2, k - sr, cy - sd / 2); line(0, right, cy - sd / 2, k + sr, cy - sd / 2); arc(k, cy - sd / 2, sr, 0, 180); }
    else { line(0, left, cy - sd / 2, right, cy - sd / 2); line(0, left, cy + sd / 2, k - sr, cy + sd / 2); line(0, right, cy + sd / 2, k + sr, cy + sd / 2); arc(k, cy + sd / 2, sr, 180, 0); }
  }
  hole(-b + 16, false);
  line(1, -w1 + x1, 0, topCx, 0);
  const lp = polar(dustCx, -a + ar, ar, 170);
  poly(-w1 + x1, 0, -w1 + x1, -y1, -w1 + x1 + x2, -y1 - x2, ...lp);
  arc(dustCx, -a + ar, ar, 90, 170);
  poly(dustCx, -a, -x - 5, -a, -x, -y, ...dustTip); arc(topCx, -r, r, 270 - dustAngle, 270);
  line(1, back, 0, l - topCx, 0); arc(back, -x1, x1, 180, 270);
  const rp = polar(rightDustCx, -a + ar, ar, 10);
  poly(back - x1, -x1, back - x1, -y1, back - x1 - x2, -y1 - x2, ...rp);
  arc(rightDustCx, -a + ar, ar, 10, 90);
  poly(rightDustCx, -a, l + x + 5, -a, l + x, -y, l - dustTip[0], dustTip[1]); arc(l - topCx, -r, r, 270, (270 + dustAngle) % 360);
  line(0, end, e1 * Math.tan(radians(15)), end + g, bevel); line(0, end, H, end + g, H - bevel); line(0, end + g, bevel, end + g, H - bevel);
  const foldY = -w2 - of, edgeY = foldY - y2, edgeX = 0.2 + cal / 2;
  if (style === 2) {
    poly(0.2, -r, 0.2, edgeY, edgeX, edgeY); line(0, 0.2 + x3, foldY, 0.2 + x3, foldY + y3);
    poly(l - 0.2, -r, l - 0.2, edgeY, l - edgeX, edgeY); line(0, l - 0.2 - x3, foldY, l - 0.2 - x3, foldY + y3);
    line(1, 0.2 + x3, foldY, l - 0.2 - x3, foldY);
    line(0, edgeX, edgeY, 0.2 + x3 - y2, edgeY); arc(0.2 + x3 - y2, foldY, y2, 0, 90);
    line(0, l - edgeX, edgeY, l - 0.2 - x3 + y2, edgeY); arc(l - 0.2 - x3 + y2, foldY, y2, 90, 180);
  } else {
    poly(0.2, -r, 0.2, foldY, edgeX, foldY); poly(l - 0.2, -r, l - 0.2, foldY, l - edgeX, foldY);
    line(1, 0.2, foldY, l - 0.2, foldY); line(0, edgeX, foldY, 0.2, foldY); line(0, l - edgeX, foldY, l - 0.2, foldY);
  }
  const joinY = edgeY - Math.min(5, c / 5), cy = foldY - cr;
  const tipCx = style === 1 ? edgeX + (joinY - cy) * Math.tan(radians(4)) + cr / Math.cos(radians(4)) : edgeX + cr;
  const tp = polar(tipCx, cy, cr, style === 1 ? 176 : 180);
  line(0, edgeX, edgeY, edgeX, joinY); line(0, edgeX, joinY, ...tp); arc(tipCx, cy, cr, 90, style === 1 ? 176 : 180);
  line(0, tipCx, foldY - c, l - tipCx, foldY - c); arc(l - tipCx, cy, cr, style === 1 ? 4 : 0, 90);
  line(0, l - tp[0], tp[1], l - edgeX, joinY); line(0, l - edgeX, joinY, l - edgeX, edgeY);
  if (style === 1) { const short = Math.round(w2 / 10) + cal; line(1, 0, foldY - 1.5, short, foldY - 1.5); line(1, l, foldY - 1.5, l - short, foldY - 1.5); }
  line(1, l, H, 0, H); arc(bottomCx, bottomCy, r, 0, 90);
  line(0, n, bottomCy, n, H + h + h2); line(0, n, H + h + h2, h1 - 0.5 - hr, H + h + h2);
  arc(h1 - 0.5 - hr, H + h + h2 - hr, hr, 270, 0);
  line(0, h1 - 0.5, H + h + h2 - hr, h1 - 0.5, H + h); line(0, h1 - 0.5, H + h, l - h1 + 0.5, H + h);
  line(0, l - h1 + 0.5, H + h + h2 - hr, l - h1 + 0.5, H + h); arc(l - h1 + 0.5 + hr, H + h + h2 - hr, hr, 180, 270);
  line(0, l - n, H + h + h2, l - h1 + 0.5 + hr, H + h + h2); line(0, l - n, bottomCy, l - n, H + h + h2); arc(l - bottomCx, bottomCy, r, 90, 180);
  line(1, bottomCut, H, -w1, H);
  line(0, -w1, H, -w1 + n, bottomCy); line(0, -w1 + n, bottomCy, -w1 + n, H + h1 + h2);
  const notchX = -w1 + w / 2 - 0.5;
  line(0, -w1 + n, H + h1 + h2, notchX - hr, H + h1 + h2); arc(notchX - hr, H + h1 + h2 - hr, hr, 270, 0);
  line(0, notchX, H + h1 + h2 - hr, notchX, H + h1); line(0, notchX, H + h1, bottomCut, H);
  arc(back - bottomCx, bottomCy, r, 90, 180); line(0, back - bottomCx - r, bottomCy, back - bottomCx - r, H + h1 + h2);
  line(0, back - bottomCx - r, H + h1 + h2, l + w / 2 + 0.5 + hr, H + h1 + h2); arc(l + w / 2 + 0.5 + hr, H + h1 + h2 - hr, hr, 180, 270);
  line(0, l + w / 2 + 0.5, H + h1 + h2 - hr, l + w / 2 + 0.5, H + h1); line(0, l + w / 2 + 0.5, H + h1, l - bottomCut, H);
  line(1, back - bottomCut, H, end, H); arc(back - bottomCx, bottomCy, r, tangentAngle, 180);
  line(0, ...rearStart, back + h1, H + h); line(0, back + h1, H + h, back + h1, H + h + h2 - hr); arc(back + h1 + hr, H + h + h2 - hr, hr, 180, 270);
  line(0, end, H, end - h1, H + h); line(0, end - h1, H + h, end - h1, H + h + h2 - hr); arc(end - h1 - hr, H + h + h2 - hr, hr, 270, 0); line(0, back + h1 + hr, H + h + h2, end - h1 - hr, H + h + h2);
  line(1, end - e1 - br, -b - b1, back + e1 + br, -b - b1);
  arc(end - e1 - br, -b - b1 / 2, b1 / 2, 90, 270); arc(back + e1 + br, -b - b1 / 2, b1 / 2, 270, 90);
  arc(end - e1 - br, -b - b1 - br, br, 270, 0); arc(back + e1 + br, -b - b1 - br, br, 180, 270);
  const cy2 = -2 * b - b1, bevel2 = bf * Math.tan(radians(10)), tipY = cy2 - bf;
  poly(end - e1, -b - b1 - br, end - e1, cy2 + cal / 2, end - e1 - cal / 2, cy2);
  poly(back + e1, -b - b1 - br, back + e1, cy2 + cal / 2, back + e1 + cal / 2, cy2);
  poly(end - e1 - cal / 2, cy2, end - e1 - cal / 2 - bevel2, tipY, back + e1 + cal / 2 + bevel2, tipY, back + e1 + cal / 2, cy2);
  hole(-2 * b - cal + b - 16, true);
  const bounds = pointBounds(e), blankW = bounds.maxX - bounds.minX, blankH = bounds.maxY - bounds.minY;
  const pathLength = (element) => {
    if (element[0] === 1) return element[4] * (((element[6] - element[5]) % 360 + 360) % 360) * Math.PI / 180;
    let result = 0; for (let i = 4; i < element.length; i += 2) result += Math.hypot(element[i] - element[i - 2], element[i + 1] - element[i - 1]); return result;
  };
  return { parameters: { boxType: "T004C", length: l, width: w, depth: d, caliper: cal, paperType, t004cTongueStyle: style }, elements: e,
    meta: { boxId: "T004C", width: round(blankW), height: round(blankH), area: round(blankW * blankH), solidLength: round(e.filter((e) => !e[1]).reduce((s, e) => s + pathLength(e), 0)), foldLength: round(e.filter((e) => e[1]).reduce((s, e) => s + pathLength(e), 0)) },
    compensation: { of, r, w1, w2, g, c, a, x, y, x3, h, h1, h2, hr, b, b1 } };
}
