import React, { createContext, useContext, useEffect, useState } from "react";
import { getSocket, onSocketStatus } from "../socket";

type PresenceAPI = {
  isOnline: (id?: number | null) => boolean;
  lastSeen: (id?: number | null) => string | undefined;
};

const PresenceCtx = createContext<PresenceAPI>({
  isOnline: () => false,
  lastSeen: () => undefined,
});

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState<Set<number>>(new Set());
  const [seen, setSeen] = useState<Record<number, string>>({});

  useEffect(() => {
    function onState(p: any) {
      setOnline(new Set((p?.online || []).map((n: any) => Number(n))));
      if (p?.lastSeen) {
        const norm: Record<number, string> = {};
        for (const k of Object.keys(p.lastSeen)) norm[Number(k)] = p.lastSeen[k];
        setSeen((prev) => ({ ...prev, ...norm }));
      }
    }
    function onUpdate(p: any) {
      const id = Number(p.userId);
      setOnline((prev) => {
        const next = new Set(prev);
        if (p.online) next.add(id);
        else next.delete(id);
        return next;
      });
      if (!p.online && p.lastSeen) setSeen((prev) => ({ ...prev, [id]: p.lastSeen }));
    }
    function attach() {
      const s = getSocket();
      if (!s) return;
      s.off("presence:state", onState).on("presence:state", onState);
      s.off("presence:update", onUpdate).on("presence:update", onUpdate);
    }
    attach();
    const unsub = onSocketStatus((c) => {
      if (c) attach();
      else setOnline(new Set()); // lost connection → everyone shows offline
    });
    return () => {
      const s = getSocket();
      s?.off("presence:state", onState);
      s?.off("presence:update", onUpdate);
      unsub();
    };
  }, []);

  const value: PresenceAPI = {
    isOnline: (id) => (id != null ? online.has(Number(id)) : false),
    lastSeen: (id) => (id != null ? seen[Number(id)] : undefined),
  };
  return <PresenceCtx.Provider value={value}>{children}</PresenceCtx.Provider>;
}

export function usePresence() {
  return useContext(PresenceCtx);
}
