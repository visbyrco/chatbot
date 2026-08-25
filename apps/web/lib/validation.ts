export const MODEL_ID_RE =
  /^([a-z0-9_-]+\/[a-z0-9._-]+|custom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9._-]+)$/i;

export function isValidModelIdFormat(id: string): boolean {
  if (!id || id.length === 0 || id.length > 200) {
    return false;
  }
  return MODEL_ID_RE.test(id);
}

export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}
