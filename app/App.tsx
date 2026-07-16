import React, { useEffect } from "react";
import { ActivityIndicator, View, Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  NavigationContainer,
  createNavigationContainerRef,
  getFocusedRouteNameFromRoute,
  DarkTheme,
  DefaultTheme,
  Theme,
} from "@react-navigation/native";
import {
  setupBackgroundMessageHandler,
  initPushHandlers,
} from "./src/push";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { I18nProvider, useT } from "./src/i18n/i18n";
import { CallProvider } from "./src/call/CallContext";
import CallOverlay from "./src/call/CallOverlay";
import { NetworkProvider } from "./src/net/NetworkContext";
import { PresenceProvider } from "./src/net/PresenceContext";
import OfflineBanner from "./src/components/OfflineBanner";
import WelcomeScreen from "./src/screens/WelcomeScreen";
import PhoneScreen from "./src/screens/PhoneScreen";
import OtpScreen from "./src/screens/OtpScreen";
import EmailScreen from "./src/screens/EmailScreen";
import ProfileSetupScreen from "./src/screens/ProfileSetupScreen";
import ConversationsScreen from "./src/screens/ConversationsScreen";
import NewChatScreen from "./src/screens/NewChatScreen";
import ChatScreen from "./src/screens/ChatScreen";
import ContactProfileScreen from "./src/screens/ContactProfileScreen";
import CallsScreen from "./src/screens/CallsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import EditProfileScreen from "./src/screens/EditProfileScreen";
import AccountScreen from "./src/screens/AccountScreen";
import ChatsSettingsScreen from "./src/screens/ChatsSettingsScreen";
import StorageDataScreen from "./src/screens/StorageDataScreen";
import LanguageScreen from "./src/screens/LanguageScreen";
import ThemeScreen from "./src/screens/ThemeScreen";
import { ThemeProvider, useTheme, useThemePref } from "./src/theme";

// Register the FCM background handler before the app renders (required so
// notifications are handled when the app is killed/backgrounded).
setupBackgroundMessageHandler();

// Ref + helper so a notification tap can navigate into the right chat, even if
// the app was cold-started (queued until navigation is ready).
const navigationRef = createNavigationContainerRef();
let pendingChat: { conversationId: number; title?: string } | null = null;

function openChatFromNotification(conversationId: number, title?: string) {
  if (navigationRef.isReady()) {
    try {
      (navigationRef.navigate as any)("ChatsTab", {
        screen: "Chat",
        params: { conversationId, title },
      });
    } catch {
      /* not authenticated / route missing — app still opens */
    }
  } else {
    pendingChat = { conversationId, title };
  }
}

// Header/content styling that follows the active theme.
function useScreenOptions() {
  const colors = useTheme();
  return {
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.text,
    contentStyle: { backgroundColor: colors.bg },
  } as const;
}

const AuthStackNav = createNativeStackNavigator();
function AuthStack() {
  const { t } = useT();
  const screenOptions = useScreenOptions();
  return (
    <AuthStackNav.Navigator screenOptions={screenOptions}>
      <AuthStackNav.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <AuthStackNav.Screen name="Phone" component={PhoneScreen} options={{ headerShown: false }} />
      <AuthStackNav.Screen name="Otp" component={OtpScreen} options={{ title: t("title.verify") }} />
    </AuthStackNav.Navigator>
  );
}

const OnboardStackNav = createNativeStackNavigator();
function OnboardingStack() {
  const { t } = useT();
  const screenOptions = useScreenOptions();
  return (
    <OnboardStackNav.Navigator screenOptions={screenOptions}>
      <OnboardStackNav.Screen name="Email" component={EmailScreen} options={{ title: t("title.email"), headerBackVisible: false }} />
      <OnboardStackNav.Screen name="ProfileSetup" component={ProfileSetupScreen} options={{ title: t("title.profile") }} />
    </OnboardStackNav.Navigator>
  );
}

