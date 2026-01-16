import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { EventType, type AccountInfo, type AuthenticationResult } from "@azure/msal-browser";
import { loginRequest } from "./msalConfig";
import { msalInstance } from "./msalInstance";

interface AuthContextValue {
  account: AccountInfo | null;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountInfo | null>(msalInstance.getActiveAccount());

  useEffect(() => {
    let isActive = true;
    msalInstance
      .handleRedirectPromise()
      .then((result: AuthenticationResult | null) => {
        const nextAccount = result?.account ?? msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
        if (nextAccount) {
          msalInstance.setActiveAccount(nextAccount);
        }
        if (isActive) {
          setAccount(nextAccount ?? null);
        }
      })
      .catch(() => {
        if (isActive) {
          setAccount(msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null);
        }
      });

    const callbackId = msalInstance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
        const payload = event.payload as AuthenticationResult;
        msalInstance.setActiveAccount(payload.account);
        setAccount(payload.account ?? null);
      }
      if (event.eventType === EventType.LOGOUT_SUCCESS) {
        setAccount(null);
      }
    });

    return () => {
      isActive = false;
      if (callbackId) {
        msalInstance.removeEventCallback(callbackId);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      account,
      isAuthenticated: Boolean(account),
      login: () => msalInstance.loginRedirect(loginRequest),
      logout: () => msalInstance.logoutRedirect(),
    }),
    [account],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("AuthContext must be used within AuthProvider");
  }
  return ctx;
}
