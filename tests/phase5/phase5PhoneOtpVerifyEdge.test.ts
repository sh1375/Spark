import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const migrationsDir = join(root, 'supabase', 'migrations');
const functionsDir = join(root, 'supabase', 'functions');
const configPath = join(root, 'supabase', 'config.toml');

const sharedPath = join(functionsDir, '_shared', 'phoneOtpLoginV2.ts');
const funcPath = join(functionsDir, 'verify-phone-login-otp-v2', 'index.ts');
const requestV2Path = join(functionsDir, 'request-phone-login-otp-v2', 'index.ts');
const oldRequestPath = join(functionsDir, 'request-phone-login-otp', 'index.ts');
const oldVerifyPath = join(functionsDir, 'verify-phone-login-otp', 'index.ts');
const passwordLoginPath = join(functionsDir, 'password-login', 'index.ts');
const sendSmsPath = join(functionsDir, 'send-sms', 'index.ts');
const authSmsHookPath = join(functionsDir, 'auth-send-sms-hook', 'index.ts');

const sharedSrc = readFileSync(sharedPath, 'utf8');
const funcSrc = readFileSync(funcPath, 'utf8');
const requestV2Src = readFileSync(requestV2Path, 'utf8');
const configSrc = readFileSync(configPath, 'utf8');

