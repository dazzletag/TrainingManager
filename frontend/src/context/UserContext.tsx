import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { fetchStaffDirectory } from "../services/api";

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
  const [role, setRole] = useState<Role>("admin");
  const [personExternalId, setPersonExternalId] = useState(defaultExternalId);
  const [userEmail, setUserEmail] = useState("demo.user@trainingmanager.local");

  useEffect(() => {
    if (personExternalId && personExternalId !== placeholderExternalId) {
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
