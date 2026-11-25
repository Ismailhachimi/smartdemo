import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { createDb, type Database } from "@smartdemo/db";
import { env } from "../env.js";

export const DB = Symbol("DB");
export const InjectDb = () => Inject(DB);
export type { Database };

const { db, close } = createDb(env.DATABASE_URL);

@Global()
@Module({
  providers: [{ provide: DB, useValue: db }],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await close();
  }
}
