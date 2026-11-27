import "jsr:@supabase/functions-js@2.111.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.111.0";

const ok = () => new Response("OK", { status: 200 });

function matchesProof(expected: string, supplied: string | null): boolean {
  if (!expected || supplied === null || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return difference === 0;
}

async function baleWebhookProof(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("spark:bale:webhook:v1:" + secret));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 200 });
    if (req.method !== "POST") return ok();

    let update: Record<string, any>;
    try {
      update = await req.json();
    } catch {
      return ok();
    }

    // Account links must originate in a new private conversation, not a group or edited message.
    const msg = update?.message;
    if (msg?.chat?.type !== "private") return ok();
    const chatId: number | undefined = msg?.chat?.id;
    const text = typeof msg?.text === "string" ? msg.text.trim() : "";
    if (!chatId || !/^\/start(?:@\w+)?(?:[\s=]|$)/i.test(text)) return ok();

    const startMatch = text.match(/^\/start(?:@\w+)?(?:[\s=]+(\S+))?/i);
    const linkToken: string | null = startMatch?.[1] ?? null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    let botToken = (Deno.env.get("BALE_BOT_TOKEN") ?? "").trim();

    if (!supabaseUrl || !serviceKey) {
      console.error("[bale-webhook] Supabase service environment is incomplete");
      return ok();
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: config, error: configError } = await supabase
      .from("social_channel_configs")
      .select("bot_token, is_active, webhook_secret")
      .eq("channel", "bale")
      .maybeSingle();
    if (configError) {
      console.error("[bale-webhook] Bale channel configuration unavailable");
      return new Response("Unavailable", { status: 503 });
    }
    if (!config?.is_active) return new Response("Inactive", { status: 403 });
    const secret = (config.webhook_secret ?? "").trim();
    if (!secret) return new Response("Unavailable", { status: 503 });
    const proofs = new URL(req.url).searchParams.getAll("proof");
    if (proofs.length !== 1 || !matchesProof(await baleWebhookProof(secret), proofs[0])) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (!botToken) botToken = (config.bot_token ?? "").trim();
    if (!botToken) {
      console.error("[bale-webhook] BALE_BOT_TOKEN not configured and no active channel token available");
      return ok();
    }

    if (!linkToken) {
      await sendMessage(botToken, chatId, "سلام! برای دریافت اعلان‌های سامانه، از بخش پروفایل روی «اتصال به بله» کلیک کنید.");
      return ok();
    }

    // Token lookup, expiry check, single-use consume, chat-id encryption,
    // mapping update and audit all happen in one database transaction.
    const { data: consumeResult, error: consumeErr } = await supabase.rpc(
      "consume_bale_link_nonce_service",
      {
        p_nonce: linkToken,
        p_bale_chat_id: String(chatId),
      },
    );

    if (consumeErr) {
      console.error("[bale-webhook] consume RPC error");
      await sendMessage(botToken, chatId, "خطای داخلی. لطفاً دوباره تلاش کنید.");
      return ok();
    }

    if (!consumeResult || consumeResult.ok !== true) {
      await sendMessage(
        botToken,
        chatId,
        "❌ لینک اتصال نامعتبر، منقضی یا قبلاً استفاده شده است. لطفاً از سامانه دوباره روی «اتصال به بله» کلیک کنید.",
      );
      return ok();
    }

    console.log("[bale-webhook] Bale account linked successfully");
    await sendMessage(botToken, chatId, "✅ اتصال شما با موفقیت انجام شد. از این پس اعلان‌های جلسه را اینجا دریافت می‌کنید.");
    return ok();
  } catch (err) {
    console.error("[bale-webhook] unexpected error");
    return ok();
  }
});

async function sendMessage(token: string, chatId: number | string, text: string): Promise<void> {
  try {
    const res = await fetch(`https://tapi.bale.ai/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      console.warn("[bale-webhook] sendMessage HTTP %s", res.status);
    }
  } catch (e) {
    console.warn("[bale-webhook] sendMessage network error");
  }
}
