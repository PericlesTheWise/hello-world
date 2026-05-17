import { Language } from '../types';

export async function getLanguages(): Promise<Language[]> {
  const res = await fetch('/api/languages');
  if (!res.ok) throw new Error(`Failed to load languages: ${res.status}`);
  return res.json();
}
