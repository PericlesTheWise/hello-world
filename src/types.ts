export interface Language {
  id: string;
  name: string;
  parentLanguageId: string | null;
  family: string;
  branch?: string;
  approxDate?: string;
  description?: string;
  region?: string;
}

export interface TreeData {
  name: string;
  id: string;
  children?: TreeData[];
  data: Language;
}
