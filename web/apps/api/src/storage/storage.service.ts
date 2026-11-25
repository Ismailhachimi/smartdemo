import { Global, Injectable, Logger, Module, type OnModuleInit, PayloadTooLargeException } from "@nestjs/common";
import type { Request, Response } from "express";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "../env.js";
import { AzureDriver, LocalDriver, S3Driver, type StorageDriver } from "./drivers.js";

function createDriver(): StorageDriver {
  switch (env.STORAGE_DRIVER) {
    case "s3":
      return new S3Driver({
        bucket: env.S3_BUCKET!,
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE ?? Boolean(env.S3_ENDPOINT),
        prefix: env.STORAGE_PREFIX,
      });
    case "azure":
      return new AzureDriver({
        connectionString: env.AZURE_STORAGE_CONNECTION_STRING!,
        container: env.AZURE_STORAGE_CONTAINER,
        prefix: env.STORAGE_PREFIX,
      });
    default:
      return new LocalDriver(env.STORAGE_DIR);
  }
}

/**
 * Media storage, independent of where the bytes live (local disk, S3-compatible, Azure Blob).
 * Media is always served through the API, so share-link rules (password, expiry) apply and
 * buckets can stay private.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger("Storage");
  private readonly driver = createDriver();

  async onModuleInit() {
    try {
      await this.driver.init();
    } catch (err) {
      this.logger.error(`Cannot reach ${this.driver.description}: ${(err as Error).message}`);
      throw err;
    }
    this.logger.log(`Media stored in ${this.driver.description}`);
  }

  /** Streams a request body to storage, aborting past maxBytes. Returns the number of bytes written. */
  async writeFromRequest(key: string, req: Request, maxBytes: number, contentType: string): Promise<number> {
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        bytes += chunk.length;
        if (bytes > maxBytes) cb(new PayloadTooLargeException(`Fichier trop volumineux (max ${Math.round(maxBytes / 1048576)} Mo).`));
        else cb(null, chunk);
      },
    });
    req.pipe(limiter);
    req.on("error", (err) => limiter.destroy(err));
    await this.driver.put(key, limiter, contentType);
    return bytes;
  }

  size(key: string) {
    return this.driver.size(key);
  }

  async remove(key: string | null | undefined): Promise<void> {
    if (!key || key === "pending") return;
    try {
      await this.driver.remove(key);
    } catch (err) {
      this.logger.warn(`Could not delete ${key}: ${(err as Error).message}`);
    }
  }

  /**
   * Sends a stored file with HTTP Range support (needed for seeking in <video>).
   * `download` sets Content-Disposition: attachment with the given file name.
   */
  async send(req: Request, res: Response, key: string, mime: string, opts: { download?: string; cache?: string } = {}) {
    const size = await this.driver.size(key);
    if (size === null) {
      res.status(404).json({ message: "Fichier introuvable" });
      return;
    }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", opts.cache ?? "private, max-age=3600");
    if (opts.download) {
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(opts.download)}`);
    }

    let start = 0;
    let end = size - 1;
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (m && !(m[1] === "" && m[2] === "")) {
        if (m[1] === "") {
          start = Math.max(0, size - Number(m[2]));
        } else {
          start = Number(m[1]);
          if (m[2] !== "") end = Math.min(Number(m[2]), size - 1);
        }
      }
      if (!m || (m[1] === "" && m[2] === "") || start > end || start >= size) {
        res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
        return;
      }
      res.status(206).setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    } else {
      res.status(200);
    }
    res.setHeader("Content-Length", String(end - start + 1));
    if (req.method === "HEAD" || size === 0) {
      res.end();
      return;
    }
    const body = await this.driver.get(key, { start, end });
    try {
      await pipeline(body, res);
    } catch {
      // Client closed the connection (seeking, tab closed): nothing to do.
    }
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
