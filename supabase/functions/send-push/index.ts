// ═══════════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: send-push
// 
// Supports:
// 1. FCM HTTP v1 API (Capacitor Android) - PRIMARY for Android
// 2. FCM Legacy API (fallback for Android)
// 3. APNs (Apple Push Notification service) for iOS
// 4. Expo Push (if using Expo tokens)
// 5. Web Push (in-app via Supabase Realtime)
//
// Environment Variables (set in Supabase Dashboard → Edge Functions → Secrets):
//   FCM_SERVICE_ACCOUNT_JSON - Google service account JSON for FCM HTTP v1
//   FCM_SERVER_KEY - Legacy FCM server key (fallback)
//   SUPABASE_SERVICE_ROLE_KEY - For authorization
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID - Optional for iOS
// ═══════════════════════════════════════════════════════════════════════════════

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface PushRequest {
  deviceToken: string;
  deviceType: "ios" | "android" | "web";
  notification: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  };
}

interface PushResult {
  success: boolean;
  error?: string;
  messageId?: string;
  method?: string;
}

interface ServiceAccountJson {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FCM HTTP v1 API (Modern - uses service account JSON)
// ═══════════════════════════════════════════════════════════════════════════════

function isFCMv1Configured(): boolean {
  return !!Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
}

function getServiceAccount(): ServiceAccountJson | null {
  try {
    const saJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
    if (!saJson) return null;
    return JSON.parse(saJson) as ServiceAccountJson;
  } catch {
    console.error("[FCM v1] Failed to parse FCM_SERVICE_ACCOUNT_JSON");
    return null;
  }
}

/**
 * Create a JWT for Google OAuth2 authentication
 * Uses RS256 signing with the service account private key
 */
async function createGoogleJWT(serviceAccount: ServiceAccountJson): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600, // 1 hour
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header));
  const payloadB64 = btoa(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import the RSA private key
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryKey = atob(pemContents);
  const keyBytes = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i++) {
    keyBytes[i] = binaryKey.charCodeAt(i);
  }

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${unsignedToken}.${signatureB64}`;
}

/**
 * Get OAuth2 access token using service account JWT
 */
async function getGoogleAccessToken(serviceAccount: ServiceAccountJson): Promise<string> {
  const jwt = await createGoogleJWT(serviceAccount);

  const response = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[FCM v1] Token request failed:", error);
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  return data.access_token;
}

/**
 * Send push notification via FCM HTTP v1 API
 * This is the modern, recommended way to send FCM messages
 */
async function sendFCMv1Push(
  deviceToken: string,
  notification: { title: string; body: string; data?: Record<string, unknown> },
  serviceAccount: ServiceAccountJson
): Promise<PushResult> {
  try {
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;

    const notifType = notification.data?.type as string || "default";
    const channelId = [
      "workout_reminder", "meal_reminder", "streak_protection",
      "achievement", "daily_summary", "motivational", "hydration_reminder"
    ].includes(notifType) ? notifType : "default";

    const fcmMessage = {
      message: {
        token: deviceToken,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          ...(notification.data || {}),
          deepLink: String(notification.data?.deepLink || ""),
        },
        android: {
          priority: "HIGH" as const,
          notification: {
            channel_id: channelId,
            sound: "default",
            default_vibrate_timings: true,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      },
    };

    console.log(`[FCM v1] Sending to project: ${projectId}, channel: ${channelId}`);

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify(fcmMessage),
      }
    );

    const result = await response.json();

    if (response.ok && result.name) {
      // Result name format: projects/{project}/messages/{messageId}
      const messageId = result.name.split("/").pop();
      console.log(`[FCM v1] Success! Message ID: ${messageId}`);
      return { success: true, messageId };
    } else {
      console.error("[FCM v1] Error:", JSON.stringify(result));
      
      const errorInfo = result.error;
      if (errorInfo?.status === "UNREGISTERED" || errorInfo?.code === 404) {
        return { success: false, error: "DeviceNotRegistered" };
      }
      return { 
        success: false, 
        error: errorInfo?.message || `HTTP ${response.status}` 
      };
    }
  } catch (error) {
    console.error("[FCM v1] Exception:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "FCM v1 error" 
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FCM Legacy API (Fallback)
// ═══════════════════════════════════════════════════════════════════════════════

function isLegacyFCMConfigured(): boolean {
  return !!Deno.env.get("FCM_SERVER_KEY");
}

async function sendFCMLegacyPush(
  deviceToken: string,
  notification: { title: string; body: string; data?: Record<string, unknown> },
  channelId: string = "default"
): Promise<PushResult> {
  const serverKey = Deno.env.get("FCM_SERVER_KEY");
  if (!serverKey) {
    return { success: false, error: "FCM_SERVER_KEY not configured" };
  }

  try {
    const response = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `key=${serverKey}`,
      },
      body: JSON.stringify({
        to: deviceToken,
        notification: { title: notification.title, body: notification.body, sound: "default" },
        data: { ...notification.data, deepLink: notification.data?.deepLink || "" },
        android: {
          priority: "high",
          notification: { channel_id: channelId, sound: "default", default_vibrate_timings: true },
        },
      }),
    });

    const result = await response.json();

    if (response.ok && result.success === 1) {
      return { success: true, messageId: String(result.message_id || result.multicast_id || "") };
    } else {
      console.error("[FCM Legacy] Error:", JSON.stringify(result));
      if (result.results?.[0]?.error === "NotRegistered" || result.error === "NotRegistered") {
        return { success: false, error: "DeviceNotRegistered" };
      }
      return { success: false, error: result.results?.[0]?.error || result.error || "FCM delivery failed" };
    }
  } catch (error) {
    console.error("[FCM Legacy] Exception:", error);
    return { success: false, error: error instanceof Error ? error.message : "FCM error" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// APNs (Apple Push Notification service) - Optional for iOS
// ═══════════════════════════════════════════════════════════════════════════════

function isAPNsConfigured(): boolean {
  return !!(
    Deno.env.get("APNS_KEY_ID") &&
    Deno.env.get("APNS_TEAM_ID") &&
    Deno.env.get("APNS_PRIVATE_KEY") &&
    Deno.env.get("APNS_BUNDLE_ID")
  );
}

async function createAPNSToken(): Promise<string> {
  const keyId = Deno.env.get("APNS_KEY_ID")!;
  const teamId = Deno.env.get("APNS_TEAM_ID")!;
  const privateKeyP8 = Deno.env.get("APNS_PRIVATE_KEY")!;

  const privateKey = await importPKCS8(privateKeyP8);
  const header = btoa(JSON.stringify({ alg: "ES256", kid: keyId }));
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({ iss: teamId, iat: now }));
  
  const encoder = new TextEncoder();
  const data = encoder.encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data
  );
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return `${header}.${payload}.${signatureBase64}`;
}

async function importPKCS8(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN EC PRIVATE KEY-----/g, "")
    .replace(/-----END EC PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryKey = atob(pemContents);
  const keyBytes = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i++) {
    keyBytes[i] = binaryKey.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function sendAPNsPush(
  deviceToken: string,
  notification: { title: string; body: string; data?: Record<string, unknown> }
): Promise<PushResult> {
  if (!isAPNsConfigured()) {
    return { success: false, error: "APNs not configured" };
  }

  try {
    const bundleId = Deno.env.get("APNS_BUNDLE_ID")!;
    const isProduction = Deno.env.get("APNS_PRODUCTION") === "true";
    const host = isProduction ? "api.push.apple.com" : "api.sandbox.push.apple.com";
    const token = await createAPNSToken();

    const payload = {
      aps: {
        alert: { title: notification.title, body: notification.body },
        sound: "default",
        badge: 1,
      },
      ...notification.data,
    };

    const response = await fetch(
      `https://${host}/3/device/${deviceToken}`,
      {
        method: "POST",
        headers: {
          "authorization": `bearer ${token}`,
          "apns-topic": bundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (response.ok) {
      return { success: true, messageId: crypto.randomUUID() };
    } else {
      const error = await response.json();
      return { success: false, error: error.reason || `HTTP ${response.status}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "APNs error",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Expo Push Notifications - For Expo-managed projects
// ═══════════════════════════════════════════════════════════════════════════════

function isExpoPushToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || 
         token.startsWith("ExpoPushToken[") ||
         /^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i.test(token);
}

async function sendExpoPush(
  expoToken: string,
  notification: { title: string; body: string; data?: Record<string, unknown> }
): Promise<PushResult> {
  try {
    let normalizedToken = expoToken;
    if (expoToken.startsWith("ExpoPushToken[")) {
      normalizedToken = expoToken.replace("ExpoPushToken[", "ExponentPushToken[");
    }

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify([{
        to: normalizedToken,
        title: notification.title,
        body: notification.body,
        data: { ...notification.data, _displayInForeground: true },
        sound: "default",
        priority: "high",
        channelId: "default",
      }]),
    });

    const result = await response.json();
    if (result.data?.[0]?.status === "ok") {
      return { success: true, messageId: result.data[0].id || crypto.randomUUID() };
    } else if (result.data?.[0]?.status === "error") {
      const errorMessage = result.data[0].message || "Unknown Expo error";
      if (errorMessage.includes("DeviceNotRegistered")) {
        return { success: false, error: "DeviceNotRegistered" };
      }
      return { success: false, error: errorMessage };
    }
    return { success: true, messageId: crypto.randomUUID() };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Expo push error" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Web Push (in-app delivery via Supabase Realtime)
// ═══════════════════════════════════════════════════════════════════════════════

async function sendWebPush(
  _subscriptionJson: string,
  _notification: { title: string; body: string; data?: Record<string, unknown> }
): Promise<PushResult> {
  // Web notifications are delivered via Supabase Realtime
  return { success: true, messageId: crypto.randomUUID(), method: "in-app" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Edge Function Handler
// ═══════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Authorization - only accept service role key
  const authHeader = req.headers.get("authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const isAuthorized = serviceKey && authHeader === `Bearer ${serviceKey}`;

  if (!isAuthorized) {
    console.error("[Push] Unauthorized request");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: PushRequest = await req.json();
    const { deviceToken, deviceType, notification } = body;

    if (!deviceToken || !deviceType || !notification) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: deviceToken, deviceType, notification" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[Push] Incoming: ${deviceType} | Token: ${deviceToken.substring(0, 20)}... | Title: ${notification.title}`);

    // ══════════════════════════════════════════════════════
    // PRIORITY 1: Expo Push Tokens (work for iOS + Android)
    // ══════════════════════════════════════════════════════
    if (isExpoPushToken(deviceToken)) {
      console.log("[Push] Detected Expo token, using Expo Push");
      const result = await sendExpoPush(deviceToken, notification);
      return new Response(JSON.stringify({ ...result, method: "expo", platform: deviceType }), {
        status: result.success ? 200 : 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // ══════════════════════════════════════════════════════
    // PRIORITY 2: Platform-specific push
    // ══════════════════════════════════════════════════════
    let result: PushResult;
    let method = "unknown";

    switch (deviceType) {
      case "android": {
        // Try FCM HTTP v1 first (modern, recommended)
        if (isFCMv1Configured()) {
          const serviceAccount = getServiceAccount();
          if (serviceAccount) {
            console.log("[Push] Using FCM HTTP v1 API");
            method = "fcm-v1";
            result = await sendFCMv1Push(deviceToken, notification, serviceAccount);
            break;
          }
        }
        
        // Fallback to legacy FCM
        if (isLegacyFCMConfigured()) {
          console.log("[Push] Using FCM Legacy API");
          method = "fcm-legacy";
          const notifType = notification.data?.type as string || "default";
          const channel = [
            "workout_reminder", "meal_reminder", "streak_protection",
            "achievement", "daily_summary", "motivational", "hydration_reminder"
          ].includes(notifType) ? notifType : "default";
          result = await sendFCMLegacyPush(deviceToken, notification, channel);
          break;
        }

        // No FCM configured - store for in-app delivery
        method = "in-app";
        result = { success: true, error: "No FCM configured. Notification stored for in-app delivery via Realtime." };
        break;
      }

      case "ios": {
        // Try APNs for native iOS
        if (isAPNsConfigured()) {
          method = "apns";
          result = await sendAPNsPush(deviceToken, notification);
        } else {
          method = "in-app";
          result = { success: true, error: "APNs not configured. Notification stored for in-app delivery via Realtime." };
        }
        break;
      }

      case "web": {
        method = "web";
        result = await sendWebPush(deviceToken, notification);
        break;
      }

      default:
        result = { success: false, error: `Unknown device type: ${deviceType}` };
    }

    return new Response(JSON.stringify({
      ...result,
      method,
      platform: deviceType,
    }), {
      status: result.success ? 200 : 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (error) {
    console.error("[send-push] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
