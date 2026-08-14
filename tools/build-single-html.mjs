import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "app/包装刀模生成器.html");
const overlayPath = resolve(root, "tools/bilingual-overlay.js");
const outputDir = resolve(root, "release");
const output = resolve(outputDir, "包装刀模生成器.html");
const docsDir = resolve(root, "docs");
const docsOutput = resolve(docsDir, "index.html");
let html = await readFile(source, "utf8");
const overlay = await readFile(overlayPath, "utf8");

if (!html.includes("data-bilingual-overlay")) {
  html = html.replace("</body>", `<script data-bilingual-overlay>${overlay}</script>\n</body>`);
}

if (/\b(?:src|href)="\/(?:src|assets)\//.test(html)) {
  throw new Error("Single-file source still contains local asset references");
}
if (/https?:\/\//.test(html.replace('xmlns="http://www.w3.org/2000/svg"', ""))) {
  throw new Error("Single-file source unexpectedly contains a network URL");
}

await mkdir(outputDir, { recursive: true });
await mkdir(docsDir, { recursive: true });
await writeFile(output, html);
await writeFile(docsOutput, html);
console.log(output);
