import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export class Conflict extends Error {}
export function diskStore(directory) {
  let queue = Promise.resolve();
  return {
    async read(code) {
      try {
        const r = JSON.parse(
          await readFile(`${directory}/${code}.json`, "utf8"),
        );
        return { room: r, etag: String(r.version) };
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
    async write(code, room, etag) {
      const work = queue.then(async () => {
        const old = await this.read(code);
        if ((old?.etag ?? null) !== etag) throw new Conflict();
        await mkdir(directory, { recursive: true });
        const temp = `${directory}/${code}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify(room), { mode: 0o600 });
        await rename(temp, `${directory}/${code}.json`);
      });
      queue = work.catch(() => {});
      return work;
    },
  };
}
export function makeBlobStore(
  load = () => import("@vercel/blob"),
  env = process.env,
) {
  const options = () => ({
    ...(env.BLOB_READ_WRITE_TOKEN_STORE_ID && !env.BLOB_STORE_ID
      ? { storeId: env.BLOB_READ_WRITE_TOKEN_STORE_ID }
      : {}),
    ...(env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN && !env.BLOB_READ_WRITE_TOKEN
      ? { token: env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN }
      : {}),
  });
  return {
    async read(code) {
      const { get } = await load();
      const r = await get(`tables/${code}.json`, {
        access: "private",
        ...options(),
        useCache: false,
      });
      if (!r) return null;
      return { room: await new Response(r.stream).json(), etag: r.blob.etag };
    },
    async write(code, room, etag) {
      const { put, BlobPreconditionFailedError } = await load();
      try {
        await put(`tables/${code}.json`, JSON.stringify(room), {
          access: "private",
          ...options(),
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: etag !== null,
          ...(etag ? { ifMatch: etag } : {}),
        });
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError) throw new Conflict();
        throw e;
      }
    },
  };
}
export const blobStore = makeBlobStore();
