import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { apiTokens } from "@smartdemo/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { AuthGuard, CurrentUser } from "../auth/auth.guard.js";
import { API_TOKEN_PREFIX, type AuthUser } from "../auth/auth.service.js";
import { randomToken, sha256 } from "../common/crypto.js";
import { InjectDb, type Database } from "../common/db.module.js";
import { ZodPipe } from "../common/zod.pipe.js";

const CreateBody = z.object({ name: z.string().trim().min(1).max(80).default("SmartDemo for Mac") });

/** Personal access tokens, used by the desktop app to upload videos. */
@Controller("tokens")
@UseGuards(AuthGuard)
export class TokensController {
  constructor(@InjectDb() private readonly db: Database) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, user.id), isNull(apiTokens.revokedAt)))
      .orderBy(desc(apiTokens.createdAt));
    return { tokens: rows };
  }

  /** Returns the token in clear text once. Only its hash is stored. */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateBody)) body: z.infer<typeof CreateBody>) {
    const token = API_TOKEN_PREFIX + randomToken(24);
    const [row] = await this.db
      .insert(apiTokens)
      .values({ userId: user.id, name: body.name, prefix: token.slice(0, 7), tokenHash: sha256(token) })
      .returning({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, createdAt: apiTokens.createdAt });
    return { token, ...row };
  }

  @Delete(":id")
  @HttpCode(204)
  async revoke(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    const res = await this.db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id)))
      .returning({ id: apiTokens.id });
    if (res.length === 0) throw new NotFoundException();
  }
}
