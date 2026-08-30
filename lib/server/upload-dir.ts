// Central helper for the upload directory. On Vercel the filesystem is
// read-only except for /tmp, so the default "./uploads" would throw EROFS
// and surface as 500 Internal Server Error for every file upload. In Docker
// the named volume `uploads:/app/uploads` is often created as root, so the
// unprivileged `nextjs` user (uid 1001) gets EACCES on mkdir/write.
// Prefer the configured UPLOAD_DIR, fall back to /tmp when the primary is
// not writable.
export function getUploadDir(): string {
  const custom = process.env.UPLOAD_DIR;
  if (custom !== undefined && custom !== "") {
    return custom;
  }
  if (process.env.VERCEL) {
    return "/tmp/uploads";
  }
  return "./uploads";
}

export function getFallbackUploadDir(): string {
  return "/tmp/uploads";
}

export function getUploadDirCandidates(): string[] {
  const primary = getUploadDir();
  const fallback = getFallbackUploadDir();
  if (primary === fallback) {
    return [primary];
  }
  // Always try the configured dir first, then the tmp fallback
  return [primary, fallback];
}
