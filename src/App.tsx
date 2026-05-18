import React, { useEffect, useState, useMemo } from 'react';
import { LanguageTree } from './components/LanguageTree';
import { LanguageDetail } from './components/LanguageDetail';
import { Language } from './types';
import { getLanguages } from './services/languageService';
import { Search, Share2, ZoomIn, ZoomOut } from 'lucide-react';
import { AnimatePresence } from 'motion/react';

type ViewMode = 'tree' | 'timeline';

export default function App() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [fontSize, setFontSize] = useState(11);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');

  useEffect(() => {
    async function init() {
      try {
        const data = await getLanguages();
        setLanguages(data);
      } catch (e) {
        console.error('Failed to load languages:', e);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const filteredLanguages = useMemo(() => {
    if (!searchTerm) return languages;
    const q = searchTerm.toLowerCase();
    return languages.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.family ?? '').toLowerCase().includes(q) ||
      (l.branch ?? '').toLowerCase().includes(q) ||
      (l.region ?? '').toLowerCase().includes(q),
    );
  }, [languages, searchTerm]);

  // Group families for sidebar
  const families = useMemo(() => {
    const map = new Map<string, Language[]>();
    for (const l of languages) {
      const f = l.family ?? 'Other';
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(l);
    }
    return map;
  }, [languages]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-pitch text-parchment font-sans">
      {/* Header */}
      <header className="h-16 px-8 bg-onyx border-b border-gold/20 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 border border-gold flex items-center justify-center font-serif text-gold italic text-xl">
            L
          </div>
          <div>
            <h1 className="font-serif text-xl tracking-widest uppercase text-parchment">LingaTree</h1>
            <p className="text-[9px] uppercase tracking-tighter opacity-40">Ancestry Registry</p>
          </div>
        </div>

        <div className="hidden lg:flex gap-8 text-[11px] uppercase tracking-[0.2em] font-semibold">
          <span className="text-gold border-b border-gold pb-1">Ancestry Explorer</span>
          <span className="opacity-40">
            {languages.length} Languages · {families.size} Families
          </span>
        </div>

        <div className="hidden md:flex items-center border border-gold/20 rounded-sm overflow-hidden text-[10px] font-mono uppercase tracking-[0.15em]">
          <button
            onClick={() => setViewMode('tree')}
            className={`px-3 py-1.5 transition-colors ${viewMode === 'tree' ? 'bg-gold/20 text-gold' : 'text-gold/40 hover:text-gold/70 hover:bg-white/5'}`}
          >
            Complete View
          </button>
          <div className="w-px h-4 bg-gold/20" />
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1.5 transition-colors ${viewMode === 'timeline' ? 'bg-gold/20 text-gold' : 'text-gold/40 hover:text-gold/70 hover:bg-white/5'}`}
          >
            Timeline View
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] opacity-40 uppercase">Status</p>
            <p className="text-[11px] font-mono text-gold">{loading ? 'LOADING…' : 'LIVE'}</p>
          </div>
          <div className="flex items-center gap-1 border border-gold/20 rounded-sm px-2 py-1">
            <button
              onClick={() => setFontSize(s => Math.max(8, s - 1))}
              className="p-0.5 hover:text-gold transition-colors text-gold/50"
              title="Decrease font size"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-gold/60 w-5 text-center select-none">{fontSize}</span>
            <button
              onClick={() => setFontSize(s => Math.min(18, s + 1))}
              className="p-0.5 hover:text-gold transition-colors text-gold/50"
              title="Increase font size"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
          <button className="p-2 hover:bg-white/5 rounded-full transition-colors text-gold">
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 border-r border-gold/10 bg-void hidden md:flex flex-col p-5 overflow-y-auto shrink-0">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gold/40" />
            <input
              type="text"
              placeholder="Search languages…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-gold/20 rounded-sm py-2 pl-9 pr-3 text-xs placeholder:opacity-30 focus:outline-none focus:border-gold/50 transition-all font-mono"
            />
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.15em] text-gold mb-3 border-b border-gold/10 pb-1">
                Language Families
              </h3>
              <ul className="space-y-1">
                {[...families.entries()].map(([family, langs]) => (
                  <li
                    key={family}
                    className="flex items-center justify-between py-1.5 px-2 hover:bg-white/5 rounded-sm cursor-pointer group transition-colors"
                    onClick={() => setSearchTerm(family)}
                  >
                    <span className="text-xs group-hover:text-parchment transition-colors opacity-70 group-hover:opacity-100">
                      {family}
                    </span>
                    <span className="text-[10px] font-mono opacity-30 group-hover:text-gold transition-colors">
                      {langs.length}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {searchTerm && (
              <div>
                <h3 className="text-[10px] uppercase tracking-[0.15em] text-gold mb-3 border-b border-gold/10 pb-1">
                  Results ({filteredLanguages.length})
                </h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {filteredLanguages.map(lang => (
                    <div
                      key={lang.id}
                      onClick={() => { setSelectedLanguage(lang); setSearchTerm(''); }}
                      className="p-2 hover:bg-white/5 rounded-sm cursor-pointer transition-colors"
                    >
                      <p className="text-xs font-serif italic">{lang.name}</p>
                      <p className="text-[9px] opacity-40 font-mono">{lang.approxDate}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto pt-6">
            <div className="p-4 bg-gold/5 border border-gold/10 rounded-sm">
              <p className="text-[10px] italic leading-relaxed opacity-70">
                "Language is the genealogy of nations."
              </p>
              <p className="text-[9px] uppercase tracking-tighter mt-2 opacity-40 font-bold">— Samuel Johnson</p>
            </div>
          </div>
        </aside>

        {/* Tree Canvas */}
        <main className="flex-1 relative overflow-hidden flex flex-col">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-pitch/90 z-30">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                <p className="text-[11px] uppercase tracking-widest text-gold/60 font-mono">
                  Loading Genealogy Archive…
                </p>
              </div>
            </div>
          )}

          <div className="px-8 pt-6 pb-4 flex justify-between items-start z-10 shrink-0">
            <div>
              <h2 className="font-serif text-2xl italic text-parchment">
                {selectedLanguage ? `Lineage: ${selectedLanguage.name}` : 'The Evolutionary Tree'}
              </h2>
              <p className="text-xs opacity-40 mt-1">
                {selectedLanguage
                  ? `${selectedLanguage.family} · ${selectedLanguage.branch ?? ''} · ${selectedLanguage.approxDate ?? ''}`
                  : 'Exploring the vast divergence of human language across time and geography'}
              </p>
            </div>
            {(searchTerm || selectedLanguage) && (
              <button
                onClick={() => { setSearchTerm(''); setSelectedLanguage(null); }}
                className="px-4 py-2 border border-gold/30 text-[10px] uppercase tracking-widest text-gold hover:bg-gold/10 transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            <LanguageTree
              languages={filteredLanguages}
              onSelect={setSelectedLanguage}
              selectedId={selectedLanguage?.id}
              fontSize={fontSize}
              viewMode={viewMode}
            />
          </div>

          {/* Timeline bar — only in Complete View; Timeline View has its own D3 axis */}
          {viewMode === 'tree' && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-3/4 px-10 py-3 bg-[#050505]/70 backdrop-blur-sm rounded-full border border-gold/10 pointer-events-none hidden md:block">
            <div className="flex justify-between text-[9px] uppercase tracking-[0.25em] opacity-40 mb-2 font-mono">
              <span>−5000 BCE</span>
              <span>−2000 BCE</span>
              <span>0 CE</span>
              <span className="text-gold font-bold">Today</span>
            </div>
            <div className="h-px bg-gold/20 relative">
              <div className="absolute w-2 h-2 bg-gold rounded-full top-1/2 -translate-y-1/2 right-0 shadow-[0_0_8px_#c5a059]" />
            </div>
          </div>
          )}
        </main>

        {/* Detail Panel */}
        <AnimatePresence>
          {selectedLanguage && (
            <LanguageDetail
              language={selectedLanguage}
              onClose={() => setSelectedLanguage(null)}
              allLanguages={languages}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
