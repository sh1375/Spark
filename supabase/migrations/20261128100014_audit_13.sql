BEGIN;

-- Row-level security does not apply to TRUNCATE.
REVOKE TRUNCATE ON TABLE
    public.telegram_link_tokens,
    public.bale_link_tokens,
    public.bale_link_nonces
FROM anon, authenticated;

COMMIT;
