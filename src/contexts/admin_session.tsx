import { ReactNode, useEffect, useRef, useState } from "react";
import axios from "axios";
import { BASE_API2 } from "../constants/api.ts";
import { AdminSessionContext, AdminStatus } from "./admin_session_context.ts";

type SessionResponse = { authenticated: boolean; username?: string };

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminStatus>("loading");
  const [username, setUsername] = useState("");
  const csrfToken = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    axios.get<SessionResponse>(`${BASE_API2}/admin/session`, { withCredentials: true })
      .then(({ data }) => {
        if (!active) return;
        setStatus(data.authenticated ? "authenticated" : "anonymous");
        setUsername(data.authenticated ? data.username ?? "" : "");
      })
      .catch(() => {
        if (active) setStatus("anonymous");
      });
    return () => { active = false; };
  }, []);

  async function getCsrfToken(): Promise<string> {
    if (csrfToken.current) return csrfToken.current;
    const { data } = await axios.get<{ token: string }>(`${BASE_API2}/admin/csrf`, {
      withCredentials: true,
    });
    csrfToken.current = data.token;
    return data.token;
  }

  async function login(name: string, password: string): Promise<void> {
    const token = await getCsrfToken();
    let data: SessionResponse;
    try {
      ({ data } = await axios.post<SessionResponse>(`${BASE_API2}/admin/session`, {
        username: name.trim(), password,
      }, { withCredentials: true, headers: { "X-CSRF-TOKEN": token } }));
    } catch (cause) {
      csrfToken.current = null;
      if (axios.isAxiosError(cause) && cause.response?.status === 401) {
        setUsername("");
        setStatus("anonymous");
      }
      throw cause;
    }
    // 登录会更换会话 ID；下一次写入前重新获取 CSRF token。
    csrfToken.current = null;
    setUsername(data.username ?? name.trim());
    setStatus("authenticated");
  }

  async function logout(): Promise<void> {
    const token = await getCsrfToken();
    try {
      await axios.delete(`${BASE_API2}/admin/session`, {
        withCredentials: true,
        headers: { "X-CSRF-TOKEN": token },
      });
    } catch (cause) {
      csrfToken.current = null;
      if (axios.isAxiosError(cause) && cause.response?.status === 401) {
        setUsername("");
        setStatus("anonymous");
      }
      throw cause;
    }
    csrfToken.current = null;
    setUsername("");
    setStatus("anonymous");
  }

  function handleAuthError(httpStatus: number) {
    // 401 表示会话失效；403 通常需要重取 CSRF token。
    if (httpStatus === 401 || httpStatus === 403) csrfToken.current = null;
    if (httpStatus === 401) {
      setUsername("");
      setStatus("anonymous");
    }
  }

  return <AdminSessionContext.Provider value={{
    status, username, login, logout, getCsrfToken, handleAuthError,
  }}>
    {children}
  </AdminSessionContext.Provider>;
}
