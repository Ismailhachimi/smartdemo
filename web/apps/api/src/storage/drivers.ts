import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface ByteRange {
  start: number;
  /** Inclusive. */
  end: number;
}

/** Where media files live. Keys look like "videos/<id>.mp4". */
export interface StorageDriver {
  readonly description: string;
  init(): Promise<void>;
  put(key: string, body: Readable, contentType: string): Promise<void>;
  /** Size in bytes, or null when the object does not exist. */
  size(key: string): Promise<number | null>;
  get(key: string, range: ByteRange): Promise<Readable>;
  remove(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local filesystem (default): a folder, or a Docker volume in production.

export class LocalDriver implements StorageDriver {
  private readonly root: string;
  readonly description: string;

  constructor(dir: string) {
    this.root = resolve(dir);
    this.description = `local folder ${this.root}`;
  }

  private path(key: string): string {
    const p = resolve(this.root, key);
    if (!p.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return p;
  }

  async init() {
    await mkdir(this.root, { recursive: true });
  }

  async put(key: string, body: Readable) {
    const dest = this.path(key);
    const tmp = `${dest}.part`;
    await mkdir(dirname(dest), { recursive: true });
    try {
      await pipeline(body, createWriteStream(tmp));
      await rename(tmp, dest);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  async size(key: string) {
    try {
      return (await stat(this.path(key))).size;
    } catch {
      return null;
    }
  }

  async get(key: string, range: ByteRange) {
    return createReadStream(this.path(key), { start: range.start, end: range.end });
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
}

// ---------------------------------------------------------------------------
// S3 and S3-compatible services: AWS S3, Cloudflare R2, Scaleway, OVH, Backblaze B2,
// Wasabi, DigitalOcean Spaces, self-hosted SeaweedFS / Garage / MinIO…

export interface S3Options {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  prefix: string;
}

export class S3Driver implements StorageDriver {
  readonly description: string;
  private client!: import("@aws-sdk/client-s3").S3Client;
  private s3!: typeof import("@aws-sdk/client-s3");

  constructor(private readonly o: S3Options) {
    this.description = `S3 bucket "${o.bucket}"${o.endpoint ? ` at ${o.endpoint}` : ` (${o.region})`}`;
  }

  private k(key: string) {
    return this.o.prefix + key;
  }

  async init() {
    this.s3 = await import("@aws-sdk/client-s3");
    this.client = new this.s3.S3Client({
      region: this.o.region,
      endpoint: this.o.endpoint,
      forcePathStyle: this.o.forcePathStyle,
      credentials:
        this.o.accessKeyId && this.o.secretAccessKey
          ? { accessKeyId: this.o.accessKeyId, secretAccessKey: this.o.secretAccessKey }
          : undefined, // falls back to the AWS default chain (IAM role, env, profile)
    });
    await this.client.send(new this.s3.HeadBucketCommand({ Bucket: this.o.bucket }));
  }

  async put(key: string, body: Readable, contentType: string) {
    const { Upload } = await import("@aws-sdk/lib-storage");
    // Multipart upload: streams the body in 16 MB parts, never buffers the whole file.
    await new Upload({
      client: this.client,
      params: { Bucket: this.o.bucket, Key: this.k(key), Body: body, ContentType: contentType },
      partSize: 16 * 1024 * 1024,
      queueSize: 4,
    }).done();
  }

  async size(key: string) {
    try {
      const head = await this.client.send(new this.s3.HeadObjectCommand({ Bucket: this.o.bucket, Key: this.k(key) }));
      return head.ContentLength ?? null;
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async get(key: string, range: ByteRange) {
    const res = await this.client.send(
      new this.s3.GetObjectCommand({ Bucket: this.o.bucket, Key: this.k(key), Range: `bytes=${range.start}-${range.end}` }),
    );
    return res.Body as Readable;
  }

  async remove(key: string) {
    await this.client.send(new this.s3.DeleteObjectCommand({ Bucket: this.o.bucket, Key: this.k(key) }));
  }
}

// ---------------------------------------------------------------------------
// Azure Blob Storage.

export interface AzureOptions {
  connectionString: string;
  container: string;
  prefix: string;
}

export class AzureDriver implements StorageDriver {
  readonly description: string;
  private container!: import("@azure/storage-blob").ContainerClient;

  constructor(private readonly o: AzureOptions) {
    this.description = `Azure Blob container "${o.container}"`;
  }

  private blob(key: string) {
    return this.container.getBlockBlobClient(this.o.prefix + key);
  }

  async init() {
    const { BlobServiceClient } = await import("@azure/storage-blob");
    this.container = BlobServiceClient.fromConnectionString(this.o.connectionString).getContainerClient(this.o.container);
    await this.container.createIfNotExists();
  }

  async put(key: string, body: Readable, contentType: string) {
    await this.blob(key).uploadStream(body, 8 * 1024 * 1024, 4, { blobHTTPHeaders: { blobContentType: contentType } });
  }

  async size(key: string) {
    try {
      return (await this.blob(key).getProperties()).contentLength ?? null;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) return null;
      throw err;
    }
  }

  async get(key: string, range: ByteRange) {
    const res = await this.blob(key).download(range.start, range.end - range.start + 1);
    return res.readableStreamBody as Readable;
  }

  async remove(key: string) {
    await this.blob(key).deleteIfExists();
  }
}
