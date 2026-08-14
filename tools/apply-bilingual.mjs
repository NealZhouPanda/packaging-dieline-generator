import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appPath = resolve(root, "app/包装刀模生成器.html");
const overlayPath = resolve(root, "tools/bilingual-overlay.js");
const marker = "data-bilingual-overlay";
const html = await readFile(appPath, "utf8");
const overlay = await readFile(overlayPath, "utf8");

const tag = new RegExp(`<script ${marker}>[\\s\\S]*?<\\/script>`);
const injected = html.includes(marker)
  ? html.replace(tag, `<script ${marker}>${overlay}</script>`)
  : html.replace("</body>", `<script ${marker}>${overlay}</script>\n</body>`);
if (injected === html) throw new Error("Could not update bilingual overlay in app HTML");
await writeFile(appPath, injected);
console.log(appPath);
