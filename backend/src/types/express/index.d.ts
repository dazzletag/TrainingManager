import { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        email: string;
        name: string;
      };
      auth?: Record<string, unknown>;
    }
  }
}

export {};
