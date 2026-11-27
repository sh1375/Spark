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

  const { data: channelConfig } = await supabase
    .from("social_channel_configs")
    .select("bot_token, is_active")
    .eq("channel", "telegram")
    .maybeSingle();

  if (!channelConfig?.is_active) {
    return json({ ok: false, error: "Telegram bot is not active" }, 403);
  }

  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const message = update?.message ?? update?.callback_query?.message;
  const chatId = message?.chat?.id ?? update?.callback_query?.from?.id;
  const text = (message?.text ?? "").trim();

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

  if (text?.startsWith("/start")) {
    const linkToken = text.split(" ")[1]?.trim();

    if (linkToken && chatId) {
      // ── Secure token lookup ──────────────────────────────────────────────────
      // Tokens are cryptographically random 32-hex-char strings stored in
      // telegram_link_tokens. We never accept raw user UUIDs as linking tokens.
      const now = new Date().toISOString();

      const { data: tokenRow, error: tokenErr } = await supabase
        .from("telegram_link_tokens")
        .select("id, user_id")
        .eq("token", linkToken)
        .eq("used", false)
        .gt("expires_at", now)
        .maybeSingle();

      if (tokenErr || !tokenRow) {
        // Token invalid, expired, already used, or not found — refuse to link
        await sendTelegramMessage(
          channelConfig.bot_token,
          chatId,
          "لینک اتصال نامعتبر یا منقضی شده است.\n\nلطفاً از پروفایل خود لینک جدیدی دریافت کنید."
        );
        return json({ ok: true });
      }

      // Fetch the user's display name for the confirmation message
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", tokenRow.user_id)
        .maybeSingle();

      // Mark the token as used (single-use)
      await supabase
        .from("telegram_link_tokens")
        .update({ used: true })
        .eq("id", tokenRow.id);

      // Link Telegram chat ID to the user
      await supabase
        .from("profiles")
        .update({ telegram_chat_id: String(chatId) })
        .eq("user_id", tokenRow.user_id);

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
