import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db, ensureAuth } from '../firebase';
import { Language } from '../types';

const LANGUAGES_COLLECTION = 'languages';

export async function getLanguages(): Promise<Language[]> {
  const querySnapshot = await getDocs(collection(db, LANGUAGES_COLLECTION));
  return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Language));
}

export async function seedInitialData(): Promise<void> {
  const existing = await getLanguages();
  if (existing.length > 0) return;

  const response = await fetch('/api/seed');
  const data: Language[] = await response.json();

  try {
    await ensureAuth();
    for (const lang of data) {
      await setDoc(doc(db, LANGUAGES_COLLECTION, lang.id), lang);
    }
  } catch (e) {
    console.warn('Firestore seed failed (auth or write error), using local data:', e);
    // Firestore write failed — App.tsx will read from API directly as fallback
    throw new SeedFallbackError(data);
  }
}

export class SeedFallbackError extends Error {
  constructor(public data: Language[]) {
    super('seed-fallback');
  }
}
