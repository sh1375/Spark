import "jsr:@supabase/functions-js@2.111.0/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { requireFullAuthAccess, deniedResponse } from "../_shared/requireFullAuthAccess.ts";
import { recordAccessDenial } from "../_shared/accessDenialAudit.ts";
import { normalizeIranPhone } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function maskPhone(phone: string): string {
  if (!phone || phone.length <= 4) return "***";
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  return local.slice(0, 2) + "***@" + domain;
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = adminClient();
    const url = new URL(req.url);
    const action = url.pathname.split("/").pop();

    if (req.method === "POST" && action === "register") {
      return json({ error: "REGISTRATION_FLOW_REPLACED" }, 410);
    }

    const authResult = await requireFullAuthAccess(req);
    if (!authResult.ok) return deniedResponse();
    const callerUserId = authResult.userId!;

    const { data: callerProfile } = await supabase
      .from("profiles").select("is_admin").eq("user_id", callerUserId).maybeSingle();
    if (!callerProfile?.is_admin) {
      await recordAccessDenial(req, callerUserId, "ADMIN_REQUIRED");
      return json({ error: "Admin access required" }, 403);
    }

    if (req.method === "POST" && action === "create") {
      const { email, password, profile } = await req.json();
      if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
        return json({ error: "ایمیل و رمز عبور الزامی است" }, 400);
      }
      if (password.length < 6) return json({ error: "رمز عبور باید حداقل ۶ کاراکتر باشد" }, 400);

      const trimmedEmail = email.trim().toLowerCase();
      const username = typeof profile?.username === "string" ? profile.username.trim() : "";
      const rawPhone = typeof profile?.phone === "string" ? profile.phone.trim() : "";
      const normalizedPhone = normalizeIranPhone(rawPhone);

      if (!username) return json({ error: "نام کاربری الزامی است" }, 400);
      if (!normalizedPhone) return json({ error: "شماره موبایل معتبر الزامی است" }, 400);

      const normalizedUsername = username.toLowerCase();

      const { data: existingUsername } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("normalized_username", normalizedUsername)
        .maybeSingle();
      if (existingUsername) return json({ error: "این نام کاربری قبلاً استفاده شده است" }, 400);

      const { data: existingEmail } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("normalized_email", trimmedEmail)
        .maybeSingle();
      if (existingEmail) return json({ error: "این ایمیل قبلاً ثبت شده است" }, 400);

      const canonicalPhone = `+${normalizedPhone}`;
      const { data: existingPhone } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("normalized_phone", canonicalPhone)
        .maybeSingle();
      if (existingPhone) return json({ error: "این شماره موبایل قبلاً ثبت شده است" }, 400);

      const createParams: Record<string, unknown> = {
        email: trimmedEmail,
        password,
        email_confirm: true,
        phone: canonicalPhone,
        phone_confirm: true,
        user_metadata: {
          full_name: profile?.full_name || "",
          username,
          email: trimmedEmail,
          phone: canonicalPhone,
          first_name: profile?.first_name || "",
          last_name: profile?.last_name || "",
          organization: profile?.organization || "",
          position: profile?.position || "",
          department: profile?.department || "",
          employee_id: profile?.employee_id || "",
          hire_date: profile?.hire_date || "",
          birth_date: profile?.birth_date || "",
          gender: profile?.gender || "",
          city: profile?.city || "",
          location: profile?.location || "",
          bio: profile?.bio || "",
          national_id: profile?.national_id || "",
        },
        app_metadata: {
          registration_flow: "admin_created_v1",
          provisioned_by: callerUserId,
          provision_is_admin: false,
        },
      };

      const { data: userData, error: createErr } = await supabase.auth.admin.createUser(
        createParams as Parameters<typeof supabase.auth.admin.createUser>[0],
      );

      if (createErr) {
        console.error("[admin-users/create] auth.admin.createUser failed", createErr.message);
        if (createErr.message?.includes("already been registered") || createErr.message?.includes("already exists")) {
          return json({ error: "ایمیل، نام کاربری یا شماره موبایل قبلاً ثبت شده است" }, 400);
        }
        return json({ error: "خطا در ایجاد حساب کاربری" }, 400);
      }

      const userId = userData.user.id;
      const { data: verifyProfile, error: verifyProfileError } = await supabase
        .from("profiles")
        .select("user_id, account_status, registration_source")
        .eq("user_id", userId)
        .maybeSingle();

      if (verifyProfileError || !verifyProfile || verifyProfile.registration_source !== "admin_created") {
        const code = verifyProfileError
          ? "PROFILE_VERIFICATION_READ_FAILED"
          : !verifyProfile
          ? "PROFILE_NOT_FOUND"
          : "PROFILE_SOURCE_MISMATCH";
        // Preserve the Auth identity for reconciliation. Profile state can change after this read.
        console.error("[admin-users/create] lifecycle profile verification failed", code, userId);
        return json({ error: "پروفایل کاربر به‌صورت صحیح ایجاد نشد", code, user_id: userId }, 500);
      }

      if (profile?.hire_date) {
        const { error: hireDateError } = await supabase
          .from("profiles")
          .update({ hire_date: profile.hire_date })
          .eq("user_id", userId);
        if (hireDateError) {
          console.error("[admin-users/create] hire_date update failed", hireDateError.message);
        }
      }

      try {
        await supabase.from("audit_log").insert({
          user_id: callerUserId,
          module: "security",
          action: "user_create",
          entity_name: "user",
          entity_id: userId,
          details: `Created user. Email: ${maskEmail(trimmedEmail)}, Phone: ${maskPhone(normalizedPhone)}`,
          severity: "info",
        });
      } catch { /* best-effort audit */ }

      return json({ success: true, user_id: userId });
    }

    if (req.method === "PUT" && action === "password") {
      const { user_id, password } = await req.json();
      if (!user_id || typeof password !== "string") {
        return json({ error: "اطلاعات ناقص است" }, 400);
      }
      if (
        password.length < 8 ||
        password.length > 128 ||
        !/[a-zA-Z]/.test(password) ||
        !/\d/.test(password)
      ) {
        return json({ error: "رمز عبور باید حداقل ۸ کاراکتر و شامل حروف و عدد باشد" }, 400);
      }

      const { error } = await supabase.auth.admin.updateUserById(user_id, { password });
      if (error) return json({ error: "خطا در تغییر رمز عبور" }, 400);

      try {
        await supabase.from("audit_log").insert({
          user_id: callerUserId,
          module: "security",
          action: "admin_password_change",
          entity_name: "user",
          entity_id: user_id,
          details: "Admin changed user password",
          severity: "warning",
        });
      } catch { /* best-effort audit */ }

      return json({ success: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("[admin-users] unhandled error", error);
    return json({ error: "خطا در پردازش درخواست" }, 500);
  }
});
