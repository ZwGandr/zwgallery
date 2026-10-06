import { createContext, useContext } from "react";

export type AdminStatus = "loading" | "anonymous" | "authenticated";

export type AdminSessionValue = {
  status: AdminStatus;
  username: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getCsrfToken: () => Promise<string>;
  handleAuthError: (status: number) => void;
};

export const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function useAdminSession(): AdminSessionValue {
  const session = useContext(AdminSessionContext);
  if (!session) throw new Error("AdminSessionProvider is missing");
  return session;
}
