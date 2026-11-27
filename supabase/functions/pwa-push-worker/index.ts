import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import webpush from "npm:web-push@3.6.7";

type OutboxRow = {
  id: string;
  notification_id: string;
  user_id: string;
  payload: Record<string, unknown>;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = req.headers.get("X-Spark-Worker-Token") ?? "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenOk, error: tokenError } = await service.rpc(
    "verify_pwa_push_worker_secret_service",
    { p_candidate: token },
  );
  if (tokenError || tokenOk !== true) return json({ error: "Unauthorized" }, 401);

  const { data: existingVapid, error: vapidError } = await service.rpc("get_pwa_vapid_config_service");
  if (vapidError) return json({ error: "VAPID_CONFIG_READ_FAILED" }, 500);

  let publicKey = typeof existingVapid?.public_key === "string" ? existingVapid.public_key : "";
  let privateKey = typeof existingVapid?.private_key === "string" ? existingVapid.private_key : "";
  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    const { error: setError } = await service.rpc("set_pwa_vapid_config_service", {
      p_public_key: publicKey,
      p_private_key: privateKey,
    });
    if (setError) return json({ error: "VAPID_CONFIG_WRITE_FAILED" }, 500);
    // Always use the pair retained by the locked initializer, including races.
    const { data: stored, error: storedError } = await service.rpc("get_pwa_vapid_config_service");
    if (storedError || !stored?.public_key || !stored?.private_key) {
      return json({ error: "VAPID_CONFIG_READ_FAILED" }, 503);
    }
    publicKey = stored.public_key;
    privateKey = stored.private_key;
  }

  webpush.setVapidDetails(
    "mailto:spark-notifications@localhost.invalid",
    publicKey,
    privateKey,
  );

  const { data: claimed, error: claimError } = await service.rpc(
    "claim_pwa_push_outbox_service",
    { p_limit: 50 },
  );
  if (claimError) return json({ error: "CLAIM_FAILED" }, 500);

  const rows = (Array.isArray(claimed) ? claimed : []) as OutboxRow[];
  let sentRows = 0;
  let failedRows = 0;

  for (const row of rows) {
    const { data: subscriptions, error: subscriptionsError } = await service
      .from("pwa_push_subscriptions")
      .select("id,endpoint,p256dh,auth_key")
      .eq("user_id", row.user_id)
      .is("disabled_at", null);

    if (subscriptionsError) {
      await service.rpc("complete_pwa_push_outbox_service", {
        p_id: row.id,
        p_success: false,
        p_error: "SUBSCRIPTIONS_READ_FAILED",
      });
      failedRows++;
      continue;
    }

    const activeSubscriptions = (subscriptions || []) as SubscriptionRow[];
    if (activeSubscriptions.length === 0) {
      await service.rpc("complete_pwa_push_outbox_service", {
        p_id: row.id,
        p_success: true,
        p_error: null,
      });
      sentRows++;
      continue;
    }

    let successCount = 0;
    let transientFailureCount = 0;
    const errors: string[] = [];

    const safePayload = JSON.stringify({
      title: "اسپارک",
      body: typeof row.payload?.title === "string" && row.payload.title.trim()
        ? row.payload.title.trim() : "یک اعلان جدید در اسپارک دارید.",
      actionUrl: typeof row.payload?.actionUrl === "string" ? row.payload.actionUrl : "/",
      notificationId: row.notification_id,
    });

    for (const subscription of activeSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
          },
          safePayload,
          { TTL: 60 * 60 * 24, timeout: 10_000 },
        );

        successCount++;
        await service
          .from("pwa_push_subscriptions")
          .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
          .eq("id", subscription.id);
      } catch (error) {
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : 0;
        errors.push(statusCode ? "PUSH_HTTP_" + statusCode : "PUSH_DELIVERY_FAILED");

        if (statusCode === 404 || statusCode === 410) {
          await service
            .from("pwa_push_subscriptions")
            .update({ disabled_at: new Date().toISOString(), failure_count: 1 })
            .eq("id", subscription.id);
        } else {
          transientFailureCount++;
          const { data: current } = await service
            .from("pwa_push_subscriptions")
            .select("failure_count")
            .eq("id", subscription.id)
            .maybeSingle();
          await service
            .from("pwa_push_subscriptions")
            .update({ failure_count: Number(current?.failure_count || 0) + 1 })
            .eq("id", subscription.id);
        }
      }
    }

    const success = successCount > 0 || transientFailureCount === 0;
    await service.rpc("complete_pwa_push_outbox_service", {
      p_id: row.id,
      p_success: success,
      p_error: success ? null : errors.join(" | ").slice(0, 1000),
    });

    if (success) sentRows++;
    else failedRows++;
  }

  return json({ ok: true, claimed: rows.length, sentRows, failedRows });
});
