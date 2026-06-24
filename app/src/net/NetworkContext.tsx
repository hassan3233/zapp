import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { NativeModules } from "react-native";
import { onSocketStatus, isSocketConnected } from "../socket";

// `true` when we believe the device can reach the network.
const NetCtx = createContext<boolean>(true);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [deviceOnline, setDeviceOnline] = useState(true);
  const [socketOnline, setSocketOnline] = useState(true);
  const everConnected = useRef(false);

  // Device-level connectivity via NetInfo — only if the native module is in
  // this build (community module → check NativeModules directly).
  useEffect(() => {
    if (!(NativeModules as any).RNCNetInfo) return;
    let unsub: undefined | (() => void);
    try {
      const NetInfo = require("@react-native-community/netinfo").default;
      unsub = NetInfo.addEventListener((s: any) => {
        setDeviceOnline(s?.isConnected !== false && s?.isInternetReachable !== false);
      });
    } catch {
      /* ignore */
    }
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Realtime socket up/down — this catches "no internet" on the dev client too.
  // We only trust a disconnect once the socket has connected at least once, so
  // we don't flash "offline" before the user has even logged in.
  useEffect(() => {
    if (isSocketConnected()) everConnected.current = true;
    return onSocketStatus((c) => {
      if (c) everConnected.current = true;
      setSocketOnline(c || !everConnected.current);
    });
  }, []);

  // When NetInfo is in the build (real device), trust it for connectivity —
  // the socket may be intentionally down (e.g. after logout) without meaning
  // the device is offline. Only fall back to the socket signal when NetInfo
  // isn't available (dev client).
  const hasNetInfo = !!(NativeModules as any).RNCNetInfo;
  const online = hasNetInfo ? deviceOnline : socketOnline;
  return <NetCtx.Provider value={online}>{children}</NetCtx.Provider>;
}

export function useOnline(): boolean {
  return useContext(NetCtx);
}
