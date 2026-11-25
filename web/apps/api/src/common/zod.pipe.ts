import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { z } from "zod";

/** Validates and parses a request body or query with a Zod schema. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new BadRequestException({ message: "Invalid request", issues: z.flattenError(result.error).fieldErrors });
    }
    return result.data;
  }
}
