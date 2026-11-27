import { recordLoginConnection } from "../_shared/sessionConnection.ts";
import "jsr:@supabase/functions-js@2.111.0/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  adminClient,
  canonicalizeIranPhone,
  hmacSha256Hex,
  getClientIp,
  isValidUuid,
  corsHeaders,
  checkOrigin,
  jsonResponse,
  PHONE_OTP_MAX_BODY_BYTES as MAX_BODY_BYTES,
  PHONE_OTP_MAX_RAW_PHONE_LEN as MAX_RAW_PHONE_LEN,
  type PhoneAuthConfig,
  getPhoneAuthConfig,
} from "../_shared/phoneOtpLoginV2.ts";
import {
  type GatewayParams,
  type GatewayRpcResult,
  type ReconcileRpcResult,
  finalizeGateway,
} from "./gatewayFinalization.ts";

interface ReadinessConfig {
  backendReady: boolean;
  canonicalEnabled: boolean;
}

const READINESS_KEYS = [
  "phone_otp_login_backend_ready",
  "phone_login_canonical_enabled",
] as const;

async function getReadiness(): Promise<ReadinessConfig> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("system_config")
    .select("key, value")
    .eq("section", "security")
    .in("key", [...READINESS_KEYS]);

  if (error || !data) throw new Error("CONFIG_UNAVAILABLE");
  if (data.length !== READINESS_KEYS.length) throw new Error("CONFIG_UNAVAILABLE");

  const map: Record<string, string> = {};
  for (const row of data) {
    map[row.key] = row.value;
  }
  for (const key of READINESS_KEYS) {
    if (!(key in map)) throw new Error("CONFIG_UNAVAILABLE");
  }

  const backendReady = map["phone_otp_login_backend_ready"] === "true";
  const canonicalEnabled = map["phone_login_canonical_enabled"] === "true";
  if (!backendReady || !canonicalEnabled) throw new Error("BACKEND_NOT_READY");
  return { backendReady, canonicalEnabled };
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

async function consumeVerifyRateLimit(
  admin: ReturnType<typeof adminClient>,
  phoneHash: string,
  ipHash: string,
  phoneLimit: number,
  ipLimit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { data, error } = await admin.rpc("consume_phone_otp_login_rate_limit_v2", {
    p_purpose: "phone_otp_login_verify",
    p_phone_hash: phoneHash,
    p_ip_hash: ipHash,
    p_phone_limit: phoneLimit,
    p_ip_limit: ipLimit,
    p_window_seconds: windowSeconds,
  });

  if (error) throw new Error("RATE_LIMIT_UNAVAILABLE");

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("RATE_LIMIT_UNAVAILABLE");

  const allowed = row.allowed === true;
  const retryAfter = typeof row.retry_after_seconds === "number" ? Math.max(1, row.retry_after_seconds) : 1;
  return { allowed, retryAfterSeconds: retryAfter };
}

interface ClaimResult {
  claimed: boolean;
  userId: string;
  phoneHash: string;
  claimExpiresAt: string;
  errorCode: string | null;
}

async function claimChallenge(
  admin: ReturnType<typeof adminClient>,
  challengeId: string,
  otpHash: string,
  claimId: string,
): Promise<ClaimResult> {
  const { data, error } = await admin.rpc("claim_phone_otp_login_challenge_v2", {
    p_challenge_id: challengeId,
    p_otp_hash: otpHash,
    p_claim_id: claimId,
  });

  if (error) throw new Error("CLAIM_UNAVAILABLE");

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("CLAIM_UNAVAILABLE");

  const claimed = row.claimed === true;
  const userId = typeof row.user_id === "string" ? row.user_id : "";
  const phoneHash = typeof row.phone_hash === "string" ? row.phone_hash : "";
  const claimExpiresAt = typeof row.claim_expires_at === "string" ? row.claim_expires_at : "";
  const errorCode = typeof row.error_code === "string" ? row.error_code : null;

  if (claimed) {
    if (errorCode !== null) throw new Error("CLAIM_UNAVAILABLE");
    if (!isValidUuid(userId)) throw new Error("CLAIM_UNAVAILABLE");
    if (!/^[0-9a-f]{64}$/.test(phoneHash)) throw new Error("CLAIM_UNAVAILABLE");
    if (!claimExpiresAt) throw new Error("CLAIM_UNAVAILABLE");
    const expiry = new Date(claimExpiresAt).getTime();
    if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error("CLAIM_UNAVAILABLE");
  }

  return { claimed, userId, phoneHash, claimExpiresAt, errorCode };
}

