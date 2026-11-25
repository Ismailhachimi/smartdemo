import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { runMigrations } from "@smartdemo/db";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { env } from "./env.js";

const logger = new Logger("Bootstrap");

await runMigrations(env.DATABASE_URL);
logger.log("Database migrations applied");

const app = await NestFactory.create<NestExpressApplication>(AppModule);
// Behind Caddy / Traefik: trust the first proxy for client IPs (rate limiting).
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(cookieParser());
app.setGlobalPrefix("api");
app.enableShutdownHooks();

await app.listen(env.API_PORT, "0.0.0.0");
logger.log(`API ready on :${env.API_PORT} — public URL ${env.APP_URL}`);