const ChatsStackNav = createNativeStackNavigator();
function ChatsStack() {
  const { t } = useT();
  const screenOptions = useScreenOptions();
  return (
    <ChatsStackNav.Navigator screenOptions={screenOptions}>
      <ChatsStackNav.Screen name="Conversations" component={ConversationsScreen} options={{ title: t("appName") }} />
      <ChatsStackNav.Screen name="NewChat" component={NewChatScreen} options={{ title: t("title.newChat") }} />
      <ChatsStackNav.Screen name="Chat" component={ChatScreen} />
      <ChatsStackNav.Screen
        name="ContactProfile"
        component={ContactProfileScreen}
        options={{ title: "" }}
      />
    </ChatsStackNav.Navigator>
  );
}

const SettingsStackNav = createNativeStackNavigator();
function SettingsStack() {
  const { t } = useT();
  const screenOptions = useScreenOptions();
  return (
    <SettingsStackNav.Navigator screenOptions={screenOptions}>
      <SettingsStackNav.Screen name="Settings" component={SettingsScreen} options={{ title: t("tab.settings") }} />
      <SettingsStackNav.Screen name="EditProfile" component={EditProfileScreen} options={{ title: t("title.editProfile") }} />
      <SettingsStackNav.Screen name="Account" component={AccountScreen} options={{ title: t("title.account") }} />
      <SettingsStackNav.Screen name="ChatsSettings" component={ChatsSettingsScreen} options={{ title: t("tab.chats") }} />
      <SettingsStackNav.Screen name="StorageData" component={StorageDataScreen} options={{ title: t("title.storage") }} />
      <SettingsStackNav.Screen name="Language" component={LanguageScreen} options={{ title: t("title.language") }} />
      <SettingsStackNav.Screen name="Theme" component={ThemeScreen} options={{ title: t("title.theme") }} />
    </SettingsStackNav.Navigator>
  );
}

const CallsStackNav = createNativeStackNavigator();
function CallsStack() {
  const { t } = useT();
  const screenOptions = useScreenOptions();
  return (
    <CallsStackNav.Navigator screenOptions={screenOptions}>
      <CallsStackNav.Screen name="Calls" component={CallsScreen} options={{ title: t("tab.calls") }} />
    </CallsStackNav.Navigator>
  );
}

const Tab = createBottomTabNavigator();
function tabIcon(emoji: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );
}
function AppTabs() {
  const { t } = useT();
  const colors = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen
        name="ChatsTab"
        component={ChatsStack}
        options={({ route }) => ({
          title: t("tab.chats"),
          tabBarIcon: tabIcon("💬"),
          // Hide the bottom tab bar while inside an open chat (and its profile).
          tabBarStyle: ["Chat", "ContactProfile"].includes(
            getFocusedRouteNameFromRoute(route) ?? "Conversations"
          )
            ? { display: "none" as const }
            : { backgroundColor: colors.surface, borderTopColor: colors.border },
        })}
      />
      <Tab.Screen name="CallsTab" component={CallsStack} options={{ title: t("tab.calls"), tabBarIcon: tabIcon("📞") }} />
      <Tab.Screen name="SettingsTab" component={SettingsStack} options={{ title: t("tab.settings"), tabBarIcon: tabIcon("⚙️") }} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { token, user, loading } = useAuth();
  const { ready } = useT();
  const colors = useTheme();

  if (loading || !ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!token) return <AuthStack />;
  if (!user?.profileComplete) return <OnboardingStack />;

  return (
    <CallProvider>
      <AppTabs />
      <CallOverlay />
    </CallProvider>
  );
}

// Inner tree (child of ThemeProvider) so navigation chrome follows the theme.
function Root() {
  const colors = useTheme();
  const { scheme } = useThemePref();

  // Route notification taps (token refresh too) into the app.
  useEffect(() => initPushHandlers(openChatFromNotification), []);

  const base = scheme === "light" ? DefaultTheme : DarkTheme;
  const navTheme: Theme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      primary: colors.primary,
      border: colors.border,
    },
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OfflineBanner />
      <View style={{ flex: 1 }}>
        <NavigationContainer
          ref={navigationRef}
          theme={navTheme}
          onReady={() => {
            if (pendingChat) {
              const p = pendingChat;
              pendingChat = null;
              openChatFromNotification(p.conversationId, p.title);
            }
          }}
        >
          <RootNavigator />
        </NavigationContainer>
      </View>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <NetworkProvider>
              <PresenceProvider>
                <Root />
              </PresenceProvider>
            </NetworkProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
