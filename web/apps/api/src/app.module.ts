import { Controller, Get, Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthController } from "./auth/auth.controller.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { AuthService } from "./auth/auth.service.js";
import { DbModule } from "./common/db.module.js";
import { MailModule } from "./mail/mail.service.js";
import { PublicController } from "./public/public.controller.js";
import { StorageModule } from "./storage/storage.service.js";
import { TokensController } from "./tokens/tokens.controller.js";
import { ActivityController, SharesController, VideosController } from "./videos/videos.controller.js";
import { VideosService } from "./videos/videos.service.js";

@Controller("health")
class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [DbModule, MailModule, StorageModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [HealthController, AuthController, TokensController, VideosController, SharesController, ActivityController, PublicController],
  providers: [AuthService, AuthGuard, VideosService],
})
export class AppModule {}
