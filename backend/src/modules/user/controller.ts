import type { Request, Response } from "express";
import { UnauthorizedError } from "../../shared/errors.js";
import { updateProfileSchema } from "./dto.js";
import { updateOwnProfile } from "./service.js";

export async function patchOwnProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();

  const input = updateProfileSchema.parse(req.body);
  const user = await updateOwnProfile(
    req.user.id,
    input,
    { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null },
  );
  res.json({ user });
}
