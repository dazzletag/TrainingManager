import http from "http";
import fs from "fs";
import path from "path";

const distPath = path.join(process.cwd(), "dist");
const port = process.env.PORT ?? 8080;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function resolvePath(requestUrl) {
  const url = new URL(requestUrl ?? "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const relative = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.join(distPath, relative);
  if (!fullPath.startsWith(distPath)) {
    return null;
  }
  return fullPath;
}

const server = http.createServer((req, res) => {
  const targetPath = resolvePath(req.url);
  let filePath = targetPath;

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(distPath, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", mimeTypes[ext] ?? "application/octet-stream");

  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    res.statusCode = 500;
    res.end("Server error");
  });
  stream.pipe(res);
});

server.listen(port, () => {
  console.log(`Frontend server listening on port ${port}`);
});
