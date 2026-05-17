import React from 'react';
import { Language } from '../types';
import { Calendar, Globe, BookOpen, X, GitBranch } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  language: Language | null;
  onClose: () => void;
  allLanguages?: Language[];
}

export const LanguageDetail: React.FC<Props> = ({ language, onClose, allLanguages = [] }) => {
  if (!language) return null;

  // Build ancestor chain
  const ancestors: Language[] = [];
  let current: Language | undefined = language;
  const seen = new Set<string>();
  while (current && current.parentLanguageId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = allLanguages.find(l => l.id === current!.parentLanguageId);
    if (parent) {
      ancestors.push(parent);
      current = parent;
    } else break;
  }

  // Direct descendants
  const children = allLanguages.filter(l => l.parentLanguageId === language.id);

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      className="fixed right-0 top-0 h-full w-full max-w-sm bg-onyx shadow-2xl z-50 overflow-y-auto flex flex-col border-l border-gold/10"
    >
      {/* Header */}
      <div className="p-8 border-b border-gold/20 flex flex-col gap-1 bg-void relative">
        <p className="text-[10px] uppercase tracking-widest text-gold mb-2">Node Analysis</p>
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-serif italic text-parchment">{language.name}</h2>
            <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest mt-1">
              {language.family} · {language.branch}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 border border-gold/20 text-gold hover:bg-gold/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-8 space-y-8 flex-1">
        {/* Meta */}
        <section className="space-y-5">
          {language.approxDate && (
            <div>
              <p className="text-[10px] opacity-40 uppercase mb-2 font-bold tracking-tighter">Temporal Origin</p>
              <div className="flex items-center gap-2 text-gold">
                <Calendar className="w-4 h-4 shrink-0" />
                <span className="text-sm font-mono">{language.approxDate}</span>
              </div>
            </div>
          )}

          {language.region && (
            <div>
              <p className="text-[10px] opacity-40 uppercase mb-2 font-bold tracking-tighter">Geographic Focus</p>
              <div className="flex items-center gap-2 text-parchment">
                <Globe className="w-4 h-4 shrink-0" />
                <span className="text-sm italic">{language.region}</span>
              </div>
            </div>
          )}

          {language.description && (
            <div>
              <p className="text-[10px] opacity-40 uppercase mb-2 font-bold tracking-tighter">Historical Record</p>
              <p className="text-sm leading-relaxed opacity-70 border-l-2 border-gold/30 pl-4 py-1 italic">
                {language.description}
              </p>
            </div>
          )}
        </section>

        {/* Ancestry chain */}
        {ancestors.length > 0 && (
          <section>
            <p className="text-[10px] uppercase tracking-widest text-gold mb-4 border-b border-gold/10 pb-2 flex items-center gap-2">
              <GitBranch className="w-3 h-3" /> Ancestral Lineage
            </p>
            <div className="space-y-2">
              {ancestors.map((a, i) => (
                <div key={a.id} className="flex items-center gap-3">
                  <div
                    className="w-px bg-gold/30 self-stretch"
                    style={{ marginLeft: `${i * 8}px` }}
                  />
                  <div style={{ marginLeft: `${i * 8}px` }} className="flex-1 py-1.5 px-3 bg-white/5 border border-gold/10 rounded-sm">
                    <p className="text-xs font-serif italic">{a.name}</p>
                    {a.approxDate && (
                      <p className="text-[9px] font-mono opacity-40 mt-0.5">{a.approxDate}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Descendants */}
        {children.length > 0 && (
          <section>
            <p className="text-[10px] uppercase tracking-widest text-gold mb-4 border-b border-gold/10 pb-2 flex items-center gap-2">
              <BookOpen className="w-3 h-3" /> Direct Descendants
            </p>
            <div className="grid grid-cols-2 gap-2">
              {children.map(child => (
                <div key={child.id} className="py-2 px-3 bg-white/5 border border-gold/10 rounded-sm">
                  <p className="text-xs font-serif italic truncate">{child.name}</p>
                  {child.approxDate && (
                    <p className="text-[9px] font-mono opacity-40 mt-0.5">{child.approxDate}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="p-6 border-t border-gold/20 bg-void">
        <button
          onClick={onClose}
          className="w-full py-4 border border-gold/30 text-[10px] uppercase tracking-[0.2em] font-bold text-gold hover:bg-gold/10 transition-colors"
        >
          Close Genealogy Entry
        </button>
      </div>
    </motion.div>
  );
};
