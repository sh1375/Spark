import { supabase } from './supabase';
import {
  MAX_ATTACHMENT_BYTES,
  ALLOWED_EXTENSIONS,
  validateAttachment,
  formatBytes,
  type AttachmentKind,
  type ValidationResult,
} from './minutesAttachmentValidation';

export { MAX_ATTACHMENT_BYTES, ALLOWED_EXTENSIONS, validateAttachment, formatBytes };
export type { AttachmentKind, ValidationResult };

export const ATTACHMENT_BUCKET = 'minutes-attachments';

export interface AttachmentRow {
  id: string;
  minute_id: string;
  agenda_result_id: string | null;
  decision_id: string | null;
  storage_path: string;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by_user_id: string;
  description: string | null;
  created_at: string;
  attachment_kind: AttachmentKind;
  revision_number: number | null;
  uploader_name?: string | null;
}

export interface UploadOptions {
  minuteId: string;
  agendaResultId?: string | null;
  decisionId?: string | null;
  description?: string | null;
  attachmentKind?: AttachmentKind;
  revisionNumber?: number | null;
  onProgress?: (pct: number) => void;
}

export interface UploadResult {
  attachment: AttachmentRow;
}

export async function uploadMinuteAttachment(
  file: File,
  opts: UploadOptions,
): Promise<UploadResult> {
  const v = validateAttachment(file);
  if (!v.ok) throw new Error(v.error || 'فایل نامعتبر است.');

  // 1. Call Edge Function: validates JWT, runs begin RPC (derives path), creates signed upload URL server-side.
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error('برای بارگذاری پیوست باید وارد شوید.');

  const efRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/minutes-attachment-upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      minute_id: opts.minuteId,
      agenda_result_id: opts.agendaResultId ?? null,
      decision_id: opts.decisionId ?? null,
      original_filename: file.name.trim(),
      mime_type: v.mime || file.type || 'application/octet-stream',
      size_bytes: file.size,
      description: opts.description ?? null,
      attachment_kind: opts.attachmentKind ?? 'general',
      revision_number: opts.revisionNumber ?? null,
    }),
  });
  if (!efRes.ok) {
    const errBody = await efRes.json().catch(() => ({}));
    throw new Error(translateRpcError(errBody.error) || `بارگذاری ناموفق بود (${efRes.status})`);
  }
  const begin = await efRes.json() as {
    attachment_id: string;
    storage_path: string;
    upload_token: string;
  };
  const attachmentId = begin.attachment_id;
  const storagePath = begin.storage_path;

  // 2. Upload through the Storage SDK so signed-upload payload/headers match the Storage API contract.
  const contentType = v.mime || file.type || 'application/octet-stream';
  const { error: uploadErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .uploadToSignedUrl(storagePath, begin.upload_token, file, {
      contentType,
      cacheControl: '3600',
    });
  if (uploadErr) {
    throw new Error('بارگذاری فایل ناموفق بود: ' + uploadErr.message);
  }
  opts.onProgress?.(100);

  // 3. Finalize: backend verifies object exists + size matches, sets ready, writes audit.
  const { error: finErr } = await supabase.rpc('finalize_minutes_attachment', {
    p_attachment_id: attachmentId,
  });
  if (finErr) {
    // An RPC error may mean the response was lost after finalization committed.
    // Never remove a possibly-ready object here; leave pending cleanup to the server.
    throw new Error(translateRpcError(finErr.message));
  }

  // 4. Fetch the created row.
  const { data: row, error: selErr } = await supabase
    .from('minutes_attachments')
    .select('id,minute_id,agenda_result_id,decision_id,storage_path,original_filename,stored_filename,mime_type,size_bytes,uploaded_by_user_id,description,created_at,attachment_kind,revision_number')
    .eq('id', attachmentId)
    .maybeSingle();
  if (selErr || !row) throw new Error('ساخت رکورد پیوست موفق بود اما بارگذاری اطلاعات ناموفق بود.');
  return { attachment: row as unknown as AttachmentRow };
}

