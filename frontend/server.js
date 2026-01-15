import express from "express";
import path from "path";

const app = express();
const distPath = path.join(process.cwd(), "dist");

app.use(express.static(distPath));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const port = process.env.PORT ?? 8080;
app.listen(port, () => {
  console.log(`Frontend server listening on port ${port}`);
});
