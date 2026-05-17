import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Language } from '../types';

const LANGUAGES_COLLECTION = 'languages';

export async function getLanguages(): Promise<Language[]> {
  const querySnapshot = await getDocs(collection(db, LANGUAGES_COLLECTION));
  return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Language));
}

export async function seedInitialData() {
  const existing = await getLanguages();
  if (existing.length > 0) return;

  const response = await fetch('/api/seed');
  const data: Language[] = await response.json();

  for (const lang of data) {
    await setDoc(doc(db, LANGUAGES_COLLECTION, lang.id), lang);
  }
}
