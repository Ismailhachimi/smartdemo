import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { cookieSecure } from "../env.js";
import { AuthGuard, CurrentUser } from "./auth.guard.js";
import { AuthService, SESSION_COOKIE, SESSION_DAYS, type AuthUser } from "./auth.service.js";

const MagicLinkBody = z.object({ email: z.email().max(320) });
const VerifyBody = z.object({ token: z.string().min(10).max(200) });
const ProfileBody = z.object({ name: z.string().trim().max(120).nullable() });

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("magic-link")
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async magicLink(@Body(new ZodPipe(MagicLinkBody)) body: z.infer<typeof MagicLinkBody>) {
    await this.auth.requestMagicLink(body.email);
  }

  @Post("verify")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async verify(
    @Body(new ZodPipe(VerifyBody)) body: z.infer<typeof VerifyBody>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, sessionToken } = await this.auth.verify(body.token, req.headers["user-agent"]);
    res.cookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure,
      path: "/",
      maxAge: SESSION_DAYS * 86_400_000,
    });
    return { user };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @Patch("me")
  @UseGuards(AuthGuard)
  async updateMe(@CurrentUser() user: AuthUser, @Body(new ZodPipe(ProfileBody)) body: z.infer<typeof ProfileBody>) {
    return { user: await this.auth.updateProfile(user.id, body.name || null) };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) await this.auth.logout(token);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }
}
