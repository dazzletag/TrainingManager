import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { fetchCurrentUserRole, fetchStaffDirectory } from "../services/api";
import { useAuth } from "../auth/AuthContext";

type Role = "staff" | "manager" | "admin";

interface UserContextValue {
  role: Role;
  setRole: (role: Role) => void;
  personExternalId: string;
  setPersonExternalId: (value: string) => void;
  userEmail: string;
  setUserEmail: (value: string) => void;
}

const defaultExternalId = import.meta.env.VITE_DEMO_PERSON_EXTERNAL_ID ?? "";
const placeholderExternalId = "planday-employee-001";

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { account } = useAuth();
  const [role, setRole] = useState<Role>("staff");
  const [personExternalId, setPersonExternalId] = useState(defaultExternalId);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    if (!account) {
      setUserEmail("");
      return;
    }
    setUserEmail(account.username ?? "");
  }, [account]);

  useEffect(() => {
    if (!userEmail) {
      return;
    }
    let isActive = true;
    fetchCurrentUserRole(userEmail)
      .then((response) => {
        const nextRole = response.data?.role;
        if (isActive && (nextRole === "admin" || nextRole === "manager")) {
          setRole(nextRole);
        } else if (isActive) {
          setRole("staff");
        }
      })
      .catch(() => {
        if (isActive) {
          setRole("staff");
        }
      });

    return () => {
      isActive = false;
    };
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail || (personExternalId && personExternalId !== placeholderExternalId)) {
      return;
    }

    let isActive = true;
    fetchStaffDirectory(role, userEmail, { limit: 1 })
      .then((response) => {
        const candidate = response.data?.people?.[0];
        if (isActive && candidate?.externalId) {
          setPersonExternalId(candidate.externalId);
        }
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [personExternalId, role, userEmail]);

  const value = useMemo(
    () => ({ role, setRole, personExternalId, setPersonExternalId, userEmail, setUserEmail }),
    [role, personExternalId, userEmail],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("UserContext must be used within UserProvider");
  }
  return ctx;
}