async function releaseClaim(
  admin: ReturnType<typeof adminClient>,
  challengeId: string,
  claimId: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("release_phone_otp_login_challenge_v2", {
      p_challenge_id: challengeId,
      p_claim_id: claimId,
    });

    if (error) return false;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return false;

    const released = row.released === true;
    const errorCode = typeof row.error_code === "string" ? row.error_code : null;

    if (released && errorCode === null) return true;
    if (errorCode === "ALREADY_CONSUMED") return true;

    return false;
  } catch {
    return false;
  }
}

interface EligibilityResult {
  eligible: boolean;
  email: string;
}

async function recheckEligibility(
  admin: ReturnType<typeof adminClient>,
  userId: string,
): Promise<EligibilityResult> {
  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr) throw new Error("AUTH_UNAVAILABLE");
  if (!authData?.user || !authData.user.email) return { eligible: false, email: "" };

  const user = authData.user;
  if (!user.phone_confirmed_at) return { eligible: false, email: "" };

  const deletedAt = (user as unknown as Record<string, unknown>).deleted_at as string | undefined;
  if (deletedAt) return { eligible: false, email: "" };

  const bannedUntil = (user as unknown as Record<string, unknown>).banned_until as string | undefined;
  if (bannedUntil) {
    const bannedDate = new Date(bannedUntil);
    if (bannedDate.getTime() > Date.now()) return { eligible: false, email: "" };
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("account_status, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileErr) throw new Error("PROFILE_UNAVAILABLE");
  if (!profile) return { eligible: false, email: "" };
  if (profile.account_status !== "ACTIVE") return { eligible: false, email: "" };
  if (profile.is_active !== true) return { eligible: false, email: "" };

  return { eligible: true, email: user.email };
}

async function generateMagicLinkToken(
  admin: ReturnType<typeof adminClient>,
  email: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data?.properties) throw new Error("SESSION_CREATION_UNAVAILABLE");

  const hashedToken = data.properties.hashed_token;
  const verificationType = data.properties.verification_type;

  if (typeof hashedToken !== "string" || !hashedToken) throw new Error("SESSION_CREATION_UNAVAILABLE");
  if (verificationType !== "magiclink") throw new Error("SESSION_CREATION_UNAVAILABLE");

  return hashedToken;
}

interface SessionResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

async function createSessionViaVerifyOtp(
  hashedToken: string,
): Promise<SessionResult> {
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );

  const { data, error } = await anon.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });

  if (error || !data?.session || !data?.user) throw new Error("SESSION_CREATION_UNAVAILABLE");

  const accessToken = data.session.access_token;
  const refreshToken = data.session.refresh_token;
  const userId = data.user.id;

  if (!accessToken || !refreshToken) throw new Error("SESSION_CREATION_UNAVAILABLE");
  if (!isValidUuid(userId)) throw new Error("SESSION_CREATION_UNAVAILABLE");

  return { accessToken, refreshToken, userId };
}

interface JwtClaims {
  sub: string;
  sessionId: string;
  role: string;
  aal: string;
  amr: Array<{ method: string }>;
  exp: number;
}

function decodeJwt(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("JWT_INVALID");
  const encodedPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const paddedPayload = encodedPayload.padEnd(
    encodedPayload.length + ((4 - (encodedPayload.length % 4)) % 4),
    "=",
  );
  const payload = JSON.parse(atob(paddedPayload));

  const sub = payload.sub;
  const sessionId = payload.session_id;
  const role = payload.role;
  const aal = payload.aal;
  const amr = payload.amr;
  const exp = payload.exp;

  if (typeof sub !== "string" || !isValidUuid(sub)) throw new Error("JWT_INVALID");
  if (typeof sessionId !== "string" || !isValidUuid(sessionId)) throw new Error("JWT_INVALID");
  if (typeof role !== "string" || role !== "authenticated") throw new Error("JWT_INVALID");
  if (typeof aal !== "string" || aal !== "aal1") throw new Error("JWT_INVALID");
  if (!Array.isArray(amr)) throw new Error("JWT_INVALID");

  const hasMagiclink = amr.some((m: { method?: string }) => m?.method === "magiclink");
  const hasPassword = amr.some((m: { method?: string }) => m?.method === "password");
  if (!hasMagiclink) throw new Error("JWT_INVALID");
  if (hasPassword) throw new Error("JWT_INVALID");

  if (typeof exp !== "number" || exp <= Math.floor(Date.now() / 1000)) throw new Error("JWT_INVALID");

  return { sub, sessionId, role, aal, amr, exp };
}

