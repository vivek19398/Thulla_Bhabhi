import { blobStore } from "../server/store.js";
import { roomService } from "../server/rooms.js";
export function createHandler(store = blobStore) {
  const service = roomService(store);
  return async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "private, no-store");
    const send = (status, body) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method !== "POST") return send(405, { error: "Use POST." });
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return send(403, { error: "Open the game directly." });
      let b = req.body;
      if (b === undefined) {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 4096)
            return send(413, { error: "Request too large." });
        }
        b = JSON.parse(raw);
      }
      if (typeof b === "string") b = JSON.parse(b);
      if (JSON.stringify(b).length > 4096)
        return send(413, { error: "Request too large." });
      return send(200, await service(b));
    } catch (e) {
      const status = e.status || (e instanceof SyntaxError ? 400 : 503);
      send(status, {
        error: e.status
          ? e.message
          : status === 400
            ? "Invalid request."
            : "Table storage unavailable. Connect a private Vercel Blob store, then redeploy.",
      });
    }
  };
}
export default createHandler();
