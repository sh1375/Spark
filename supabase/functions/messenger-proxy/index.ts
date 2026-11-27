// supabase/functions/messenger-proxy/index.ts
// پراکسی امن برای تلگرام و بله — توکن هرگز به فرانت ارسال نمی‌شود

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireFullAuthAccess, deniedResponse } from "../_shared/requireFullAuthAccess.ts";

type Channel = 'telegram' | 'bale';

const BASE_URLS: Record<Channel, string> = {
  telegram: 'https://api.telegram.org',
  bale: 'https://tapi.bale.ai',
};

const ALLOWED_METHODS = new Set([
  'getMe',
  'getWebhookInfo',
  'setWebhook',
  'deleteWebhook',
  'getUpdates',
  'sendMessage',
  'testSupabaseConnection',
]);

const ALLOWED_WEBHOOK_PATHS: Record<Channel, string> = {
  telegram: '/functions/v1/telegram-webhook',
  bale: '/functions/v1/bale-webhook',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function isValidChannel(value: unknown): value is Channel {
  return value === 'telegram' || value === 'bale';
}

function normalizeBotToken(rawToken: string) {
  return rawToken.trim().replace(/^bot/i, '');
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function validateWebhookUrl(channel: Channel, params: any) {
  if (!params || typeof params.url !== 'string') {
    return {
      ok: false as const,
      status: 400,
      description: 'url وبهوک الزامی است',
    };
  }

  let webhookUrl: URL;

  try {
    webhookUrl = new URL(params.url);
  } catch {
    return {
      ok: false as const,
      status: 400,
      description: 'فرمت url وبهوک نامعتبر است',
    };
  }

  const publicApiBaseUrlRaw =
    Deno.env.get('PUBLIC_API_BASE_URL') ?? 'https://api.shahrmeeting.ir';

  let allowedOrigin: string;

  try {
    allowedOrigin = new URL(trimTrailingSlash(publicApiBaseUrlRaw)).origin;
  } catch {
    return {
      ok: false as const,
      status: 500,
      description: 'PUBLIC_API_BASE_URL نامعتبر است',
    };
  }

  const allowedPath = ALLOWED_WEBHOOK_PATHS[channel];

  if (webhookUrl.username || webhookUrl.password || webhookUrl.search || webhookUrl.hash) {
    return { ok: false as const, status: 400, description: "Webhook URL must be a clean endpoint" };
  }
  if (webhookUrl.protocol !== 'https:') {
    return {
      ok: false as const,
      status: 400,
      description: 'آدرس webhook باید https باشد',
    };
  }

  if (webhookUrl.origin !== allowedOrigin) {
    return {
      ok: false as const,
      status: 400,
      description: `دامنه webhook غیرمجاز است. دامنه مجاز: ${allowedOrigin}`,
    };
  }

  const normalizedWebhookPath = trimTrailingSlash(webhookUrl.pathname);
  const normalizedAllowedPath = trimTrailingSlash(allowedPath);

  if (normalizedWebhookPath !== normalizedAllowedPath) {
    return {
      ok: false as const,
      status: 400,
      description: `مسیر webhook غیرمجاز است. مسیر مجاز: ${allowedPath}`,
    };
  }

  return {
    ok: true as const,
  };
}

async function baleWebhookProof(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("spark:bale:webhook:v1:" + secret));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return json({
      ok: false,
      description: 'فقط متد POST مجاز است',
    }, 405);
  }

  try {
    let payload: any;

    try {
      payload = await req.json();
    } catch {
      return json({
        ok: false,
        description: 'بدنه درخواست JSON معتبر نیست',
      }, 400);
    }

    const { channel, method } = payload ?? {};
    let params = payload?.params;

    if (!isValidChannel(channel)) {
      return json({
        ok: false,
        description: 'channel نامعتبر است',
      }, 400);
    }

    if (typeof method !== 'string' || !ALLOWED_METHODS.has(method)) {
      return json({
        ok: false,
        description: 'method مجاز نیست',
      }, 400);
    }

    if (params !== undefined) {
      let paramsSize = 0;

      try {
        paramsSize = JSON.stringify(params).length;
      } catch {
        return json({
          ok: false,
          description: 'params قابل تبدیل به JSON نیست',
        }, 400);
      }

      if (paramsSize > 10000) {
        return json({
          ok: false,
          description: 'حجم params زیاد است',
        }, 400);
      }
    }

    const authResult = await requireFullAuthAccess(req);
    if (!authResult.ok) return deniedResponse();
    const user = { id: authResult.userId! };

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json({
        ok: false,
        description: 'متغیرهای محیطی Supabase کامل تنظیم نشده‌اند',
      }, 500);
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileErr) {
      return json({
        ok: false,
        description: 'خطا در بررسی نقش: ' + profileErr.message,
      }, 500);
    }

    if (!profile || profile.is_admin !== true) {
      return json({
        ok: false,
        description: 'دسترسی فقط برای ادمین',
      }, 403);
    }

    const { data: cfg, error: cfgErr } = await admin
      .from('social_channel_configs')
      .select('bot_token, ext_supabase_url, ext_supabase_service_key, webhook_secret')
      .eq('channel', channel)
      .maybeSingle();

    if (cfgErr) {
      return json({
        ok: false,
        description: 'خطا در خواندن تنظیمات: ' + cfgErr.message,
      }, 500);
    }

    if (!cfg && method !== 'testSupabaseConnection') {
      return json({
        ok: false,
        description: 'تنظیمات این کانال پیدا نشد',
      }, 400);
    }

    if (method === 'setWebhook') {
      const validation = validateWebhookUrl(channel, params);

      if (!validation.ok) {
        return json({
          ok: false,
          description: validation.description,
        }, validation.status);
      }
      const secret = (channel === "telegram" ? Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || cfg?.webhook_secret : cfg?.webhook_secret)?.trim();
      if (!secret) return json({ ok: false, description: "WEBHOOK_SECRET_REQUIRED" }, 400);
      // Bale documents only the URL parameter, not Telegram's secret-token header.
      if (channel === "bale") {
        const target = new URL(params.url);
        target.searchParams.set("proof", await baleWebhookProof(secret));
        params = { url: target.toString() };
      } else {
        params = { ...params, secret_token: secret };
      }
    }

    if (method === 'testSupabaseConnection') {
      const extUrl = cfg?.ext_supabase_url?.trim();
      const extKey = cfg?.ext_supabase_service_key?.trim();

      if (!extUrl || !extKey) {
        return json({
          ok: false,
          description: 'Supabase URL یا Service Role Key ذخیره نشده است. ابتدا تنظیمات را ذخیره کنید.',
        }, 400);
      }

      let parsedUrl: URL;

      try {
        parsedUrl = new URL(extUrl);
      } catch {
        return json({
          ok: false,
          description: 'فرمت Supabase URL نامعتبر است.',
        }, 400);
      }

      const isInternalApiGateway =
        parsedUrl.protocol === 'http:' &&
        parsedUrl.hostname === 'api-gw' &&
        parsedUrl.port === '8000';

      if (parsedUrl.protocol !== 'https:' && !isInternalApiGateway) {
        return json({
          ok: false,
          description: 'Supabase URL باید HTTPS باشد؛ فقط api-gw داخلی روی پورت 8000 با HTTP مجاز است.',
        }, 400);
      }

      const healthUrl = new URL('/rest/v1/', parsedUrl.origin).toString();

      console.log('testSupabaseConnection debug:', {
        channel,
        extUrl,
        hasExtKey: Boolean(extKey),
        extKeyLength: extKey?.length ?? 0,
        healthUrl,
      });

      let upstreamResponse: Response;

      try {
        upstreamResponse = await fetch(healthUrl, {
          method: 'GET',
          headers: {
            apikey: extKey,
            Authorization: `Bearer ${extKey}`,
          },
        });
      } catch (error) {
        return json({
          ok: false,
          description: 'اتصال به Supabase برقرار نشد.',
          error: safeErrorMessage(error),
        }, 400);
      }

      const responseText = await upstreamResponse.text();

      if (!upstreamResponse.ok) {
        return json({
          ok: false,
          description: 'Supabase پاسخ موفق برنگرداند.',
          status: upstreamResponse.status,
          statusText: upstreamResponse.statusText,
          body: responseText.slice(0, 1000),
        }, 400);
      }

      return json({
        ok: true,
        description: 'اتصال به Supabase با موفقیت برقرار شد.',
        status: upstreamResponse.status,
      });
    }

    const token = cfg?.bot_token ? normalizeBotToken(cfg.bot_token) : '';

    if (!token) {
      return json({
        ok: false,
        description: 'توکن بات تنظیم نشده است. ابتدا توکن را ذخیره کنید.',
      }, 400);
    }

    const baseUrl = BASE_URLS[channel];
    const upstreamUrl = `${baseUrl}/bot${token}/${method}`;

    const hasBody =
      params &&
      typeof params === 'object' &&
      Object.keys(params).length > 0;

    let upstream: Response;

    try {
      upstream = await fetch(upstreamUrl, {
        method: hasBody ? 'POST' : 'GET',
        headers: hasBody
          ? {
              'Content-Type': 'application/json',
            }
          : undefined,
        body: hasBody ? JSON.stringify(params) : undefined,
      });
    } catch (e) {
      console.error('messenger upstream fetch error:', {
        channel,
        method,
        error: "UPSTREAM_FETCH_FAILED",
      });

      return json({
        ok: false,
        description: 'خطای شبکه در اتصال به API پیام‌رسان',
      }, 502);
    }

    const text = await upstream.text();

    let upstreamData: unknown;

    try {
      upstreamData = text ? JSON.parse(text) : null;
    } catch {
      upstreamData = {
        ok: false,
        description: text.slice(0, 500),
      };
    }

    if (method === "setWebhook" || method === "getWebhookInfo") {
      const value = upstreamData as { ok?: boolean; result?: unknown } | null;
      if (!upstream.ok || value?.ok !== true) {
        return json({ ok: false, description: "WEBHOOK_PROVIDER_FAILED", upstream_status: upstream.status }, 502);
      }
      if (method === "setWebhook") return json({ ok: true, result: value.result === true }, 200);
      const result = value.result;
      if (result && typeof result === "object" && !Array.isArray(result)) {
        const info = result as Record<string, unknown>;
        let safeUrl = "";
        if (typeof info.url === "string" && info.url) {
          try { const url = new URL(info.url); safeUrl = url.origin + url.pathname; } catch { /* omit invalid URL */ }
        }
        return json({ ok: true, result: { url: safeUrl, pending_update_count: info.pending_update_count,
          last_error_date: info.last_error_date, has_custom_certificate: info.has_custom_certificate } });
      }
      return json({ ok: false, description: "WEBHOOK_INFO_INVALID" }, 502);
    }
    if (!upstream.ok) {
      return json({
        ok: false,
        description: 'خطا از API پیام‌رسان',
        upstream_status: upstream.status,
        upstream_response: upstreamData,
      }, 502);
    }

    return json(upstreamData, 200);
  } catch (e) {
    console.error('messenger-proxy error');

    return json({
      ok: false,
      description: 'خطای داخلی پراکسی',
    }, 500);
  }
});