async function validateTokenWithAdmin(
  admin: ReturnType<typeof adminClient>,
  accessToken: string,
  expectedUserId: string,
): Promise<void> {
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data?.user) throw new Error("JWT_INVALID");
  if (data.user.id !== expectedUserId) throw new Error("JWT_INVALID");
}

async function localLogout(accessToken: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")!}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "apikey": Deno.env.get("SUPABASE_ANON_KEY")!,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function cleanupCreatedSession(
  admin: ReturnType<typeof adminClient>,
  accessToken: string,
  challengeId: string,
  claimId: string,
): Promise<boolean> {
  const logoutOk = await localLogout(accessToken);
  const releaseOk = await releaseClaim(admin, challengeId, claimId);
  return logoutOk && releaseOk;
}

async function authorizeGateway(
  admin: ReturnType<typeof adminClient>,
  params: GatewayParams,
  deviceSummary: string,
): Promise<GatewayRpcResult> {
  const rpcArgs = {
    p_session_id: params.sessionId,
    p_user_id: params.userId,
    p_challenge_id: params.challengeId,
    p_claim_id: params.claimId,
    p_phone_hash: params.phoneHash,
    p_ip_hash: params.ipHash,
  };

  const { data, error } = await admin.rpc("authorize_phone_otp_gateway_session_v2", { ...rpcArgs, p_device_summary: deviceSummary });

  if (error) throw new Error("GATEWAY_UNAVAILABLE");

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("GATEWAY_UNAVAILABLE");

  const authorized = row.authorized === true;
  const sessionId = typeof row.session_id === "string" ? row.session_id : null;
  const errorCode = typeof row.error_code === "string" ? row.error_code : null;

  if (!authorized) {
    return { authorized: false, sessionId, errorCode };
  }

  if (sessionId !== params.sessionId) throw new Error("GATEWAY_UNAVAILABLE");
  if (errorCode !== null) throw new Error("GATEWAY_UNAVAILABLE");

  return { authorized: true, sessionId, errorCode: null };
}

async function reconcileGateway(
  admin: ReturnType<typeof adminClient>,
  params: GatewayParams,
): Promise<ReconcileRpcResult> {
  const rpcArgs = {
    p_session_id: params.sessionId,
    p_user_id: params.userId,
    p_challenge_id: params.challengeId,
    p_claim_id: params.claimId,
    p_phone_hash: params.phoneHash,
    p_ip_hash: params.ipHash,
  };

  const { data, error } = await admin.rpc("reconcile_phone_otp_gateway_session_v2", rpcArgs);

  if (error) throw new Error("GATEWAY_UNAVAILABLE");

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("GATEWAY_UNAVAILABLE");

  const authorized = row.authorized === true;
  const errorCode = typeof row.error_code === "string" ? row.error_code : null;

  return { authorized, errorCode };
}

async function writeAudit(
  admin: ReturnType<typeof adminClient>,
): Promise<void> {
  try {
    await admin.from("audit_log").insert({
      module: "auth",
      action: "phone_otp_login_verified",
      entity_name: "auth",
      details: JSON.stringify({ login_method: "phone_otp" }),
      severity: "info",
    });
  } catch {
    // best effort
  }
}

