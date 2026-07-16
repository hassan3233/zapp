import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, setAuthToken } from "../api";
import { connectSocket, disconnectSocket } from "../socket";
import { ensureKeys } from "../crypto/e2ee";
import { registerForPush, unregisterForPush } from "../push";
import type { Gender, User } from "../types";

// Make sure this device has an E2EE keypair and the server has our public key.
async function ensureE2EE(currentUser: User | null) {
  try {
    const pk = await ensureKeys();
    if (pk && currentUser && currentUser.publicKey !== pk) {
      await api.setPublicKey(pk);
    }
  } catch {
    /* non-fatal — chat still works, just without E2EE on this device */
  }
}

const TOKEN_KEY = "zapp.token";
const USER_KEY = "zapp.user";

type ProfileInput = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  avatar?: string | null;
  bio?: string | null;
};

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  requestOtp: (phone: string, channel?: "sms" | "call") => Promise<string | undefined>; // returns dev code
  verifyOtp: (phone: string, code: string) => Promise<boolean>; // returns profileComplete
  loginWithFirebaseToken: (idToken: string) => Promise<boolean>; // returns profileComplete
  updateProfile: (input: ProfileInput) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore a saved session on launch.
  useEffect(() => {
    (async () => {
      try {
        const [savedToken, savedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (savedToken && savedUser) {
          const parsed = JSON.parse(savedUser);
          setAuthToken(savedToken);
          setToken(savedToken);
          setUser(parsed);
          connectSocket(savedToken);
          ensureE2EE(parsed);
          registerForPush();
        }
      } catch {
        // ignore restore errors
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persist(nextToken: string, nextUser: User) {
    setAuthToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    connectSocket(nextToken);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, nextToken],
      [USER_KEY, JSON.stringify(nextUser)],
    ]);
    ensureE2EE(nextUser);
    registerForPush();
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      loading,
      requestOtp: async (phone, channel) => {
        const res = await api.requestOtp(phone, channel);
        return res.devCode;
      },
      loginWithFirebaseToken: async (idToken) => {
        const res = await api.firebaseLogin(idToken);
        await persist(res.token, res.user);
        return res.profileComplete;
      },
      verifyOtp: async (phone, code) => {
        const res = await api.verifyOtp(phone, code);
        await persist(res.token, res.user);
        return res.profileComplete;
      },
      updateProfile: async (input) => {
        const res = await api.updateProfile(input);
        setUser(res.user);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.user));
      },
      logout: async () => {
        await unregisterForPush();
        disconnectSocket();
        setAuthToken(null);
        setToken(null);
        setUser(null);
        await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
      },
    }),
    [user, token, loading]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