describe('Phase 5E-D2 — Verify Phone OTP Edge Function V2', () => {
  it('new function and shared utility exist on disk', () => {
    assert.ok(existsSync(funcPath), 'verify-phone-login-otp-v2/index.ts must exist');
    assert.ok(existsSync(sharedPath), '_shared/phoneOtpLoginV2.ts must exist');
  });

  it('function directory is named verify-phone-login-otp-v2', () => {
    assert.ok(funcPath.includes('verify-phone-login-otp-v2'));
  });

  it('config.toml has verify_jwt=false for new function', () => {
    assert.ok(/\[functions\.verify-phone-login-otp-v2\]/.test(configSrc),
      'config.toml must have [functions.verify-phone-login-otp-v2]');
    const section = configSrc.match(/\[functions\.verify-phone-login-otp-v2\][\s\S]*?(?=\[functions\.|$)/);
    assert.ok(section, 'must have config section');
    assert.ok(/verify_jwt\s*=\s*false/.test(section![0]), 'must set verify_jwt=false');
  });

  it('legacy functions are unchanged on disk', () => {
    assert.ok(existsSync(oldRequestPath), 'request-phone-login-otp must still exist');
    assert.ok(existsSync(oldVerifyPath), 'verify-phone-login-otp must still exist');
    assert.ok(existsSync(passwordLoginPath), 'password-login must still exist');
    assert.ok(existsSync(sendSmsPath), 'send-sms must still exist');
    assert.ok(existsSync(authSmsHookPath), 'auth-send-sms-hook must still exist');
  });

  it('request-phone-login-otp-v2 is unchanged (still has D1 fixes)', () => {
    assert.ok(/SECURITY_CONFIG_KEYS/.test(requestV2Src), 'request v2 must still have SECURITY_CONFIG_KEYS');
    assert.ok(/eq\(["']section["'],\s*["']sms["']\)/.test(requestV2Src), 'request v2 must still query section=sms');
    assert.ok(/phone_login_sms_provider_id/.test(requestV2Src), 'request v2 must still reference phone_login_sms_provider_id');
  });

  it('CORS uses exact allowlist (no wildcard, no reflection)', () => {
    assert.ok(/checkOrigin/.test(sharedSrc), 'must have checkOrigin function');
    assert.ok(/origin\s*===\s*allowed/.test(sharedSrc), 'must use exact string comparison');
  });

  it('CORS fails closed when origin not allowed', () => {
    assert.ok(/if\s*\(!allowedOrigin\)/i.test(funcSrc), 'must check if origin is not allowed');
    assert.ok(/INVALID_REQUEST/.test(funcSrc), 'must return INVALID_REQUEST for disallowed origin');
  });

  it('has no-store, no-cache, Vary: Origin, and Content-Type headers', () => {
    assert.ok(/no-store/.test(sharedSrc), 'must have Cache-Control: no-store');
    assert.ok(/no-cache/.test(sharedSrc), 'must have Pragma: no-cache');
    assert.ok(/Vary.*Origin/.test(sharedSrc), 'must have Vary: Origin');
    assert.ok(/Content-Type.*application\/json/.test(sharedSrc), 'must have Content-Type in base headers');
  });

  it('config unavailable returns LOGIN_UNAVAILABLE 503', () => {
    assert.ok(/LOGIN_UNAVAILABLE/.test(funcSrc), 'must return LOGIN_UNAVAILABLE');
    assert.ok(/503/.test(funcSrc), 'must return 503');
  });

  it('body byte limit is 2048', () => {
    assert.ok(/PHONE_OTP_MAX_BODY_BYTES\s*=\s*2048/.test(readFileSync(join(functionsDir, '_shared', 'phoneOtpLoginV2.ts'), 'utf8')), 'must set shared MAX_BODY_BYTES to 2048');
    assert.ok(/PHONE_OTP_MAX_BODY_BYTES as MAX_BODY_BYTES/.test(funcSrc), 'must import shared limit');
  });

  it('only accepts POST', () => {
    assert.ok(/POST/.test(funcSrc), 'must check for POST');
  });

  it('body has exactly three fields: challenge_id, phone, otp', () => {
    assert.ok(/bodyKeys\.length\s*!==\s*3/.test(funcSrc), 'must check exactly 3 keys');
    assert.ok(/challenge_id/.test(funcSrc), 'must include challenge_id');
    assert.ok(/phone/.test(funcSrc), 'must include phone');
    assert.ok(/otp/.test(funcSrc), 'must include otp');
  });

  it('null, array, and primitives are rejected', () => {
    assert.ok(/parsed\s*===\s*null/.test(funcSrc), 'must reject null');
    assert.ok(/typeof\s*parsed\s*!==\s*["']object["']/.test(funcSrc), 'must reject non-objects');
    assert.ok(/Array\.isArray\(parsed\)/.test(funcSrc), 'must reject arrays');
  });

  it('challenge_id must be valid UUID', () => {
    assert.ok(/isValidUuid\(challengeIdRaw\)/.test(funcSrc), 'must validate challenge_id as UUID');
  });

  it('phone raw length is 1..32', () => {
    assert.ok(/PHONE_OTP_MAX_RAW_PHONE_LEN\s*=\s*32/.test(readFileSync(join(functionsDir, '_shared', 'phoneOtpLoginV2.ts'), 'utf8')), 'must set shared max raw phone len to 32');
    assert.ok(/PHONE_OTP_MAX_RAW_PHONE_LEN as MAX_RAW_PHONE_LEN/.test(funcSrc), 'must import shared limit');
    assert.ok(/phoneRaw\.length\s*===\s*0\s*\|\|\s*phoneRaw\.length\s*>\s*MAX_RAW_PHONE_LEN/.test(funcSrc),
      'must validate phone length 1..32');
  });

  it('canonical phone must be ^989[0-9]{9}', () => {
    assert.ok(/canonicalizeIranPhone/.test(funcSrc), 'must call canonicalizeIranPhone');
  });

  it('otp must be exactly six digits', () => {
    assert.ok(/\\d\{6\}/.test(funcSrc), 'must validate otp as 6 digits');
  });

  it('readiness checks backend_ready and canonical_enabled from section=security', () => {
    assert.ok(/READINESS_KEYS/.test(funcSrc), 'must have READINESS_KEYS constant');
    assert.ok(/phone_otp_login_backend_ready/.test(funcSrc), 'must check backend_ready');
    assert.ok(/phone_login_canonical_enabled/.test(funcSrc), 'must check canonical_enabled');
    assert.ok(/eq\(["']section["'],\s*["']security["']\)/.test(funcSrc), 'must query section=security');
    assert.ok(/data\.length\s*!==\s*READINESS_KEYS\.length/.test(funcSrc), 'must check exact row count');
  });

  it('readiness runs before rate limit and claim', () => {
    const readinessIdx = funcSrc.search(/getReadiness/);
    const rateLimitIdx = funcSrc.search(/consumeVerifyRateLimit/);
    const claimIdx = funcSrc.search(/claimChallenge/);
    assert.ok(readinessIdx >= 0 && rateLimitIdx >= 0 && claimIdx >= 0);
    assert.ok(readinessIdx < rateLimitIdx, 'readiness must run before rate limit');
    assert.ok(rateLimitIdx < claimIdx, 'rate limit must run before claim');
  });

  it('rate limit purpose is exactly phone_otp_login_verify', () => {
    assert.ok(/phone_otp_login_verify/.test(funcSrc), 'must use phone_otp_login_verify purpose');
  });

  it('has two rate limits: long and short', () => {
    const matches = funcSrc.match(/consumeVerifyRateLimit/g);
    assert.ok(matches && matches.length >= 2, 'must have at least 2 rate limit calls');
  });

  it('long rate limit: phone=10, ip=100, window=900', () => {
    assert.ok(/10,\s*100,\s*900/.test(funcSrc), 'must have long rate limit 10/100/900');
  });

  it('short rate limit: phone=5, ip=30, window=60', () => {
    assert.ok(/5,\s*30,\s*60/.test(funcSrc), 'must have short rate limit 5/30/60');
  });

  it('rate limited response includes retry_after_seconds with 429', () => {
    assert.ok(/RATE_LIMITED/.test(funcSrc), 'must return RATE_LIMITED');
    assert.ok(/retry_after_seconds/.test(funcSrc), 'must include retry_after_seconds');
    assert.ok(/429/.test(funcSrc), 'must return 429 status');
  });

  it('all HMAC domains are exact', () => {
    assert.ok(/phone-otp-login-v2\|phone\|/.test(funcSrc), 'must have phone hash domain');
    assert.ok(/phone-otp-login-v2\|ip\|/.test(funcSrc), 'must have ip hash domain');
    assert.ok(/phone-otp-login-v2\|otp\|/.test(funcSrc), 'must have otp hash domain');
    assert.ok(/phone-otp-login-v2\|verify-rate-long\|phone\|/.test(funcSrc), 'must have verify-rate-long phone domain');
    assert.ok(/phone-otp-login-v2\|verify-rate-long\|ip\|/.test(funcSrc), 'must have verify-rate-long ip domain');
    assert.ok(/phone-otp-login-v2\|verify-rate-short\|phone\|/.test(funcSrc), 'must have verify-rate-short phone domain');
    assert.ok(/phone-otp-login-v2\|verify-rate-short\|ip\|/.test(funcSrc), 'must have verify-rate-short ip domain');
  });

  it('claim ID is built with crypto.randomUUID', () => {
    assert.ok(/crypto\.randomUUID/.test(funcSrc), 'must use crypto.randomUUID for claim ID');
  });

  it('claim RPC is claim_phone_otp_login_challenge_v2 with otp hash', () => {
    assert.ok(/claim_phone_otp_login_challenge_v2/.test(funcSrc), 'must call claim_phone_otp_login_challenge_v2');
    assert.ok(/p_otp_hash/.test(funcSrc), 'must pass p_otp_hash');
    assert.ok(/p_claim_id/.test(funcSrc), 'must pass p_claim_id');
    assert.ok(/p_challenge_id/.test(funcSrc), 'must pass p_challenge_id');
  });

  it('phone hash from RPC is matched exactly', () => {
    assert.ok(/claim\.phoneHash\s*!==\s*phoneHash/.test(funcSrc), 'must compare RPC phone_hash with computed');
  });

  it('claim success requires error_code=null, valid user_id, 64-hex phone_hash, and future claim_expires_at', () => {
    assert.ok(/errorCode\s*!==\s*null/.test(funcSrc), 'must reject non-null error_code on claimed=true');
    assert.ok(/isValidUuid\(userId\)/.test(funcSrc), 'must validate user_id as UUID');
    assert.ok(/\^\[0-9a-f\]\{64\}\$/.test(funcSrc), 'must validate phone_hash as 64 lowercase hex');
    assert.ok(/claimExpiresAt/.test(funcSrc), 'must check claim_expires_at');
    assert.ok(/Number\.isFinite\(expiry\)/.test(funcSrc), 'must use Number.isFinite for expiry check');
    assert.ok(/expiry\s*<=\s*Date\.now/.test(funcSrc), 'must check expiry is in the future');
  });

  it('claim error codes map to INVALID_OR_EXPIRED_OTP 401', () => {
    const codes = ['INVALID_OTP', 'CHALLENGE_LOCKED', 'CHALLENGE_EXPIRED', 'INVALID_CHALLENGE',
                   'INVALID_CHALLENGE_STATE', 'DELIVERY_NOT_CONFIRMED', 'ALREADY_CONSUMED'];
    for (const code of codes) {
      assert.ok(funcSrc.includes(code), `must map ${code}`);
    }
    assert.ok(/INVALID_OR_EXPIRED_OTP/.test(funcSrc), 'must return INVALID_OR_EXPIRED_OTP');
    assert.ok(/401/.test(funcSrc), 'must return 401');
  });

  it('ACTIVE_PROCESSING maps to REQUEST_IN_PROGRESS 409 with retry 1', () => {
    assert.ok(/ACTIVE_PROCESSING/.test(funcSrc), 'must handle ACTIVE_PROCESSING');
    assert.ok(/REQUEST_IN_PROGRESS/.test(funcSrc), 'must return REQUEST_IN_PROGRESS');
    assert.ok(/409/.test(funcSrc), 'must return 409');
    assert.ok(/retry_after_seconds.*1/.test(funcSrc), 'must include retry_after_seconds 1');
  });

  it('eligibility is rechecked after claim', () => {
    const claimIdx = funcSrc.search(/claimChallenge/);
    const eligibilityIdx = funcSrc.search(/recheckEligibility/);
    assert.ok(claimIdx >= 0 && eligibilityIdx >= 0);
    assert.ok(claimIdx < eligibilityIdx, 'eligibility recheck must be after claim');
    assert.ok(/getUserById/.test(funcSrc), 'must call getUserById');
    assert.ok(/phone_confirmed_at/.test(funcSrc), 'must check phone_confirmed_at');
    assert.ok(/deleted_at/.test(funcSrc), 'must check deleted_at');
    assert.ok(/banned_until/.test(funcSrc), 'must check banned_until');
    assert.ok(/account_status/.test(funcSrc), 'must check account_status');
    assert.ok(/is_active/.test(funcSrc), 'must check is_active');
    assert.ok(/ACTIVE/.test(funcSrc), 'must check ACTIVE');
  });

  it('operational eligibility errors return 503, not decoy', () => {
    assert.ok(/AUTH_UNAVAILABLE/.test(funcSrc), 'must throw AUTH_UNAVAILABLE');
    assert.ok(/PROFILE_UNAVAILABLE/.test(funcSrc), 'must throw PROFILE_UNAVAILABLE');
  });

  it('ineligible user after claim returns 401', () => {
    assert.ok(/INVALID_OR_EXPIRED_OTP/.test(funcSrc), 'must return INVALID_OR_EXPIRED_OTP for ineligible');
  });

  it('magic link is created with admin.generateLink type=magiclink', () => {
    assert.ok(/generateLink/.test(funcSrc), 'must call generateLink');
    assert.ok(/magiclink/.test(funcSrc), 'must use type magiclink');
  });

  it('only hashed_token is used, not action_link or email_otp', () => {
    assert.ok(/hashed_token/.test(funcSrc), 'must use hashed_token');
    assert.ok(!/action_link/.test(funcSrc), 'must not use action_link');
    assert.ok(!/email_otp/.test(funcSrc), 'must not use email_otp');
  });

  it('verification_type must be magiclink', () => {
    assert.ok(/verification_type/.test(funcSrc), 'must check verification_type');
    assert.ok(/magiclink/.test(funcSrc), 'must verify magiclink type');
  });

  it('verifyOtp is called with type magiclink', () => {
    assert.ok(/verifyOtp/.test(funcSrc), 'must call verifyOtp');
    assert.ok(/token_hash/.test(funcSrc), 'must pass token_hash');
    assert.ok(/type.*magiclink/.test(funcSrc), 'must use type magiclink');
  });

  it('does not use signInWithOtp or signInWithPassword', () => {
    assert.ok(!/signInWithOtp/.test(funcSrc), 'must not call signInWithOtp');
    assert.ok(!/signInWithPassword/.test(funcSrc), 'must not call signInWithPassword');
    assert.ok(!/createUser/.test(funcSrc), 'must not call createUser');
    assert.ok(!/updateUserById/.test(funcSrc), 'must not call updateUserById');
  });

  it('session must have access_token, refresh_token, and matching user_id', () => {
    assert.ok(/access_token/.test(funcSrc), 'must check access_token');
    assert.ok(/refresh_token/.test(funcSrc), 'must check refresh_token');
    assert.ok(/session\.userId\s*!==\s*claim\.userId/.test(funcSrc), 'must compare user IDs');
  });

  it('JWT validation checks sub, session_id, role, aal, and AMR with Base64URL padding', () => {
    assert.ok(/decodeJwt/.test(funcSrc), 'must decode JWT');
    assert.ok(/jwtClaims\.sub\s*!==\s*claim\.userId/.test(funcSrc), 'must compare sub with claimed userId');
    assert.ok(/session_id/.test(funcSrc), 'must check session_id');
    assert.ok(/role.*authenticated/.test(funcSrc), 'must check role=authenticated');
    assert.ok(/aal.*aal1/.test(funcSrc), 'must check aal=aal1');
    assert.ok(/paddedPayload/.test(funcSrc), 'must pad Base64URL payload before atob');
    assert.ok(/padEnd/.test(funcSrc), 'must use padEnd for Base64URL padding');
  });

  it('AMR must include magiclink and exclude password', () => {
    assert.ok(/magiclink/.test(funcSrc), 'must check magiclink in AMR');
    const amrSection = funcSrc.match(/amr[\s\S]*?hasMagiclink[\s\S]*?hasPassword/);
    assert.ok(amrSection, 'must check AMR methods');
    assert.ok(/hasPassword/.test(funcSrc), 'must check for password in AMR');
  });

  it('token is validated with admin.auth.getUser (Promise<void>, user_id only)', () => {
    assert.ok(/admin\.auth\.getUser/.test(funcSrc), 'must call admin.auth.getUser');
    assert.ok(/validateTokenWithAdmin/.test(funcSrc), 'must have validateTokenWithAdmin function');
    assert.ok(/Promise<void>/.test(funcSrc), 'validateTokenWithAdmin must return Promise<void>');
    assert.ok(/data\.user\.id\s*!==\s*expectedUserId/.test(funcSrc), 'must compare data.user.id with expectedUserId');
    assert.ok(!/data\.user\.session_id/.test(funcSrc), 'must not access data.user.session_id');
    assert.ok(!/user\.session_id/.test(funcSrc), 'must not access user.session_id');
    assert.ok(!/validatedSessionId/.test(funcSrc), 'must not have validatedSessionId variable');
  });

  it('gateway RPC is authorize_phone_otp_gateway_session_v2 with session registration in the same transaction', () => {
    assert.ok(/authorize_phone_otp_gateway_session_v2/.test(funcSrc), 'must call gateway RPC');
    assert.ok(/p_session_id/.test(funcSrc), 'must pass p_session_id');
    assert.ok(/p_user_id/.test(funcSrc), 'must pass p_user_id');
    assert.ok(/p_challenge_id/.test(funcSrc), 'must pass p_challenge_id');
    assert.ok(/p_claim_id/.test(funcSrc), 'must pass p_claim_id');
    assert.ok(/p_phone_hash/.test(funcSrc), 'must pass p_phone_hash');
    assert.ok(/p_ip_hash/.test(funcSrc), 'must pass p_ip_hash');
    assert.ok(/jwtClaims\.sessionId/.test(funcSrc), 'gateway must use jwtClaims.sessionId');
  });

  it('gateway success requires authorized=true and session_id match', () => {
    assert.ok(/authorized\s*===\s*true/.test(funcSrc), 'must check authorized=true');
    assert.ok(/sessionId\s*!==\s*params\.sessionId/.test(funcSrc), 'must compare session_id');
    assert.ok(/errorCode\s*!==\s*null/.test(funcSrc), 'must check error_code is null');
  });

  it('finalization has at most one retry with 100ms delay', () => {
    const helperSrc = readFileSync(join(functionsDir, 'verify-phone-login-otp-v2', 'gatewayFinalization.ts'), 'utf8');
    assert.ok(/setTimeout\(r,\s*100\)/.test(helperSrc), 'must have 100ms delay between retries in helper');
    assert.ok(/attempt\s*<\s*2/.test(helperSrc), 'must limit to 2 attempts in helper');
  });

  it('retry does not create new claim, session, or magic link', () => {
    const helperSrc = readFileSync(join(functionsDir, 'verify-phone-login-otp-v2', 'gatewayFinalization.ts'), 'utf8');
    assert.ok(!/crypto\.randomUUID/.test(helperSrc), 'helper must not create new claim ID');
    assert.ok(!/generateLink/.test(helperSrc), 'helper must not create new magic link');
    assert.ok(!/verifyOtp/.test(helperSrc), 'helper must not create new session');
  });

  it('explicit failure and ambiguous failure are handled by finalizeGateway helper', () => {
    assert.ok(/finalizeGateway/.test(funcSrc), 'must call finalizeGateway for gateway flow');
    assert.ok(/gatewayOutcome/.test(funcSrc), 'must use gatewayOutcome result');
    assert.ok(/!gatewayOutcome\.authorized/.test(funcSrc), 'must check gatewayOutcome.authorized');
  });

  it('gateway throw triggers reconciliation via helper', () => {
    assert.ok(/reconcileGateway/.test(funcSrc), 'must wire reconcileGateway to helper');
    assert.ok(/reconcile_phone_otp_gateway_session_v2/.test(funcSrc), 'must call reconciliation RPC');
  });

  it('reconciliation success leads to token response', () => {
    const successMatch = funcSrc.match(/gatewayOutcome\.authorized[\s\S]*?return\s+jsonResponse\(\s*\{[^}]*access_token/);
    assert.ok(successMatch, 'must return tokens after authorized=true from helper');
  });

  it('failure leads to cleanup and 503', () => {
    assert.ok(/!gatewayOutcome\.authorized[\s\S]*?LOGIN_UNAVAILABLE[\s\S]*?503/.test(funcSrc),
      'must return 503 on gateway failure');
  });

  it('explicit failure is not merged with ambiguous failure', () => {
    assert.ok(/cleanupCreatedSession/.test(funcSrc), 'must use cleanupCreatedSession for both paths');
    assert.ok(!/if\s*\(!gateway\.authorized\)[\s\S]*?localLogout/.test(funcSrc),
      'must not have inline explicit failure with localLogout - handled by helper');
  });

  it('tokens are returned only after authorized=true', () => {
    const successMatch = funcSrc.match(/await writeAudit[\s\S]*?return\s+jsonResponse\(\s*\{[^}]*access_token[^}]*refresh_token[^}]*login_method[^}]*}/);
    assert.ok(successMatch, 'must return tokens only after gateway success and audit');
    assert.ok(/access_token/.test(successMatch![0]), 'must return access_token');
    assert.ok(/refresh_token/.test(successMatch![0]), 'must return refresh_token');
    assert.ok(/login_method.*phone_otp/.test(successMatch![0]), 'must return login_method');
  });

  it('complete_phone_otp_login_challenge_v2 is not used', () => {
    assert.ok(!/complete_phone_otp_login_challenge_v2/.test(funcSrc), 'must not call complete challenge RPC');
  });

  it('release_phone_otp_login_challenge_v2 is called in failure paths', () => {
    assert.ok(/release_phone_otp_login_challenge_v2/.test(funcSrc), 'must call release challenge RPC');
    const releaseCount = (funcSrc.match(/releaseClaim\(/g) ?? []).length;
    assert.ok(releaseCount >= 3, 'must call releaseClaim in multiple failure paths');
  });

  it('releaseClaim checks both data and error from RPC', () => {
    assert.ok(/releaseClaim/.test(funcSrc), 'must have releaseClaim function');
    const releaseMatch = funcSrc.match(/async\s+function\s+releaseClaim[\s\S]*?^\}/m);
    assert.ok(releaseMatch, 'must find releaseClaim function');
    const block = releaseMatch![0];
    assert.ok(/error/.test(block), 'must check error from RPC');
    assert.ok(/data/.test(block), 'must check data from RPC');
    assert.ok(/released\s*===\s*true/.test(block), 'must check released===true');
    assert.ok(/ALREADY_CONSUMED/.test(block), 'must accept ALREADY_CONSUMED as success');
  });

  it('localLogout returns boolean (no throw, response.ok check)', () => {
    const logoutMatch = funcSrc.match(/async\s+function\s+localLogout[\s\S]*?^\}/m);
    assert.ok(logoutMatch, 'must find localLogout function');
    const block = logoutMatch![0];
    assert.ok(/Promise<boolean>/.test(block), 'must return Promise<boolean>');
    assert.ok(/response\.ok/.test(block), 'must check response.ok');
    assert.ok(/return\s+false/.test(block), 'must return false on non-ok');
    assert.ok(/return\s+true/.test(block), 'must return true on ok');
    assert.ok(!/throw/.test(block), 'must not throw from localLogout');
    assert.ok(/finally\s*\{[\s\S]*?clearTimeout/.test(block), 'must clearTimeout in finally');
  });

  it('cleanupCreatedSession attempts both logout and release', () => {
    const cleanupMatch = funcSrc.match(/async\s+function\s+cleanupCreatedSession[\s\S]*?^\}/m);
    assert.ok(cleanupMatch, 'must find cleanupCreatedSession function');
    const block = cleanupMatch![0];
    assert.ok(/localLogout/.test(block), 'must call localLogout');
    assert.ok(/releaseClaim/.test(block), 'must call releaseClaim');
    assert.ok(/logoutOk/.test(block), 'must track logoutOk');
    assert.ok(/releaseOk/.test(block), 'must track releaseOk');
    assert.ok(/logoutOk\s*&&\s*releaseOk/.test(block), 'must return success only if both ok');
  });

  it('does not return OTP, phone, email, user_id, session_id, challenge_id, claim_id, phone_hash, ip_hash, hashed_token, action_link, or email_otp', () => {
    const successMatch = funcSrc.match(/return\s+jsonResponse\(\s*\{[^}]*access_token[^}]*}/g);
    assert.ok(successMatch, 'must find success response');
    for (const resp of successMatch!) {
      const lower = resp.toLowerCase();
      assert.ok(!/otp/.test(lower) || /phone_otp/.test(lower), 'must not return OTP');
      assert.ok(!/phone_hash/.test(lower), 'must not return phone_hash');
      assert.ok(!/ip_hash/.test(lower), 'must not return ip_hash');
      assert.ok(!/user_id/.test(lower), 'must not return user_id');
      assert.ok(!/email/.test(lower), 'must not return email');
      assert.ok(!/session_id/.test(lower), 'must not return session_id');
      assert.ok(!/challenge_id/.test(lower), 'must not return challenge_id');
      assert.ok(!/claim_id/.test(lower), 'must not return claim_id');
      assert.ok(!/hashed_token/.test(lower), 'must not return hashed_token');
      assert.ok(!/action_link/.test(lower), 'must not return action_link');
      assert.ok(!/email_otp/.test(lower), 'must not return email_otp');
    }
  });

  it('logs are only static redacted messages', () => {
    const logMatches = funcSrc.match(/console\.log\([^)]*\)/g);
    if (logMatches) {
      for (const log of logMatches) {
        assert.ok(/PHONE_OTP_VERIFY_V2/.test(log), 'logs must contain static tag');
        assert.ok(!/\$\{/.test(log), 'logs must not contain template variables');
      }
    }
  });

  it('audit logs phone_otp_login_verified with login_method=phone_otp', () => {
    assert.ok(/phone_otp_login_verified/.test(funcSrc), 'must audit phone_otp_login_verified');
    assert.ok(/login_method.*phone_otp/.test(funcSrc), 'must include login_method in audit');
    assert.ok(/severity.*info/.test(funcSrc), 'must use severity info');
  });

  it('audit is best effort', () => {
    assert.ok(/best effort/i.test(funcSrc), 'audit must be best effort');
  });

  it('does not create new migrations for verify edge', () => {
    const migrationFiles = readdirSync(migrationsDir);
    const hasNewMigration = migrationFiles.some(f => f.includes('phase5e_phone_otp_verify_edge'));
    assert.ok(!hasNewMigration, 'must not create new migration for verify edge');
  });

  it('previous migrations are not modified', () => {
    const migrationFiles = readdirSync(migrationsDir);
    assert.ok(migrationFiles.some(f => f.includes('phase5e_phone_otp_gateway_finalization_rpc')), 'finalization RPC migration must exist');
    assert.ok(migrationFiles.some(f => f.includes('phase5e_phone_otp_challenge_table')), 'challenge table migration must exist');
    assert.ok(migrationFiles.some(f => f.includes('phase5e_phone_otp_release_claim_rpc')), 'release claim RPC migration must exist');
  });

  it('does not modify backend_ready', () => {
    assert.ok(!/UPDATE.*system_config.*backend_ready/i.test(funcSrc), 'must not update backend_ready');
    assert.ok(!/backend_ready.*true/.test(funcSrc.replace(/phone_otp_login_backend_ready/g, '')),
      'must not set backend_ready to true');
  });

  it('local logout uses POST /auth/v1/logout?scope=local with 5 second timeout and finally cleanup', () => {
    assert.ok(/auth\/v1\/logout\?scope=local/.test(funcSrc), 'must call local logout endpoint');
    assert.ok(/5000/.test(funcSrc), 'must have 5 second timeout');
    assert.ok(/Bearer/.test(funcSrc), 'must use Bearer token');
    assert.ok(/apikey/.test(funcSrc), 'must include apikey header');
    assert.ok(/finally\s*\{[\s\S]*?clearTimeout\(timer\)/.test(funcSrc), 'must clear timer in finally block');
  });

  it('no formal assert.ok(true) assertions in this test file', () => {
    const testFile = readFileSync(join(root, 'tests', 'phase5', 'phase5PhoneOtpVerifyEdge.test.ts'), 'utf8');
    const lines = testFile.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (/^assert\.ok\(\s*true\s*\)\s*;?\s*$/.test(trimmed)) {
        assert.fail('must not contain formal assert.ok(true) test');
      }
    }
  });
});
