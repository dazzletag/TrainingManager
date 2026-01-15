import { RequestHandler } from "express";
import { expressjwt } from "express-jwt";
import jwksRsa from "jwks-rsa";

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const azureIssuer = tenantId ? `https://login.microsoftonline.com/${tenantId}/v2.0` : undefined;

export const azureAuthEnabled =
  process.env.AZURE_AUTH_ENABLED === "true" && Boolean(tenantId) && Boolean(clientId) && Boolean(azureIssuer);

const jwtSecret = azureAuthEnabled
  ? jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri: `${azureIssuer}/discovery/v2.0/keys`,
    })
  : undefined;

export const azureAuthMiddleware: RequestHandler = azureAuthEnabled
  ? expressjwt({
      secret: jwtSecret!,
      algorithms: ["RS256"],
      audience: clientId,
      issuer: azureIssuer,
      requestProperty: "auth",
      credentialsRequired: false,
    })
  : ((req, _res, next) => {
      next();
    });

interface AzureClaims {
  sub: string;
  oid?: string;
  roles?: string | string[];
  preferred_username?: string;
  name?: string;
  email?: string;
}

export const azureUserMapper: RequestHandler = (req, _res, next) => {
  if (!azureAuthEnabled) {
    return next();
  }

  const auth = req.auth as AzureClaims | undefined;
  if (!auth) {
    return next();
  }

  req.user = {
    id: auth.oid ?? auth.sub,
    role: Array.isArray(auth.roles) ? auth.roles[0] ?? "staff" : auth.roles ?? "staff",
    email: auth.preferred_username ?? auth.email ?? "",
    name: auth.name ?? auth.preferred_username ?? auth.email ?? "",
  };

  next();
};
