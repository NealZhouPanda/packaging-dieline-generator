import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "app/包装刀模生成器.html");
const outputDir = resolve(root, "release");
const output = resolve(outputDir, "包装刀模生成器.html");
const html = await readFile(source, "utf8");

if (/\b(?:src|href)="\/(?:src|assets)\//.test(html)) {
  throw new Error("Single-file source still contains local asset references");
}
if (/https?:\/\//.test(html.replace('xmlns="http://www.w3.org/2000/svg"', ""))) {
  throw new Error("Single-file source unexpectedly contains a network URL");
}

await mkdir(outputDir, { recursive: true });
await copyFile(source, output);
console.log(output);
