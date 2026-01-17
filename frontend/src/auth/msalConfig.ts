import type { Configuration, PopupRequest } from "@azure/msal-browser";

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID ?? "919a385b-c222-4523-92ff-09b1ff579ee4";
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID ?? "44a1be07-ba53-4b40-8c4b-8a48ce5f1b0e";

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};

export const loginRequest: PopupRequest = {
  scopes: ["openid", "profile", "email"],
};
