export function rp4FilenameForCode(code) {
  if (!/^[A-Z]{2}$/.test(code)) throw new Error(`Invalid active country code: ${code}`);
  return `${code}-research-v4.0.json`;
}

export function activeRp4FilenamesFromManifest(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error('active-countries.json must contain at least one country');
  }
  return manifest.map(({ code }) => rp4FilenameForCode(code));
}