function translateRpcError(msg?: string): string {
  if (!msg) return 'ساخت رکورد پیوست ناموفق بود.';
  if (msg.includes('NOT_AUTHORIZED')) return 'شما اجازه بارگذاری پیوست در این صورت‌جلسه را ندارید.';
  if (msg.includes('PUBLISHED_LOCKED')) return 'صورت‌جلسه منتشرشده است؛ بارگذاری فقط توسط دبیر/رئیس/مدیر ممکن است.';
  if (msg.includes('TARGET_MISMATCH')) return 'بند یا مصوبه انتخاب‌شده متعلق به این صورت‌جلسه نیست.';
  if (msg.includes('INVALID_SIZE')) return 'حجم فایل نامعتبر است. حداکثر ۲۰ مگابایت.';
  if (msg.includes('INVALID_INPUT')) return 'نام فایل یا اطلاعات نامعتبر است.';
  if (msg.includes('INVALID_KIND')) return 'نوع پیوست نامعتبر است.';
  if (msg.includes('INVALID_EXTENSION')) return 'پسوند فایل مجاز نیست. فایل باید یکی از انواع pdf, doc, docx, xls, xlsx, ppt, pptx, jpg, jpeg, png, webp, txt, zip باشد.';
  if (msg.includes('INVALID_MIME')) return 'نوع فایل مجاز نیست.';
  if (msg.includes('AUTH_REQUIRED')) return 'برای بارگذاری پیوست باید وارد شوید.';
  if (msg.includes('begin_failed')) return 'شروع فرآیند بارگذاری ناموفق بود. لطفاً دوباره تلاش کنید.';
  if (msg.includes('signed_url_failed')) return 'ساخت لینک بارگذاری ناموفق بود. لطفاً دوباره تلاش کنید.';
  if (msg.includes('Unauthorized')) return 'برای بارگذاری پیوست باید وارد شوید.';
  if (msg.includes('Missing required fields')) return 'اطلاعات فایل ناقص است.';
  return 'ساخت رکورد پیوست ناموفق بود.';
}

export async function listMinuteAttachments(minuteId: string): Promise<AttachmentRow[]> {
  const { data, error } = await supabase
    .from('minutes_attachments')
    .select('id,minute_id,agenda_result_id,decision_id,storage_path,original_filename,stored_filename,mime_type,size_bytes,uploaded_by_user_id,description,created_at,attachment_kind,revision_number')
    .eq('minute_id', minuteId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error('بارگذاری پیوست‌ها ناموفق بود.');
  const rows = (data || []) as unknown as AttachmentRow[];
  // Enrich with uploader names
  const ids = Array.from(new Set(rows.map(r => r.uploaded_by_user_id).filter(Boolean)));
  if (ids.length) {
    const { data: prof } = await supabase
      .from('profiles_public')
      .select('user_id,full_name')
      .in('user_id', ids);
    const map: Record<string, string> = {};
    for (const p of (prof || []) as unknown as { user_id: string; full_name: string }[]) {
      map[p.user_id] = p.full_name;
    }
    for (const r of rows) r.uploader_name = map[r.uploaded_by_user_id] || null;
  }
  return rows;
}

export async function deleteMinuteAttachment(attachmentId: string): Promise<void> {
  const { data: row, error: selErr } = await supabase
    .from('minutes_attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .maybeSingle();
  if (selErr || !row) throw new Error('پیوست یافت نشد.');
  const storagePath = (row as { storage_path: string }).storage_path;

  // 1. Remove storage object FIRST. If this fails, record stays active, error shown.
  const { error: rmErr } = await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath]);
  if (rmErr) throw new Error('حذف فایل ناموفق بود: ' + rmErr.message);

  // 2. Only after successful storage removal, soft-delete the record via RPC.
  const { error } = await supabase.rpc('delete_minutes_attachment', { p_attachment_id: attachmentId });
  if (error) throw new Error(translateDeleteError(error.message));
}

function translateDeleteError(msg: string): string {
  if (msg.includes('NOT_AUTHORIZED')) return 'شما اجازه حذف این پیوست را ندارید.';
  if (msg.includes('NOT_FOUND')) return 'پیوست یافت نشد.';
  return 'حذف پیوست ناموفق بود.';
}

export async function getAttachmentDownloadUrl(attachmentId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_minutes_attachment_signed_url', {
    p_attachment_id: attachmentId,
  });
  if (error) throw new Error(translateSignedError(error.message));
  const path = data as string;
  const { data: urlData, error: urlErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, 300);
  if (urlErr || !urlData?.signedUrl) throw new Error('ساخت لینک دانلود ناموفق بود.');
  return urlData.signedUrl;
}

function translateSignedError(msg: string): string {
  if (msg.includes('NOT_AUTHORIZED')) return 'شما اجازه دانلود این پیوست را ندارید.';
  if (msg.includes('NOT_FOUND')) return 'پیوست یافت نشد.';
  return 'ساخت لینک دانلود ناموفق بود.';
}

export async function getLatestSignedFinalAttachment(minuteId: string): Promise<AttachmentRow | null> {
  const { data, error } = await supabase.rpc('get_latest_signed_final_attachment', {
    p_minute_id: minuteId,
  });
  if (error) throw new Error(translateSignedError(error.message));
  if (!data) return null;
  const row = data as AttachmentRow;
  if (!row.id) return null;
  return row;
}

export async function getSignedFinalDownloadUrl(attachmentId: string): Promise<string> {
  return getAttachmentDownloadUrl(attachmentId);
}
