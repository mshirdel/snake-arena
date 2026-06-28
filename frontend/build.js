const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const distDir = path.join(rootDir, "dist");

const jsFiles = [
  "protocol.js",
  "network.js",
  "game.js",
  "renderer.js",
  "app.js",
];

function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 10);
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>+~])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function obfuscateJs(source) {
  const encoded = Buffer.from(source, "utf8").toString("base64");

  return [
    "(()=>{",
    `const c="${encoded}";`,
    "const b=Uint8Array.from(atob(c),x=>x.charCodeAt(0));",
    "(0,Function)(new TextDecoder().decode(b))();",
    "})();",
  ].join("");
}

function writeVersionedAsset(baseName, extension, content) {
  const fileName = `${baseName}.${hashContent(content)}.${extension}`;
  fs.writeFileSync(path.join(distDir, fileName), content);
  return fileName;
}

function rewriteHtml(html, cssFileName, jsFileName) {
  const cssPattern = /<link\s+rel="stylesheet"\s+href="styles\.css"\s*>/;
  const jsPattern =
    /(?:\s*<script\s+src="(?:protocol|network|game|renderer|app)\.js"><\/script>)+/;

  if (!cssPattern.test(html)) {
    throw new Error("Could not find styles.css link in index.html");
  }

  if (!jsPattern.test(html)) {
    throw new Error("Could not find frontend script tags in index.html");
  }

  const withoutCss = html.replace(
    cssPattern,
    `<link rel="stylesheet" href="${cssFileName}">`,
  );

  return withoutCss.replace(
    jsPattern,
    `\n    <script src="${jsFileName}"></script>`,
  );
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const css = fs.readFileSync(path.join(rootDir, "styles.css"), "utf8");
const cssFileName = writeVersionedAsset("styles", "css", minifyCss(css));

const bundledJs = jsFiles
  .map((file) => fs.readFileSync(path.join(rootDir, file), "utf8"))
  .join("\n");
const jsFileName = writeVersionedAsset("app", "js", obfuscateJs(bundledJs));

const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
fs.writeFileSync(
  path.join(distDir, "index.html"),
  rewriteHtml(html, cssFileName, jsFileName),
);

console.log(`Built frontend to ${path.relative(rootDir, distDir)}`);
console.log(`CSS: ${cssFileName}`);
console.log(`JS: ${jsFileName}`);