Deno.serve(async (req: Request) => {
  let allowedOrigin: string | null = null;
  let config: PhoneAuthConfig;

  try {
    config = await getPhoneAuthConfig();
    const origin = req.headers.get("Origin");
    allowedOrigin = checkOrigin(origin, config.origins);
  } catch {
    console.log("[PHONE_OTP_VERIFY_V2] config unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, null);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders(allowedOrigin) });
  }

  if (!allowedOrigin) {
    return jsonResponse({ error: "INVALID_REQUEST" }, 400, null);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, allowedOrigin);
  }

  const contentType = req.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonResponse({ error: "INVALID_CONTENT_TYPE" }, 400, allowedOrigin);
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse({ error: "INVALID_BODY" }, 400, allowedOrigin);
  }

  const bodyBytes = new TextEncoder().encode(rawBody).byteLength;
  if (bodyBytes > MAX_BODY_BYTES) {
    return jsonResponse({ error: "BODY_TOO_LARGE" }, 400, allowedOrigin);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "INVALID_BODY" }, 400, allowedOrigin);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return jsonResponse({ error: "INVALID_BODY" }, 400, allowedOrigin);
  }

  const body = parsed as Record<string, unknown>;
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length !== 3 ||
      !bodyKeys.includes("challenge_id") ||
      !bodyKeys.includes("phone") ||
      !bodyKeys.includes("otp")) {
    return jsonResponse({ error: "INVALID_BODY" }, 400, allowedOrigin);
  }

  const challengeIdRaw = body.challenge_id;
  const phoneRaw = body.phone;
  const otpRaw = body.otp;

  if (typeof challengeIdRaw !== "string" || !isValidUuid(challengeIdRaw)) {
    return jsonResponse({ error: "INVALID_BODY" }, 400, allowedOrigin);
  }
  if (typeof phoneRaw !== "string" || phoneRaw.length === 0 || phoneRaw.length > MAX_RAW_PHONE_LEN) {
    return jsonResponse({ error: "INVALID_BODY" }, 400, allowedOrigin);
  }
  if (typeof otpRaw !== "string" || !/^\d{6}$/.test(otpRaw)) {
    return jsonResponse({ error: "INVALID_BODY" }, 400, allowedOrigin);
  }

  const canonicalPhone = canonicalizeIranPhone(phoneRaw);
  if (!canonicalPhone) {
    return jsonResponse({ error: "INVALID_BODY" }, 400, allowedOrigin);
  }

  if (config.pepper.length < 32) {
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  try {
    await getReadiness();
  } catch {
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  const admin = adminClient();
  const clientIp = getClientIp(req);

  const phoneHash = await hmacSha256Hex(config.pepper, `phone-otp-login-v2|phone|${canonicalPhone}`);
  const ipHash = await hmacSha256Hex(config.pepper, `phone-otp-login-v2|ip|${clientIp}`);
  const otpHash = await hmacSha256Hex(config.pepper, `phone-otp-login-v2|otp|${challengeIdRaw}|${phoneHash}|${otpRaw}`);

  const verifyRateLongPhoneHash = await hmacSha256Hex(config.pepper, `phone-otp-login-v2|verify-rate-long|phone|${canonicalPhone}`);
  const verifyRateLongIpHash = await hmacSha256Hex(config.pepper, `phone-otp-login-v2|verify-rate-long|ip|${clientIp}`);
  const verifyRateShortPhoneHash = await hmacSha256Hex(config.pepper, `phone-otp-login-v2|verify-rate-short|phone|${canonicalPhone}`);
  const verifyRateShortIpHash = await hmacSha256Hex(config.pepper, `phone-otp-login-v2|verify-rate-short|ip|${clientIp}`);

  let longRateLimit: RateLimitResult;
  try {
    longRateLimit = await consumeVerifyRateLimit(admin, verifyRateLongPhoneHash, verifyRateLongIpHash, 10, 100, 900);
  } catch {
    console.log("[PHONE_OTP_VERIFY_V2] rate limit unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }
  if (!longRateLimit.allowed) {
    return jsonResponse({ error: "RATE_LIMITED", retry_after_seconds: longRateLimit.retryAfterSeconds }, 429, allowedOrigin);
  }

  let shortRateLimit: RateLimitResult;
  try {
    shortRateLimit = await consumeVerifyRateLimit(admin, verifyRateShortPhoneHash, verifyRateShortIpHash, 5, 30, 60);
  } catch {
    console.log("[PHONE_OTP_VERIFY_V2] rate limit unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }
  if (!shortRateLimit.allowed) {
    return jsonResponse({ error: "RATE_LIMITED", retry_after_seconds: shortRateLimit.retryAfterSeconds }, 429, allowedOrigin);
  }

  const claimId = crypto.randomUUID();

  let claim: ClaimResult;
  try {
    claim = await claimChallenge(admin, challengeIdRaw, otpHash, claimId);
  } catch {
    console.log("[PHONE_OTP_VERIFY_V2] claim unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  const CLAIM_ERROR_MAP: Record<string, { error: string; status: number; retry?: number }> = {
    INVALID_OTP: { error: "INVALID_OR_EXPIRED_OTP", status: 401 },
    CHALLENGE_LOCKED: { error: "INVALID_OR_EXPIRED_OTP", status: 401 },
    CHALLENGE_EXPIRED: { error: "INVALID_OR_EXPIRED_OTP", status: 401 },
    INVALID_CHALLENGE: { error: "INVALID_OR_EXPIRED_OTP", status: 401 },
    INVALID_CHALLENGE_STATE: { error: "INVALID_OR_EXPIRED_OTP", status: 401 },
    DELIVERY_NOT_CONFIRMED: { error: "INVALID_OR_EXPIRED_OTP", status: 401 },
    ALREADY_CONSUMED: { error: "INVALID_OR_EXPIRED_OTP", status: 401 },
    ACTIVE_PROCESSING: { error: "REQUEST_IN_PROGRESS", status: 409, retry: 1 },
  };

  if (!claim.claimed) {
    const mapped = claim.errorCode ? CLAIM_ERROR_MAP[claim.errorCode] : null;
    if (mapped) {
      if (mapped.retry !== undefined) {
        return jsonResponse({ error: mapped.error, retry_after_seconds: mapped.retry }, mapped.status, allowedOrigin);
      }
      return jsonResponse({ error: mapped.error }, mapped.status, allowedOrigin);
    }
    console.log("[PHONE_OTP_VERIFY_V2] claim unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  if (claim.phoneHash !== phoneHash) {
    await releaseClaim(admin, challengeIdRaw, claimId);
    console.log("[PHONE_OTP_VERIFY_V2] claim unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  let eligibility: EligibilityResult;
  try {
    eligibility = await recheckEligibility(admin, claim.userId);
  } catch {
    await releaseClaim(admin, challengeIdRaw, claimId);
    console.log("[PHONE_OTP_VERIFY_V2] claim unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  if (!eligibility.eligible) {
    await releaseClaim(admin, challengeIdRaw, claimId);
    return jsonResponse({ error: "INVALID_OR_EXPIRED_OTP" }, 401, allowedOrigin);
  }

  let hashedToken: string;
  try {
    hashedToken = await generateMagicLinkToken(admin, eligibility.email);
  } catch {
    await releaseClaim(admin, challengeIdRaw, claimId);
    console.log("[PHONE_OTP_VERIFY_V2] session creation unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  let session: SessionResult;
  try {
    session = await createSessionViaVerifyOtp(hashedToken);
  } catch {
    await releaseClaim(admin, challengeIdRaw, claimId);
    console.log("[PHONE_OTP_VERIFY_V2] session creation unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  if (session.userId !== claim.userId) {
    await cleanupCreatedSession(admin, session.accessToken, challengeIdRaw, claimId);
    console.log("[PHONE_OTP_VERIFY_V2] session creation unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  let jwtClaims: JwtClaims;
  try {
    jwtClaims = decodeJwt(session.accessToken);
  } catch {
    await cleanupCreatedSession(admin, session.accessToken, challengeIdRaw, claimId);
    console.log("[PHONE_OTP_VERIFY_V2] session creation unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  if (jwtClaims.sub !== claim.userId) {
    await cleanupCreatedSession(admin, session.accessToken, challengeIdRaw, claimId);
    console.log("[PHONE_OTP_VERIFY_V2] session creation unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  try {
    await validateTokenWithAdmin(admin, session.accessToken, claim.userId);
  } catch {
    await cleanupCreatedSession(admin, session.accessToken, challengeIdRaw, claimId);
    console.log("[PHONE_OTP_VERIFY_V2] session creation unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  const gatewayParams: GatewayParams = {
    sessionId: jwtClaims.sessionId,
    userId: claim.userId,
    challengeId: challengeIdRaw,
    claimId,
    phoneHash,
    ipHash,
  };

  let gatewayOutcome: { authorized: boolean };
  try {
    gatewayOutcome = await finalizeGateway(
      {
        authorizeGateway: (p: GatewayParams) => authorizeGateway(admin, p, req.headers.get("user-agent")?.slice(0, 200) ?? "unknown"),
        reconcileGateway: (p: GatewayParams) => reconcileGateway(admin, p),
        cleanupCreatedSession: (at: string, cid: string, clid: string) =>
          cleanupCreatedSession(admin, at, cid, clid),
        releaseClaimOnly: (cid: string, clid: string) =>
          releaseClaim(admin, cid, clid),
      },
      gatewayParams,
      session.accessToken,
    );
  } catch {
    console.log("[PHONE_OTP_VERIFY_V2] gateway finalization unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  if (!gatewayOutcome.authorized) {
    console.log("[PHONE_OTP_VERIFY_V2] gateway finalization unavailable");
    return jsonResponse({ error: "LOGIN_UNAVAILABLE" }, 503, allowedOrigin);
  }

  // Session-security registration is part of the gateway transaction.

  await recordLoginConnection(admin, req, jwtClaims.sessionId, claim.userId);

  await writeAudit(admin);

  return jsonResponse(
    {
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      login_method: "phone_otp",
    },
    200,
    allowedOrigin,
  );
});
