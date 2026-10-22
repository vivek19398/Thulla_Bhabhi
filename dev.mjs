import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHandler } from "./api/game.js";
import { blobStore, diskStore } from "./server/store.js";
const root = new URL("./public/", import.meta.url);
const port = Number(process.env.PORT || 3032);
const handler = createHandler(
  process.env.BLOB_READ_WRITE_TOKEN
    ? blobStore
    : diskStore(fileURLToPath(new URL("./.data/", import.meta.url))),
);
http
  .createServer(async (req, res) => {
    if (req.url.split("?")[0] === "/api/game") return handler(req, res);
    try {
      const path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (path.includes("..")) throw Error();
      const data = await readFile(
        new URL("." + (path === "/" ? "/index.html" : path), root),
      );
      res.setHeader(
        "Content-Type",
        path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".css")
            ? "text/css"
            : path.endsWith(".webp")
              ? "image/webp"
              : path.endsWith(".png")
                ? "image/png"
                : "text/html",
      );
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "0.0.0.0", () =>
    console.log(`Bhabhi / Tulla: http://localhost:${port}`),
  );
