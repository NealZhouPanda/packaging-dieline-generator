import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const tempDir = resolve(root, ".codex-tmp/offline-build");
const overlayPath = resolve(root, "tools/bilingual-overlay.js");

async function findViteCli() {
  const direct = resolve(root, "node_modules/vite/bin/vite.js");
  try {
    await readFile(direct);
    return direct;
  } catch {}

  const pnpmDir = resolve(root, "node_modules/.pnpm");
  const entries = await readdir(pnpmDir);
  const packageDir = entries.find((entry) => entry.startsWith("vite@"));
  if (!packageDir) throw new Error("Vite is not installed; run npm ci first");
  return resolve(pnpmDir, packageDir, "node_modules/vite/bin/vite.js");
}

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

try {
  const viteCli = await findViteCli();
  await execFileAsync(process.execPath, [viteCli, "build", "--outDir", tempDir, "--emptyOutDir"], {
    cwd: root,
  });

  let html = await readFile(resolve(tempDir, "index.html"), "utf8");
  const scriptMatch = html.match(/<script type="module"[^>]* src="([^"]+)"[^>]*><\/script>/);
  const styleMatch = html.match(/<link rel="stylesheet"[^>]* href="([^"]+)"[^>]*>/);
  if (!scriptMatch || !styleMatch) throw new Error("Vite output did not contain the expected JS and CSS assets");

  const assetPath = (url) => resolve(tempDir, url.replace(/^\//, ""));
  const [javascript, css, overlay] = await Promise.all([
    readFile(assetPath(scriptMatch[1]), "utf8"),
    readFile(assetPath(styleMatch[1]), "utf8"),
    readFile(overlayPath, "utf8"),
  ]);

  html = html
    .replace(scriptMatch[0], `<script type="module">${javascript}</script>`)
    .replace(styleMatch[0], `<style>${css}</style>`)
    .replace("</body>", `<script data-bilingual-overlay>${overlay}</script>\n</body>`);
  html = html.replace(/\r\n?/g, "\n");

  if (/\b(?:src|href)="\/(?:src|assets)\//.test(html)) {
    throw new Error("Single-file build still contains local asset references");
  }
  if (/https?:\/\//.test(html.replaceAll('xmlns="http://www.w3.org/2000/svg"', ""))) {
    throw new Error("Single-file build unexpectedly contains a network URL");
  }

  const outputs = [
    resolve(root, "app/包装刀模生成器.html"),
    resolve(root, "release/包装刀模生成器.html"),
    resolve(root, "docs/index.html"),
  ];
  await Promise.all(outputs.map(async (output) => {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, html);
  }));
  console.log(outputs.join("\n"));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
