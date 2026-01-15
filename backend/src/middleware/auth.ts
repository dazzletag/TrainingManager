import { Request, Response, NextFunction } from "express";

export function mockAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.user) {
    return next();
  }
  const roleHeader = req.header("x-user-role");
  req.user = {
    id: req.header("x-user-id") ?? "system",
    role: roleHeader ?? "staff",
    email: req.header("x-user-email") ?? "system@trainingmanager.local",
    name: req.header("x-user-name") ?? "System User",
  };
  next();
}
