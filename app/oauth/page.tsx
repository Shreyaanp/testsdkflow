"use client";

import { useEffect, useState } from "react";
import { initMercleAuth, clearSession } from "@/lib/mercle-auth";
import { MercleWallet } from "@/components/MercleWallet";

type User = {
  id?: string;
  mercleUserId?: string;
  username?: string;
  verifiedServices?: string[];
  pfpUrl?: string;
};

export default function OAuthPage() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<string>("booting");
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setStatus("signing-in");
      const u = await initMercleAuth({
        onSession: (s) => {
          setSessionId(s.session_id);
          setStatus("sdk-session-created");
        },
        onStatus: (s) => setStatus(`sdk-${s.status}`),
      });
      if (u) {
        setUser(u as User);
        setStatus("ready");
      } else {
        setStatus("not-signed-in");
      }
    })();
  }, []);

  return (
    <div className="page">
      <h1>Mercle · SDK demo</h1>

      <section className="card">
        <h2>Auth</h2>
        {user ? (
          <>
            <p className="row">
              <span className="ok">verified</span>
              <span>{user.username ?? "User"}</span>
            </p>
            <p className="muted">id: {user.mercleUserId ?? user.id}</p>
            {user.verifiedServices?.length ? (
              <p className="muted">services: {user.verifiedServices.join(", ")}</p>
            ) : null}
            <button
              onClick={() => {
                clearSession(true);
                setUser(null);
                setStatus("signed-out");
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <p className="sub">status: {status}</p>
            {sessionId ? <p className="muted">session: {sessionId}</p> : null}
          </>
        )}
      </section>

      {user ? <MercleWallet /> : null}
    </div>
  );
}
