/** Associates a masked secret with its integration in the browser password manager. */
export function CredentialIdentityField({ identity }: { identity: string }) {
  return (
    <input type="text" name="username" autoComplete="username" value={identity} readOnly hidden />
  );
}
