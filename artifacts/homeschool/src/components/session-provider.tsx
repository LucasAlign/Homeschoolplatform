import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setCsrfToken } from "@/lib/session-api";
type User = {
  userId: string;
  role: "parent" | "student";
  studentId: string | null;
};
type Session = {
  mode: string;
  user: User | null;
  csrfToken: string | null;
  allowSignup: boolean;
};
const SessionContext = createContext<{
  parent: boolean;
  mode: string;
  logout: () => Promise<void>;
}>({ parent: true, mode: "unconfigured", logout: async () => {} });
export const useSession = () => useContext(SessionContext);
export function PasswordSettings() {
  const { logout, mode } = useSession();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (mode !== "family") return null;
  return (
    <details className="border-b p-3">
      <summary className="cursor-pointer">Account password</summary>
      <form
        className="max-w-md space-y-3 mt-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/auth/password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                Object.fromEntries(new FormData(event.currentTarget)),
              ),
            });
            if (!response.ok) throw new Error((await response.json()).error);
            await logout();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          Current password
          <input
            className="block border p-2 w-full"
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label className="block">
          New password (15+ characters)
          <input
            className="block border p-2 w-full"
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={15}
            maxLength={128}
          />
        </label>
        <p>Changing your password signs out all your sessions.</p>
        {error && <p role="alert">{error}</p>}
        <button className="border rounded p-2" disabled={busy}>
          Change password and sign out
        </button>
      </form>
    </details>
  );
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [register, setRegister] = useState(false);
  const queryClient = useQueryClient();
  const identity = useRef<string | undefined>(undefined);
  const events = useRef<BroadcastChannel | null>(null);
  const refreshId = useRef(0);
  async function refresh() {
    const requestId = ++refreshId.current;
    try {
      const response = await fetch("/api/auth/session");
      const data = await response.json();
      if (requestId !== refreshId.current) return;
      if (!response.ok) throw new Error(data.error);
      if (identity.current !== data.user?.userId) queryClient.clear();
      identity.current = data.user?.userId;
      setCsrfToken(data.csrfToken);
      setSession(data);
    } catch (e) {
      if (requestId === refreshId.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const expired = () => {
      refreshId.current++;
      setCsrfToken(null);
      queryClient.clear();
      setSession((s) => (s ? { ...s, user: null } : null));
    };
    const channel = new BroadcastChannel("anchor-session");
    events.current = channel;
    channel.onmessage = () => {
      expired();
      void refresh();
    };
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("session-expired", expired);
    return () => {
      channel.close();
      events.current = null;
      window.removeEventListener("focus", focus);
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(
        register ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (register) {
        setRegister(false);
        setError("Account created. Sign in with your new credentials.");
      } else {
        queryClient.clear();
        await refresh();
        events.current?.postMessage("changed");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setError("");
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok && response.status !== 401) {
      setError("Could not sign out. Please retry.");
      return;
    }
    refreshId.current++;
    queryClient.clear();
    setCsrfToken(null);
    setSession((s) => (s ? { ...s, user: null } : null));
    events.current?.postMessage("changed");
  }
  if (session?.mode === "synthetic" || session?.user)
    return (
      <SessionContext.Provider
        value={{
          parent:
            session.mode === "synthetic" || session.user?.role === "parent",
          mode: session.mode,
          logout,
        }}
      >
        <div key={session.user?.userId ?? "synthetic"}>
          {error && <p role="alert">{error}</p>}
          {children}
        </div>
      </SessionContext.Provider>
    );
  return (
    <main className="max-w-md mx-auto p-8 space-y-5">
      <h1 className="text-3xl font-bold">AnchorOne family sign-in</h1>
      <p>
        Local testing only. Use fictional family accounts. Production access
        remains disabled.
      </p>
      {error && (
        <p role="alert" className="border p-3">
          {error}
        </p>
      )}
      {!session && !error && <p>Checking session...</p>}
      {session?.mode === "family" && (
        <>
          <form key={String(register)} onSubmit={submit} className="space-y-4">
            {register && (
              <label className="block">
                Parent display name
                <input
                  className="block border p-2 w-full"
                  name="name"
                  required
                  maxLength={100}
                />
              </label>
            )}
            <label className="block">
              Username
              <input
                className="block border p-2 w-full"
                name="username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={64}
              />
            </label>
            <label className="block">
              Password
              <input
                className="block border p-2 w-full"
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={register ? 15 : 1}
                maxLength={128}
              />
            </label>
            <button className="border rounded p-3" disabled={busy}>
              {register ? "Create local family" : "Sign in"}
            </button>
          </form>
          {session.allowSignup && (
            <button
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
              className="underline"
            >
              {register
                ? "Back to sign-in"
                : "Create a fictional family account"}
            </button>
          )}
        </>
      )}
      {session && !["family", "synthetic"].includes(session.mode) && (
        <p>
          Set AUTH_MODE=family in the local synthetic development configuration.
        </p>
      )}
    </main>
  );
}
