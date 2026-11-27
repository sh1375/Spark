import "jsr:@supabase/functions-js@2.111.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-telegram-bot-api-secret-token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function matchesProof(expected: string, supplied: string | null): boolean {
  if (!expected || supplied === null || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: channelConfig, error: configError } = await supabase
    .from("social_channel_configs")
    .select("bot_token, is_active, webhook_secret")
    .eq("channel", "telegram")
    .maybeSingle();

  if (configError) return json({ error: "Webhook configuration unavailable" }, 503);
  if (!channelConfig?.is_active) {
    return json({ ok: false, error: "Telegram bot is not active" }, 403);
  }

  const expectedSecret = (Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || channelConfig.webhook_secret || "").trim();
  if (!expectedSecret) return json({ error: "Webhook secret not configured" }, 503);
  if (!matchesProof(expectedSecret, req.headers.get("x-telegram-bot-api-secret-token"))) {
    return json({ error: "Unauthorized webhook" }, 401);
  }
  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = typeof message?.text === "string" ? message.text.trim() : "";

  try {
    await supabase.from("audit_logs").insert({
      action: "telegram_webhook_update",
      details: {
        update_type: update.message ? "message" : update.callback_query ? "callback_query" : "other",
        chat_id: chatId,
      },
    });
  } catch {
    // Non-critical
  }

  if (message?.chat?.type === "private" && /^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
    const linkToken = text.split(" ")[1]?.trim();

    if (linkToken && chatId) {
      // One database transaction claims the nonce and links the active profile.
      const { data: consumed, error: consumeErr } = await supabase.rpc(
        "consume_telegram_link_token_service", { p_token: linkToken, p_chat_id: String(chatId) },
      );
      if (consumeErr || consumed?.ok !== true) {
        await sendTelegramMessage(
          channelConfig.bot_token,
          chatId,
          "لینک اتصال نامعتبر یا منقضی شده است.\n\nلطفاً از پروفایل خود لینک جدیدی دریافت کنید."
        );
        return json({ ok: true });
      }

      const profile = consumed;
      await sendTelegramMessage(
        channelConfig.bot_token,
        chatId,
        `✅ حساب تلگرام شما با موفقیت به سامانه متصل شد.\n\nسلام ${profile?.full_name || "کاربر"}! از این پس اعلان‌های سامانه برای شما ارسال خواهد شد.`
      );
    } else {
      await sendTelegramMessage(
        channelConfig.bot_token,
        chatId,
        "سلام! برای اتصال حساب تلگرام خود، از پروفایل در سامانه لینک اتصال دریافت کنید."
      );
    }
  }

  return json({ ok: true });
});

async function sendTelegramMessage(token: string, chatId: string | number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // Non-critical
  }
}
