const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const distDir = path.join(rootDir, "dist");
const files = [
  "index.html",
  "styles.css",
  "protocol.js",
  "network.js",
  "game.js",
  "renderer.js",
  "app.js",
];

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(rootDir, file), path.join(distDir, file));
}

console.log(`Built frontend to ${path.relative(rootDir, distDir)}`);
