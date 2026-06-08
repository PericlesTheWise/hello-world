import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Plus, Minus, RotateCcw, SlidersHorizontal, X, Search } from 'lucide-react';
import { Language } from '../types';

interface Props {
  languages: Language[];
  onSelect: (lang: Language) => void;
  selectedId?: string;
  fontSize?: number;
  viewMode?: 'tree' | 'timeline';
  currentYear?: number;
  onYearChange?: (year: number) => void;
}

// Horizontal padding (px) from the SVG container edge to the year-axis endpoints
// at the default fit zoom. The HTML scrubber uses these same values so its track
// sits exactly on top of the SVG axis at default zoom.
const AXIS_HPAD = 60;

const VIRTUAL_ROOT_ID = '__world_root__';
const TRANSITION_MS = 280;

// Shared temporal domain — used by both the SVG yearScale and the App scrubber
// so the slider handle and the tree's time axis scale identically.
export const TIMELINE_MIN_YEAR = -5000;
export const TIMELINE_MAX_YEAR = 2025;

function parseEarliestYear(approxDate?: string | number | null): number | null {
  if (approxDate == null) return null;
  // Some datasets store the year as a plain number.
  if (typeof approxDate === 'number') return Number.isFinite(approxDate) ? approxDate : null;
  if (typeof approxDate !== 'string' || !approxDate.trim()) return null;

  const s = approxDate.replace(/,/g, '');

  const nums: { val: number; idx: number }[] = [];
  const numRe = /\d+/g;
  let m: RegExpExecArray | null;
  while ((m = numRe.exec(s)) !== null) {
    const val = parseInt(m[0], 10);
    if (Number.isFinite(val)) nums.push({ val, idx: m.index });
  }
  if (nums.length === 0) return null;

  const eras: { bce: boolean; idx: number }[] = [];
  const eraRe = /BCE|CE/gi;
  while ((m = eraRe.exec(s)) !== null) eras.push({ bce: /BCE/i.test(m[0]), idx: m.index });

  // Each number adopts the era marker that follows it, so a mixed range like
  // "500 BCE – 1000 CE" reads 500 as BCE (−500) and 1000 as CE (+1000). Falls
  // back to the last marker before it, else assumes CE.
  const signed = nums.map(n => {
    const era = eras.find(e => e.idx >= n.idx) ?? [...eras].reverse().find(e => e.idx < n.idx);
    return era && era.bce ? -n.val : n.val;
  });
  const result = Math.min(...signed);
  return Number.isFinite(result) ? result : null;
}

// Sanitizes a raw language array before it reaches any layout logic.
// Three passes run in order so each pass can assume the previous is clean:
//   1. Deduplicate IDs — keep first occurrence, warn and drop subsequent ones.
//   2. Broken parent refs — any node whose parentLanguageId doesn't exist in
//      the dataset is promoted to a family root (parentLanguageId = null).
//   3. Cycle detection — walks each node's ancestor chain; any node that
//      closes a cycle is promoted to root so stratify() never sees a loop.
function sanitizeLanguages(languages: Language[]): Language[] {
  // Pass 1 — deduplicate IDs
  const seen = new Set<string>();
  const pass1: Language[] = [];
  for (const l of languages) {
    if (!l.id) { console.warn('[LingaTree] Skipping node with missing id:', l); continue; }
    if (seen.has(l.id)) { console.warn(`[LingaTree] Duplicate id "${l.id}" — extra entry skipped`); continue; }
    seen.add(l.id);
    pass1.push(l);
  }

  // Pass 2 — broken parent refs
  const idSet = new Set(pass1.map(l => l.id));
  const pass2 = pass1.map(l => {
    if (l.parentLanguageId != null && !idSet.has(l.parentLanguageId)) {
      console.warn(`[LingaTree] "${l.name}" has unknown parent "${l.parentLanguageId}" — promoted to root`);
      return { ...l, parentLanguageId: null };
    }
    return l;
  });

  // Pass 3 — cycle detection via ancestor-chain walk
  const parentOf = new Map<string, string | null>(pass2.map(l => [l.id, l.parentLanguageId]));
  const cycleNodes = new Set<string>();
  for (const l of pass2) {
    if (cycleNodes.has(l.id)) continue;
    const path: string[] = [];
    const inPath = new Set<string>();
    let cur: string | null = l.id;
    while (cur != null) {
      if (cycleNodes.has(cur)) break;        // already resolved upstream
      if (inPath.has(cur)) {                 // cycle found — mark all members
        const start = path.indexOf(cur);
        for (let i = start; i < path.length; i++) cycleNodes.add(path[i]);
        break;
      }
      path.push(cur);
      inPath.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }
  if (cycleNodes.size > 0) {
    console.warn('[LingaTree] Cycles broken by promoting to root:', [...cycleNodes]);
  }
  return pass2.map(l => cycleNodes.has(l.id) ? { ...l, parentLanguageId: null } : l);
}

function buildChildrenMap(languages: Language[]): Map<string, Language[]> {
  const map = new Map<string, Language[]>();
  for (const lang of languages) {
    const pid = lang.parentLanguageId;
    if (pid) {
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(lang);
    }
  }
  return map;
}

function computeInitialExpanded(languages: Language[], childrenMap: Map<string, Language[]>): Set<string> {
  const expanded = new Set<string>();
  function deepestPath(id: string, visited = new Set<string>()): string[] {
    if (visited.has(id)) return [id]; // cycle guard — should not occur after sanitizeLanguages
    visited.add(id);
    const children = childrenMap.get(id) ?? [];
    if (!children.length) return [id];
    let best: string[] = [];
    for (const c of children) {
      const p = deepestPath(c.id, visited);
      if (p.length > best.length) best = p;
    }
    return [id, ...best];
  }
  for (const root of languages.filter(l => l.parentLanguageId === null)) {
    const path = deepestPath(root.id);
    for (let i = 0; i < path.length - 1; i++) expanded.add(path[i]);
  }
  return expanded;
}

function getVisibleLanguages(languages: Language[], expandedIds: Set<string>, childrenMap: Map<string, Language[]>): Language[] {
  const roots = languages.filter(l => l.parentLanguageId === null);
  const visible: Language[] = [...roots];
  const queue = roots.filter(l => expandedIds.has(l.id));
  while (queue.length) {
    const node = queue.shift()!;
    for (const child of childrenMap.get(node.id) ?? []) {
      visible.push(child);
      if (expandedIds.has(child.id)) queue.push(child);
    }
  }
  return visible;
}

// Maps every node id to the id of its top-level "primary family" root (a node
// whose parentLanguageId is null after sanitizeLanguages). Walks each node's
// ancestor chain, memoizing results so the whole dataset resolves in ~O(n).
// A guard set makes any residual cycle resolve to itself instead of looping.
function computeFamilyOf(languages: Language[]): Map<string, string> {
  const parentOf = new Map<string, string | null>(languages.map(l => [l.id, l.parentLanguageId]));
  const familyOf = new Map<string, string>();
  const resolve = (id: string, guard: Set<string>): string => {
    const memo = familyOf.get(id);
    if (memo) return memo;
    const p = parentOf.get(id);
    const root = (p == null || !parentOf.has(p) || guard.has(id))
      ? id
      : (guard.add(id), resolve(p, guard));
    familyOf.set(id, root);
    return root;
  };
  for (const l of languages) resolve(l.id, new Set());
  return familyOf;
}

// Case-insensitive fuzzy ranking for the global search box. Returns a score
// (higher = better) or -1 for no match. Priority: exact prefix > substring >
// subsequence (characters appear in order but not contiguously). Shorter names
// rank above longer ones within the same tier so "Greek" beats "Greek, Mycenaean".
function fuzzyScore(name: string, q: string): number {
  const n = name.toLowerCase();
  const idx = n.indexOf(q);
  if (idx === 0) return 1000 - n.length;
  if (idx > 0) return 600 - idx - n.length * 0.01;
  // Subsequence fallback
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) qi++;
  }
  return qi === q.length ? 200 - n.length : -1;
}

function isAncestor(node: d3.HierarchyPointNode<Language>, selectedId?: string): boolean {
  if (!selectedId) return false;
  let cur: d3.HierarchyPointNode<Language> | null = node;
  while (cur) {
    if (cur.data.id === selectedId) return true;
    cur = cur.parent;
  }
  return false;
}

export const LanguageTree: React.FC<Props> = ({ languages, onSelect, selectedId, fontSize = 11, viewMode = 'tree', currentYear = TIMELINE_MAX_YEAR, onYearChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const fittedRef = useRef(false);

  // Auto-tracking camera state. Paused the moment the user manually pans/zooms;
  // re-armed as soon as the timeline scrubber (currentYear) moves again.
  const autoTrackPausedRef = useRef(false);
  // True while the user is actively dragging the scrubber thumb. Used to suppress
  // D3 transitions so the camera and nodes update instantly instead of stacking up
  // dozens of 280ms eases (which causes violent jitter during fast scrubbing).
  const scrubbingRef = useRef(false);
  // Current view mode, read inside the (once-installed) D3 zoom filter/constrain
  // closures so they can branch without being re-installed every render.
  const modeRef = useRef(viewMode);
  // Locked horizontal transform for timeline mode. The X axis never moves — only
  // ty is free — so the time axis stays pinned under vertical scrolling and stays
  // aligned with the HTML scrubber track.
  const lockedKRef = useRef(1);
  const lockedTxRef = useRef(0);
  // Allowed vertical translate range (screen px) for clamping timeline scroll.
  const tyBoundsRef = useRef<{ min: number; max: number }>({ min: 0, max: 0 });
  // Layout-coordinate lookup (id → {x: vertical slot, y: horizontal px}), kept
  // fresh by the layout effect so the search auto-scroll can read a node's exact
  // canvas position without re-running the whole layout.
  const nodePosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Set when a search result is chosen; the post-layout effect consumes it to
  // glide the camera onto the node once its position is available, then clears it.
  const pendingPanRef = useRef<string | null>(null);
  // Mirror of highlightedNodeId readable inside the once-installed zoom/wheel
  // closures (which can't see the latest state value directly).
  const highlightedNodeIdRef = useRef<string | null>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  // Bumped by the "Reset View" control to force a re-fit through the layout effect.
  const [fitNonce, setFitNonce] = useState(0);

  // Sanitize once per languages-prop change: deduplicates IDs, promotes nodes
  // with unknown parents to roots, and breaks any ancestor-chain cycles. All
  // downstream memos consume this safe array, not the raw prop.
  const safeLanguages = useMemo(() => sanitizeLanguages(languages), [languages]);

  const childrenMap = useMemo(() => buildChildrenMap(safeLanguages), [safeLanguages]);

  // ── Family isolation / filtering ────────────────────────────────────────────
  // Map each node → its top-level primary-family root, then derive the list of
  // primary families (root id, name, total languages in that family).
  const familyOf = useMemo(() => computeFamilyOf(safeLanguages), [safeLanguages]);
  const primaryFamilies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of safeLanguages) {
      const fam = familyOf.get(l.id) ?? l.id;
      counts.set(fam, (counts.get(fam) ?? 0) + 1);
    }
    return safeLanguages
      .filter(l => l.parentLanguageId === null)
      .map(r => ({ id: r.id, name: r.name, count: counts.get(r.id) ?? 1 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [safeLanguages, familyOf]);

  // Enabled families default to ALL. Lazy-init avoids an empty first paint.
  const [enabledFamilyIds, setEnabledFamilyIds] = useState<Set<string>>(
    () => new Set(sanitizeLanguages(languages).filter(l => l.parentLanguageId === null).map(l => l.id))
  );
  // Whether the slide-out filter panel is open.
  const [filterOpen, setFilterOpen] = useState(false);

  // On a genuine dataset change (new families appear), reset selection to all.
  // Skip the first run so we don't clobber the lazy-initialised set on mount.
  const familiesInitRef = useRef(true);
  useEffect(() => {
    if (familiesInitRef.current) { familiesInitRef.current = false; return; }
    setEnabledFamilyIds(new Set(primaryFamilies.map(f => f.id)));
  }, [primaryFamilies]);

  const toggleFamily = useCallback((id: string) => {
    setEnabledFamilyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const selectAllFamilies = useCallback(
    () => setEnabledFamilyIds(new Set(primaryFamilies.map(f => f.id))),
    [primaryFamilies]
  );
  const deselectAllFamilies = useCallback(() => setEnabledFamilyIds(new Set()), []);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => computeInitialExpanded(safeLanguages, buildChildrenMap(safeLanguages))
  );

  useEffect(() => {
    setExpandedIds(computeInitialExpanded(safeLanguages, childrenMap));
    fittedRef.current = false;
  }, [safeLanguages, childrenMap]);

  useEffect(() => {
    fittedRef.current = false;
  }, [viewMode]);

  // Drop every node whose top-level family is disabled. Because families are
  // disjoint subtrees, excluding a node here also excludes all its descendants.
  const activeLanguages = useMemo(
    () => safeLanguages.filter(l => enabledFamilyIds.has(familyOf.get(l.id) ?? l.id)),
    [safeLanguages, familyOf, enabledFamilyIds]
  );

  const visibleLanguages = useMemo(
    () => getVisibleLanguages(activeLanguages, expandedIds, childrenMap),
    [activeLanguages, expandedIds, childrenMap]
  );

  // ── Global search & auto-scroll navigation ──────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  useEffect(() => { highlightedNodeIdRef.current = highlightedNodeId; }, [highlightedNodeId]);

  // id → parent id, and id → display name, for ancestor-expansion and the
  // "Name (Family)" result label respectively.
  const parentOfMap = useMemo(
    () => new Map(safeLanguages.map(l => [l.id, l.parentLanguageId])),
    [safeLanguages]
  );
  const nameById = useMemo(
    () => new Map(safeLanguages.map(l => [l.id, l.name])),
    [safeLanguages]
  );

  // Fuzzy, case-insensitive ranking against the FULL sanitized dataset so hidden
  // families are still findable. Each result carries a `hidden` flag when its
  // family is currently toggled off in the filter panel.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as { lang: Language; family: string; hidden: boolean }[];
    const scored: { lang: Language; score: number }[] = [];
    for (const l of safeLanguages) {
      const score = fuzzyScore(l.name, q);
      if (score > -1) scored.push({ lang: l, score });
    }
    scored.sort((a, b) => b.score - a.score || a.lang.name.localeCompare(b.lang.name));
    return scored.slice(0, 40).map(s => ({
      lang: s.lang,
      family: nameById.get(familyOf.get(s.lang.id) ?? s.lang.id) ?? '—',
      hidden: !enabledFamilyIds.has(familyOf.get(s.lang.id) ?? s.lang.id),
    }));
  }, [searchQuery, safeLanguages, familyOf, nameById, enabledFamilyIds]);

  // Smoothly center the camera on a node. Safe to schedule an 800ms transition
  // here because this runs from a discrete user action (or the one-shot pending
  // effect), never from a reactive layout loop. Returns false if the node has no
  // current position (e.g. not yet grown / still collapsed) so the caller can retry.
  const panToNode = useCallback((id: string): boolean => {
    if (!svgRef.current || !zoomRef.current) return false;
    const pos = nodePosRef.current.get(id);
    if (!pos) return false;
    const { width, height } = dimensions;
    if (width === 0) return false;
    const svg = d3.select(svgRef.current);
    let target: d3.ZoomTransform;
    if (modeRef.current === 'timeline') {
      // X is locked; only recenter vertically, clamped to the legal scroll range.
      const K = lockedKRef.current;
      const b = tyBoundsRef.current;
      const ty = Math.max(b.min, Math.min(b.max, height / 2 - pos.x * K));
      target = d3.zoomIdentity.translate(lockedTxRef.current, ty).scale(K);
    } else {
      // Tree mode: pan both axes at the current scale to center the node.
      const K = transformRef.current.k;
      const tx = width / 2 - pos.y * K;
      const ty = height / 2 - pos.x * K;
      target = d3.zoomIdentity.translate(tx, ty).scale(K);
    }
    svg.transition().duration(800).ease(d3.easeCubicInOut)
      .call(zoomRef.current.transform, target);
    return true;
  }, [dimensions]);

  // Choosing a search result: re-enable the family if it was filtered out, then
  // reveal the node (expand ancestors, advance the scrubber), highlight it, and
  // queue the camera pan. The family re-enable is a single atomic setState so
  // the layout effect sees both the new activeLanguages AND visibleLanguages in
  // the same commit — ensuring nodePosRef is populated before the pan fires.
  const handleSearchSelect = useCallback((lang: Language) => {
    const famId = familyOf.get(lang.id) ?? lang.id;
    setEnabledFamilyIds(prev => {
      if (prev.has(famId)) return prev;
      const next = new Set(prev);
      next.add(famId);
      return next;
    });
    setExpandedIds(prev => {
      const next = new Set(prev);
      let cur = parentOfMap.get(lang.id) ?? null;
      while (cur) { next.add(cur); cur = parentOfMap.get(cur) ?? null; }
      return next;
    });
    if (viewMode === 'timeline' && onYearChange) {
      const yr = parseEarliestYear(lang.approxDate);
      if (yr != null && yr > currentYear) onYearChange(Math.min(TIMELINE_MAX_YEAR, yr));
    }
    onSelect(lang);
    setHighlightedNodeId(lang.id);
    pendingPanRef.current = lang.id;
    setSearchQuery('');
  }, [familyOf, parentOfMap, viewMode, onYearChange, currentYear, onSelect]);

  const handleNodeClick = useCallback((lang: Language) => {
    const hasKids = (childrenMap.get(lang.id)?.length ?? 0) > 0;
    if (hasKids) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        if (next.has(lang.id)) {
          const toRemove = [lang.id];
          let i = 0;
          while (i < toRemove.length) {
            for (const c of childrenMap.get(toRemove[i++]) ?? []) toRemove.push(c.id);
          }
          toRemove.forEach(id => next.delete(id));
        } else {
          next.add(lang.id);
        }
        return next;
      });
    }
    onSelect(lang);
  }, [childrenMap, onSelect]);

  const handleNodeClickRef = useRef(handleNodeClick);
  useEffect(() => { handleNodeClickRef.current = handleNodeClick; }, [handleNodeClick]);

  // ── Floating zoom controls ─────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 1.3);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 1 / 1.3);
  }, []);

  const handleResetView = useCallback(() => {
    fittedRef.current = false;
    autoTrackPausedRef.current = false;
    setFitNonce(n => n + 1);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;
    // All families disabled (or nothing visible): clear the canvas so no stale
    // nodes/links linger behind the empty-state overlay, then bail.
    if (visibleLanguages.length === 0) {
      if (gRef.current) {
        gRef.current.selectAll('path.link').remove();
        gRef.current.selectAll('g.node').remove();
        gRef.current.selectAll('g.growth-front').remove();
      }
      return;
    }

    // ── Layout ────────────────────────────────────────────────────────────────
    const virtualRoot: Language = { id: VIRTUAL_ROOT_ID, name: 'World Languages', parentLanguageId: null, family: 'Root' };
    const withVR = [virtualRoot, ...visibleLanguages.map(l => ({
      ...l, parentLanguageId: l.parentLanguageId === null ? VIRTUAL_ROOT_ID : l.parentLanguageId,
    }))];

    let root: d3.HierarchyPointNode<Language>;
    try {
      const hier = d3.stratify<Language>().id(d => d.id).parentId(d => d.parentLanguageId ?? null)(withVR);
      const leafCount = hier.leaves().length;
      // Timeline has horizontal scroll so we can afford a larger minimum without
      // clipping content; tree mode must fit in the viewport height.
      const [minSp, maxSp] = viewMode === 'timeline' ? [32, 40] : [20, 28];
      const spacing = Math.max(minSp, Math.min(maxSp, Math.floor(dimensions.height / Math.max(leafCount, 1))));
      root = d3.tree<Language>()
        .nodeSize([spacing, 220])
        .separation((a, b) => a.parent === b.parent ? 1 : 1.4)
        (hier) as d3.HierarchyPointNode<Language>;
    } catch (e) {
      console.error('Tree layout error:', e);
      return;
    }

    const allNodes = root.descendants().filter(d => d.data.id !== VIRTUAL_ROOT_ID);

    // ── Timeline positioning ──────────────────────────────────────────────────
    const yearScale = viewMode === 'timeline'
      ? d3.scaleLinear().domain([TIMELINE_MIN_YEAR, TIMELINE_MAX_YEAR]).range([80, dimensions.width - 200]).clamp(true)
      : null;

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    // Locked horizontal zoom for the timeline. Chosen so the full yearScale range
    // exactly fills the viewport between AXIS_HPAD margins (so it lines up with the
    // HTML scrubber). This is the ONLY zoom the timeline ever uses on X — it never
    // changes, which keeps the time axis perfectly stationary.
    let timelineK = 1;
    if (yearScale) {
      const xr = yearScale.range();
      const hSpan = Math.max(1, xr[1] - xr[0]);
      timelineK = clamp((dimensions.width - 2 * AXIS_HPAD) / hSpan, 0.3, 2.5);
    }

    // ── Growth filter (timeline scrubber) ─────────────────────────────────────
    // A node has "grown" once currentYear reaches its earliest appearance year,
    // and only if its parent has already grown — walking top-down keeps ancestry
    // intact and guarantees links are only ever drawn between two grown nodes
    // (no branch lines dangling toward not-yet-appeared children).
    const grownSet = new Set<string>();
    if (yearScale) {
      const walk = (node: d3.HierarchyPointNode<Language>) => {
        for (const child of node.children ?? []) {
          const yr = parseEarliestYear(child.data.approxDate);
          const appearsAt = yr == null ? -Infinity : yr;
          if (appearsAt <= currentYear) {
            grownSet.add(child.data.id);
            walk(child);
          }
        }
      };
      walk(root);
    }
    const renderNodes = yearScale ? allNodes.filter(d => grownSet.has(d.data.id)) : allNodes;

    // DFS leaf-ordering over ONLY the grown nodes: assign each grown leaf a
    // sequential y slot, then place each internal node at the midpoint of its
    // grown leaf descendants. Because the slot count tracks the visible front,
    // vertical spacing compresses to the currently-grown subtree and re-expands
    // (animated) as new branches sprout in — no dead gaps for hidden children.
    const timelineY = new Map<string, number>();
    if (yearScale) {
      // Hard vertical clearance floor: at least 26px on SCREEN between any two
      // nodes. Layout coords are scaled by timelineK on screen, so divide the
      // 26px target by timelineK to get the data-space floor.
      const SCREEN_FLOOR = 26;
      const dataFloor = SCREEN_FLOOR / timelineK;
      const LEAF_SPACING = Math.max(34, Math.ceil(dataFloor * 1.3));
      const MIN_GAP = Math.ceil(dataFloor);
      let leafIdx = 0;

      const grownKids = (node: d3.HierarchyPointNode<Language>) =>
        (node.children ?? []).filter(c => grownSet.has(c.data.id));

      // Phase 1 — global leaf slots: DFS assigns each grown leaf a strictly
      // sequential index that is unique across ALL independent family trees.
      // Independent families stack beneath one another without competing for
      // the same slot because leafIdx is never reset between subtrees.
      function assignLeaves(node: d3.HierarchyPointNode<Language>): void {
        if (node.data.id === VIRTUAL_ROOT_ID) {
          grownKids(node).forEach(c => assignLeaves(c));
          return;
        }
        const kids = grownKids(node);
        if (kids.length === 0) {
          timelineY.set(node.data.id, leafIdx * LEAF_SPACING);
          leafIdx++;
        } else {
          kids.forEach(c => assignLeaves(c));
        }
      }
      assignLeaves(root);

      // Phase 2 — internal node midpoints: place each grown internal node at
      // the vertical midpoint of its direct grown children. Children are already
      // placed from phase 1 (DFS bottom-up), so the lookup is always valid.
      function assignInternal(node: d3.HierarchyPointNode<Language>): void {
        if (node.data.id === VIRTUAL_ROOT_ID) {
          grownKids(node).forEach(c => assignInternal(c));
          return;
        }
        const kids = grownKids(node);
        if (kids.length === 0) return; // leaf: already placed
        kids.forEach(c => assignInternal(c));
        const ys = kids.map(c => timelineY.get(c.data.id) ?? 0);
        timelineY.set(node.data.id, (Math.min(...ys) + Math.max(...ys)) / 2);
      }
      assignInternal(root);

      // Phase 3 — push-apart: sort all placed nodes by y and shift any pair
      // that is closer than MIN_GAP upward. Leaves are already LEAF_SPACING
      // apart (>= MIN_GAP), so only internal node midpoints that landed on top
      // of another node get nudged. O(n log n) and guaranteed overlap-free.
      const sorted = [...timelineY.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i][1] < sorted[i - 1][1] + MIN_GAP) {
          sorted[i][1] = sorted[i - 1][1] + MIN_GAP;
          timelineY.set(sorted[i][0], sorted[i][1]);
        }
      }
    }

    const getPos = (d: d3.HierarchyPointNode<Language>) => {
      if (yearScale) {
        const year = parseEarliestYear(d.data.approxDate);
        const px = year != null ? yearScale(year) : yearScale(-3000);
        return { x: timelineY.get(d.data.id) ?? d.x, y: px };
      }
      return { x: d.x, y: d.y };
    };

    // Publish the current layout coordinates so the search auto-scroll can pan to
    // any rendered node without re-deriving the layout. Only nodes present here
    // (grown + expanded + family-enabled) are pannable; others fail and retry.
    nodePosRef.current = new Map(renderNodes.map(d => {
      const p = getPos(d);
      return [d.data.id, { x: p.x, y: p.y }] as const;
    }));

    // ── SVG / zoom init ───────────────────────────────────────────────────────
    const svg = d3.select(svgRef.current);

    if (!gRef.current) {
      // Full-size invisible hit-target so wheel/pinch zoom never stutters when
      // the pointer is over a line or label. Sits beneath the tree group.
      svg.append('rect').attr('class', 'zoom-bg').attr('x', 0).attr('y', 0)
        .attr('fill', 'transparent').style('pointer-events', 'all');
      gRef.current = svg.append('g').attr('class', 'tree-root');
      zoomRef.current = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.05, 3])
        .filter(event => {
          // Timeline: wheel/trackpad is handled by our vertical-only scroll
          // handler below, so block D3's native wheel-zoom. Drag still allowed.
          if (modeRef.current === 'timeline' && event.type === 'wheel') return false;
          return !event.button && (!event.ctrlKey || event.type === 'wheel');
        })
        .constrain((transform, extent, translateExtent) => {
          // Timeline: lock X and scale to the fitted values so the time axis is
          // completely stationary; only the vertical translate (ty) is free, and
          // it is clamped to the content bounds. Tree mode is unconstrained.
          if (modeRef.current === 'timeline') {
            const b = tyBoundsRef.current;
            const ty = Math.max(b.min, Math.min(b.max, transform.y));
            return d3.zoomIdentity.translate(lockedTxRef.current, ty).scale(lockedKRef.current);
          }
          // Tree mode: no translateExtent is set, so the default behaviour is to
          // leave the proposed transform unchanged (free pan + zoom).
          return transform;
        })
        .on('zoom', event => {
          transformRef.current = event.transform;
          gRef.current?.attr('transform', event.transform);
          // sourceEvent is set only for genuine user gestures (drag/wheel/pinch);
          // programmatic transitions leave it null. A real gesture pauses tracking
          // and dismisses any search highlight (the user has taken over navigation).
          if (event.sourceEvent) {
            autoTrackPausedRef.current = true;
            if (highlightedNodeIdRef.current) setHighlightedNodeId(null);
          }
        });
      svg.call(zoomRef.current);

      // Click on empty canvas (the full-size hit rect) clears the search highlight.
      svg.select<SVGRectElement>('rect.zoom-bg').on('click', () => {
        if (highlightedNodeIdRef.current) setHighlightedNodeId(null);
      });

      // Vertical-only scroll for the timeline: wheel/trackpad updates ONLY ty,
      // leaving the locked X axis untouched. The constrain() above clamps ty.
      svg.on('wheel.vscroll', (event: WheelEvent) => {
        if (modeRef.current !== 'timeline' || !zoomRef.current) return;
        event.preventDefault();
        const cur = transformRef.current;
        const b = tyBoundsRef.current;
        // Clamp here before constrain() so the scroll hard-stops at content
        // bounds even if tyBoundsRef is briefly stale (e.g. during fast scrub).
        const nextTy = Math.max(b.min, Math.min(b.max, cur.y - event.deltaY));
        const next = d3.zoomIdentity
          .translate(lockedTxRef.current, nextTy)
          .scale(lockedKRef.current);
        d3.select(svgRef.current!).call(zoomRef.current.transform, next);
        autoTrackPausedRef.current = true;
        if (highlightedNodeIdRef.current) setHighlightedNodeId(null);
      }, { passive: false } as AddEventListenerOptions);
    }

    modeRef.current = viewMode;

    // Keep the zoom hit-target covering the whole viewport (default d3 zoom
    // filter already handles wheel zoom and ctrl-wheel trackpad pinch).
    svg.select<SVGRectElement>('rect.zoom-bg')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height);

    const g = gRef.current;

    // Single shared transition instance — the camera pan and the node vertical
    // re-layout are scheduled on it together so the diagonal motion is cohesive.
    // Duration drops to 0 while the user is dragging the scrubber to prevent
    // dozens of stacked 280ms eases from shaking the canvas.
    const transDur = scrubbingRef.current ? 0 : TRANSITION_MS;
    const trans = d3.transition().duration(transDur).ease(d3.easeQuadInOut);

    // While scrubbing, write attributes directly to the selection instead of
    // scheduling a transition. At 1,800+ nodes (~3,500 elements with links),
    // creating a transition + interpolators per element on every scrub tick is
    // the dominant cost; direct writes keep the scrub at a steady frame rate.
    // The cast is safe: only .attr/.style/.text/.remove are chained downstream,
    // all of which exist on both Selection and Transition with the same runtime
    // behaviour.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const animate = <GE extends d3.BaseType, Datum>(
      sel: d3.Selection<GE, Datum, any, any>,
    ): d3.Transition<GE, Datum, any, any> =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (scrubbingRef.current ? sel : sel.transition(trans)) as any;

    // ── Camera ─────────────────────────────────────────────────────────────────
    // TIMELINE: the X axis is fully LOCKED. K and TX are constants chosen so the
    // yearScale range fills the viewport between AXIS_HPAD margins, which makes
    // the SVG axis line up exactly with the HTML scrubber track (left/right =
    // AXIS_HPAD). Only ty is free — the user scrolls vertically via wheel/drag,
    // and the camera here never pans on scrub (eliminating horizontal jitter).
    if (yearScale && zoomRef.current && renderNodes.length) {
      const xRange = yearScale.range();              // [80, width - 200]
      const K = timelineK;
      const TX = AXIS_HPAD - xRange[0] * K;          // pins yearScale(MIN) → AXIS_HPAD on screen
      lockedKRef.current = K;
      lockedTxRef.current = TX;

      // Vertical content extent (screen px) and the resulting legal ty range.
      // Filter out any NaN values defensively (would break Math.min/max and
      // cascade into NaN tyBounds, silently disabling the constrain clamp).
      const slots = renderNodes
        .map(d => timelineY.get(d.data.id))
        .filter((v): v is number => v !== undefined && Number.isFinite(v));
      if (!slots.length) return;
      const minS = Math.min(...slots) * K;
      const maxS = Math.max(...slots) * K;
      const M = 80; // top breathing room
      // Extra clearance at the bottom so the lowest rows scroll clear of the
      // floating Temporal Scrubber bar instead of hiding behind it.
      const BOTTOM_BUFFER = 120;
      let tyBounds: { min: number; max: number };
      if (maxS - minS + M + BOTTOM_BUFFER <= dimensions.height) {
        // Content fits — pin it centered (no scroll).
        const ty = dimensions.height / 2 - (minS + maxS) / 2;
        tyBounds = { min: ty, max: ty };
      } else {
        tyBounds = {
          min: (dimensions.height - BOTTOM_BUFFER) - maxS, // scrolled to bottom
          max: M - minS,                                    // scrolled to top
        };
      }
      tyBoundsRef.current = tyBounds;

      // First paint / reset: center the grown content. Otherwise preserve the
      // user's current vertical scroll position.
      const wasFitted = fittedRef.current;
      let ty = wasFitted ? transformRef.current.y : dimensions.height / 2 - (minS + maxS) / 2;
      ty = clamp(ty, tyBounds.min, tyBounds.max);
      fittedRef.current = true;

      // Always snap instantly — never schedule a D3 transition on the zoom
      // transform from within the layout effect. svg.transition.call(zoom.transform)
      // dispatches zoom events on every animation frame, re-triggering this effect
      // and causing an infinite render loop when family filters change tyBounds.
      const target = d3.zoomIdentity.translate(TX, ty).scale(K);
      svg.call(zoomRef.current.transform, target);
    } else if (!yearScale && !fittedRef.current && zoomRef.current && renderNodes.length) {
      const xs = renderNodes.map(d => d.x);
      const ys = renderNodes.map(d => d.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const scale = Math.min(0.9, Math.min(
        dimensions.width  / ((maxY - minY) + 400),
        dimensions.height / ((maxX - minX) + 80)
      ));
      const tx = 120;
      const ty = dimensions.height / 2 - ((minX + maxX) / 2) * scale;
      svg.call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      fittedRef.current = true;
    } else {
      g.attr('transform', transformRef.current);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    const isSel   = (d: d3.HierarchyPointNode<Language>) => d.data.id === selectedId;
    const isRoot  = (d: d3.HierarchyPointNode<Language>) => d.data.parentLanguageId === VIRTUAL_ROOT_ID;
    const hasCh   = (d: d3.HierarchyPointNode<Language>) => (childrenMap.get(d.data.id)?.length ?? 0) > 0;
    const isExp   = (d: d3.HierarchyPointNode<Language>) => expandedIds.has(d.data.id);
    const r       = (d: d3.HierarchyPointNode<Language>) => isSel(d) ? 9 : isRoot(d) ? 7 : hasCh(d) ? 6 : 4;

    // ── Growth-front vertical marker ──────────────────────────────────────────
    // Rendered inside the zoom group so it stays pixel-aligned with the nodes
    // as the user pans/zooms. The tick-labelled axis lives in HTML (see JSX)
    // so it can be positioned to align with the scrubber track without fighting
    // the zoom transform.
    g.selectAll<SVGGElement, unknown>('g.growth-front').remove();
    if (yearScale) {
      const grownSlots = renderNodes.map(n => timelineY.get(n.data.id) ?? 0);
      const frontX = yearScale(currentYear);
      const frontTop = (grownSlots.length ? Math.min(...grownSlots) : 0) - 40;
      const frontBot = (grownSlots.length ? Math.max(...grownSlots) : 0) + 60;

      const frontG = g.append('g').attr('class', 'growth-front');
      frontG.append('line')
        .attr('x1', frontX).attr('x2', frontX)
        .attr('y1', frontTop).attr('y2', frontBot)
        .attr('stroke', 'rgba(197,160,89,0.10)').attr('stroke-width', 10);
      frontG.append('line')
        .attr('x1', frontX).attr('x2', frontX)
        .attr('y1', frontTop).attr('y2', frontBot)
        .attr('stroke', 'rgba(197,160,89,0.55)').attr('stroke-width', 1.5);
    }

    // ── Links — enter / update / exit ─────────────────────────────────────────
    // A source is "pre-timeline" when its true linguistic date predates our axis
    // (TIMELINE_MIN_YEAR = -5000). Because yearScale clamps, these parents render
    // at the left wall and produce misleading horizontal lines across the canvas.
    const srcIsPreTimeline = (d: d3.HierarchyPointLink<Language>) => {
      if (!yearScale) return false;
      const yr = parseEarliestYear((d.source as d3.HierarchyPointNode<Language>).data.approxDate);
      return yr === null || yr < TIMELINE_MIN_YEAR;
    };

    const ANCIENT_TAIL = 24; // px of stub drawn to the left of the child node

    const linkPathFn = (d: d3.HierarchyPointLink<Language>) => {
      const sp = getPos(d.source as d3.HierarchyPointNode<Language>);
      const tp = getPos(d.target as d3.HierarchyPointNode<Language>);
      if (yearScale) {
        if (srcIsPreTimeline(d)) {
          // Parent predates axis: draw a short open-ended stub pointing left from
          // the child to indicate it emerges from deep, off-screen history rather
          // than stretching an artificial line all the way to the 5000 BCE wall.
          return `M${tp.y - ANCIENT_TAIL},${tp.x}L${tp.y},${tp.x}`;
        }
        // Normal orthogonal elbow: branch at parent's year, then out to child.
        return `M${sp.y},${sp.x}L${sp.y},${tp.x}L${tp.y},${tp.x}`;
      }
      const mx = (sp.y + tp.y) / 2;
      return `M${sp.y},${sp.x}C${mx},${sp.x} ${mx},${tp.x} ${tp.y},${tp.x}`;
    };

    const linkData = root.links().filter(l =>
      l.source.data.id !== VIRTUAL_ROOT_ID &&
      (!yearScale || (grownSet.has(l.source.data.id) && grownSet.has(l.target.data.id)))
    );
    const linkSel  = g.selectAll<SVGPathElement, typeof linkData[0]>('path.link')
      .data(linkData, d => `${d.source.data.id}→${d.target.data.id}`);

    animate(linkSel.exit()).style('opacity', 0).remove();

    const linkEnter = linkSel.enter().append('path')
      .attr('class', 'link').attr('fill', 'none')
      .attr('d', linkPathFn).style('opacity', 0);

    animate<SVGPathElement, d3.HierarchyPointLink<Language>>(linkEnter.merge(linkSel))
      .style('opacity', d => (yearScale && srcIsPreTimeline(d)) ? 0.35 : 1)
      .attr('fill', 'none')
      .attr('d', linkPathFn)
      .attr('stroke-dasharray', d => (yearScale && srcIsPreTimeline(d)) ? '3,3' : null)
      .attr('stroke', d => {
        const hi = isAncestor(d.source as d3.HierarchyPointNode<Language>, selectedId) || isAncestor(d.target as d3.HierarchyPointNode<Language>, selectedId);
        return hi ? 'rgba(197,160,89,0.7)' : 'rgba(197,160,89,0.18)';
      })
      .attr('stroke-width', d => {
        const hi = isAncestor(d.source as d3.HierarchyPointNode<Language>, selectedId) || isAncestor(d.target as d3.HierarchyPointNode<Language>, selectedId);
        return hi ? 2 : 1;
      });

    // ── Nodes — enter / update / exit ─────────────────────────────────────────
    const nodeSel = g.selectAll<SVGGElement, d3.HierarchyPointNode<Language>>('g.node')
      .data(renderNodes, d => d.data.id);

    animate(nodeSel.exit()).style('opacity', 0).remove();

    const nodeEnter = nodeSel.enter().append('g')
      .attr('class', 'node')
      .attr('transform', d => { const p = getPos(d); return `translate(${p.y},${p.x})`; })
      .style('opacity', 0)
      .on('click', (_e, d) => handleNodeClickRef.current(d.data))
      .style('cursor', d => hasCh(d) ? 'pointer' : 'default');

    nodeEnter.filter(isRoot).append('circle')
      .attr('class', 'glow-ring').attr('r', 14).attr('fill', 'none')
      .attr('stroke', 'rgba(197,160,89,0.15)').attr('stroke-width', 8);

    nodeEnter.append('text').attr('class', 'lbl-bg')
      .attr('stroke', '#0a0a0a').attr('stroke-width', 4).attr('stroke-linejoin', 'round')
      .style('font-family', '"Playfair Display", serif')
      .style('font-style', 'italic').style('letter-spacing', '0.04em').attr('fill', 'none');

    nodeEnter.append('circle').attr('class', 'main-circle');

    nodeEnter.filter(hasCh).append('text').attr('class', 'expand-icon')
      .attr('dy', '0.35em').attr('text-anchor', 'middle')
      .style('font-family', 'monospace').style('font-weight', 'bold')
      .style('pointer-events', 'none').style('user-select', 'none');

    nodeEnter.append('text').attr('class', 'lbl-fg')
      .style('font-family', '"Playfair Display", serif')
      .style('font-style', 'italic').style('letter-spacing', '0.04em');

    // ── Merge enter + existing, apply transitions ─────────────────────────────
    const nodeAll = nodeEnter.merge(nodeSel);

    animate<SVGGElement, d3.HierarchyPointNode<Language>>(nodeAll)
      .style('opacity', 1)
      .attr('transform', d => { const p = getPos(d); return `translate(${p.y},${p.x})`; });

    animate<SVGCircleElement, d3.HierarchyPointNode<Language>>(nodeAll.select<SVGCircleElement>('.main-circle'))
      .attr('r', r)
      .attr('fill', d => isSel(d) ? '#c5a059' : isRoot(d) ? '#1a1308' : '#0a0a0a')
      .attr('stroke', '#c5a059')
      .attr('stroke-width', d => isSel(d) ? 3 : isRoot(d) ? 2 : 1.2)
      .style('filter', d =>
        isSel(d)   ? 'drop-shadow(0 0 8px rgba(197,160,89,0.8))'
        : isRoot(d) ? 'drop-shadow(0 0 4px rgba(197,160,89,0.3))'
        : 'none');

    nodeAll.select<SVGTextElement>('.expand-icon')
      .text(d => isExp(d) ? '−' : '+')
      .style('font-size', d => `${r(d) * 1.5}px`)
      .style('fill', d => isSel(d) ? '#0a0a0a' : '#c5a059');

    // Modern / right-edge nodes flip their label to the left so it stays inside
    // the viewport. A node flips when its year is modern (> 1850 CE) or its
    // on-screen x is within 180px of the right edge (TX/K are the locked
    // timeline transform; screen x = TX + yearPx * K).
    const flipLabel = (d: d3.HierarchyPointNode<Language>) => {
      if (!yearScale) return false;
      const year = parseEarliestYear(d.data.approxDate);
      if (year != null && year > 1850) return true;
      const screenX = lockedTxRef.current + getPos(d).y * lockedKRef.current;
      return screenX > dimensions.width - 180;
    };

    // In timeline mode the horizontal axis is year, so left/right placement
    // based on d.children has no meaning — labels go right unless flipped.
    const labelX = (d: d3.HierarchyPointNode<Language>) =>
      yearScale ? (flipLabel(d) ? -(r(d) + 8) : r(d) + 6) : d.children ? -(r(d) + 6) : r(d) + 6;
    const labelAnchor = (d: d3.HierarchyPointNode<Language>) =>
      yearScale ? (flipLabel(d) ? 'end' : 'start') : d.children ? 'end' : 'start';

    const applyLabel = (sel: d3.Selection<SVGTextElement, d3.HierarchyPointNode<Language>, SVGGElement, unknown>) =>
      sel
        .attr('dy', '0.31em')
        .attr('x', labelX)
        .attr('text-anchor', labelAnchor)
        .text(d => d.data.name)
        .style('font-size', d => isRoot(d) ? `${fontSize + 2}px` : `${fontSize}px`);

    applyLabel(nodeAll.select<SVGTextElement>('.lbl-bg'));
    applyLabel(nodeAll.select<SVGTextElement>('.lbl-fg'))
      .style('fill', d => isSel(d) ? '#c5a059' : isRoot(d) ? '#d4bc8a' : '#e0d8cc')
      .style('opacity', d => isSel(d) ? 1 : 0.85);

    // ── Search highlight ring ─────────────────────────────────────────────────
    // A single pulsing gold ring drawn over the node the user jumped to via
    // search. Rebuilt each render (cheap — one element) and lives inside the zoom
    // group so it stays glued to the node through the pan and any scroll.
    g.selectAll('g.search-highlight').remove();
    if (highlightedNodeId) {
      const hn = renderNodes.find(d => d.data.id === highlightedNodeId);
      if (hn) {
        const p = getPos(hn);
        const hg = g.append('g').attr('class', 'search-highlight')
          .attr('transform', `translate(${p.y},${p.x})`)
          .style('pointer-events', 'none');
        // Steady inner ring + expanding/fading outer pulse.
        hg.append('circle').attr('class', 'search-pulse-core')
          .attr('r', r(hn) + 4).attr('fill', 'none')
          .attr('stroke', '#ffd86b').attr('stroke-width', 2)
          .style('filter', 'drop-shadow(0 0 6px rgba(255,216,107,0.9))');
        hg.append('circle').attr('class', 'search-pulse-ring')
          .attr('r', r(hn) + 4).attr('fill', 'none')
          .attr('stroke', '#ffd86b').attr('stroke-width', 2.5);
      }
    }
  }, [visibleLanguages, expandedIds, dimensions, selectedId, fontSize, childrenMap, viewMode, currentYear, fitNonce, highlightedNodeId]);

  // After the layout effect has repopulated nodePosRef, execute any queued pan.
  // If the target isn't positioned yet (e.g. the scrubber is still advancing to
  // reveal it) the pending id is kept and retried on the next layout commit.
  useEffect(() => {
    if (!pendingPanRef.current) return;
    if (panToNode(pendingPanRef.current)) pendingPanRef.current = null;
  }, [highlightedNodeId, visibleLanguages, dimensions, currentYear, panToNode]);

  // Tick years for the HTML axis overlay — same set as was in the SVG axis.
  const TICK_YEARS = [-5000, -4000, -3000, -2000, -1000, 0, 500, 1000, 1500, 2000];
  const yearPct = (yr: number) =>
    ((yr - TIMELINE_MIN_YEAR) / (TIMELINE_MAX_YEAR - TIMELINE_MIN_YEAR)) * 100;

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ background: '#0a0a0a' }}>
      <svg ref={svgRef} className="w-full h-full" />

      {/* ── Global search overlay (top-left) ────────────────────────────────────
           Fuzzy-matches the active dataset as the user types; choosing a result
           expands ancestors, advances the scrubber if needed, drops a pulsing
           highlight ring, and glides the camera onto the node. ───────────────── */}
      <div className="absolute top-4 left-4 z-20 w-72">
        <div className="flex items-center gap-2 px-3 py-2 bg-onyx/80 backdrop-blur-sm border border-gold/20 rounded-sm focus-within:border-gold/50 transition-colors">
          <Search className="w-3.5 h-3.5 text-gold/50 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchQuery('');
              if (e.key === 'Enter' && searchResults.length) handleSearchSelect(searchResults[0].lang);
            }}
            placeholder="Search languages…"
            className="flex-1 bg-transparent text-xs text-parchment placeholder:text-gold/30 outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              title="Clear"
              className="text-gold/40 hover:text-gold transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {searchQuery.trim() && (
          <div className="mt-1 max-h-80 overflow-y-auto bg-[#080808]/95 backdrop-blur-md border border-gold/20 rounded-sm shadow-2xl">
            {searchResults.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-gold/40 font-mono uppercase tracking-[0.15em]">
                No matches
              </div>
            ) : (
              searchResults.map(({ lang, family, hidden }) => (
                <button
                  key={lang.id}
                  onClick={() => handleSearchSelect(lang)}
                  className={`w-full flex items-baseline gap-2 px-3 py-2 text-left hover:bg-gold/10 transition-colors group ${hidden ? 'opacity-50 hover:opacity-100' : ''}`}
                >
                  <span className="text-xs text-parchment truncate group-hover:text-gold">
                    {lang.name}
                  </span>
                  <span className="text-[10px] font-mono truncate ml-auto shrink-0 text-gold/40">
                    {family}
                    {hidden && <span className="ml-1 text-gold/30">· hidden</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Filter Families toggle — opens the slide-out panel. */}
      <button
        onClick={() => setFilterOpen(o => !o)}
        title="Filter language families"
        className={`absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.15em] rounded-sm border backdrop-blur-sm transition-colors ${
          filterOpen
            ? 'bg-gold/20 text-gold border-gold/40'
            : 'bg-onyx/80 text-gold/60 border-gold/20 hover:text-gold hover:bg-white/5'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Filter Families
        {enabledFamilyIds.size < primaryFamilies.length && (
          <span className="text-gold tabular-nums">
            {enabledFamilyIds.size}/{primaryFamilies.length}
          </span>
        )}
      </button>

      {/* Floating controls. Zoom +/- are hidden in timeline mode because the
          horizontal axis is locked there; only Reset (re-center) is offered.
          Sits below the Filter Families pill. */}
      <div className="absolute top-16 right-4 flex flex-col gap-px bg-onyx/80 backdrop-blur-sm border border-gold/20 rounded-sm overflow-hidden">
        {viewMode !== 'timeline' && (
          <>
            <button onClick={handleZoomIn} title="Zoom in"
              className="p-2 text-gold/60 hover:text-gold hover:bg-white/5 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
            <div className="h-px bg-gold/15" />
            <button onClick={handleZoomOut} title="Zoom out"
              className="p-2 text-gold/60 hover:text-gold hover:bg-white/5 transition-colors">
              <Minus className="w-4 h-4" />
            </button>
            <div className="h-px bg-gold/15" />
          </>
        )}
        <button onClick={handleResetView} title={viewMode === 'timeline' ? 'Re-center' : 'Reset view'}
          className="p-2 text-gold/60 hover:text-gold hover:bg-white/5 transition-colors">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Slide-out family filter panel ──────────────────────────────────────
           Slides in from the right edge. Toggling a checkbox updates
           enabledFamilyIds, which re-derives visibleLanguages and triggers the
           layout effect — an immediate, eased re-layout of the canvas. ──────── */}
      <div
        className={`absolute top-0 right-0 h-full w-72 z-30 flex flex-col bg-[#080808]/95 backdrop-blur-md border-l border-gold/20 shadow-2xl transition-transform duration-300 ease-out ${
          filterOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gold/15 shrink-0">
          <span className="text-[11px] uppercase tracking-[0.25em] text-gold font-mono">
            Filter Families
          </span>
          <button
            onClick={() => setFilterOpen(false)}
            title="Close"
            className="p-1 text-gold/50 hover:text-gold hover:bg-white/5 rounded-sm transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/10 shrink-0">
          <button
            onClick={selectAllFamilies}
            className="flex-1 py-1.5 text-[10px] uppercase tracking-[0.15em] font-mono border border-gold/20 rounded-sm text-gold/70 hover:text-gold hover:bg-gold/10 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={deselectAllFamilies}
            className="flex-1 py-1.5 text-[10px] uppercase tracking-[0.15em] font-mono border border-gold/20 rounded-sm text-gold/70 hover:text-gold hover:bg-gold/10 transition-colors"
          >
            Deselect All
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {primaryFamilies.map(fam => {
            const on = enabledFamilyIds.has(fam.id);
            return (
              <label
                key={fam.id}
                className="flex items-center gap-3 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-white/5 transition-colors group"
              >
                <span
                  className={`flex items-center justify-center w-4 h-4 rounded-[3px] border shrink-0 transition-colors ${
                    on ? 'bg-gold border-gold' : 'border-gold/40 group-hover:border-gold/70'
                  }`}
                >
                  {on && <span className="text-[10px] leading-none text-[#080808] font-bold">✓</span>}
                </span>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleFamily(fam.id)}
                  className="sr-only"
                />
                <span className={`flex-1 text-xs truncate transition-colors ${on ? 'text-parchment' : 'text-parchment/40'}`}>
                  {fam.name}
                </span>
                <span className="text-[10px] font-mono tabular-nums text-gold/40 shrink-0">
                  {fam.count}
                </span>
              </label>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-gold/10 shrink-0 text-[9px] font-mono uppercase tracking-[0.15em] text-gold/30">
          {enabledFamilyIds.size} / {primaryFamilies.length} families shown
        </div>
      </div>

      {visibleLanguages.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gold/40 uppercase tracking-[0.3em] font-mono text-xs pointer-events-none">
          {primaryFamilies.length > 0 && enabledFamilyIds.size === 0
            ? 'No families selected'
            : 'Accessing Genealogical Records…'}
        </div>
      )}

      {/* ── Unified HTML axis + scrubber overlay ────────────────────────────────
           Positioned with AXIS_HPAD on each side so its track sits exactly on
           top of where the SVG yearScale axis renders at the default fit zoom.
           Transparent background so the growing tree shows through. ───────── */}
      {viewMode === 'timeline' && onYearChange && (
        <div
          className="absolute bottom-6 hidden md:block pointer-events-none"
          style={{ left: AXIS_HPAD, right: AXIS_HPAD }}
        >
          <div className="pointer-events-auto px-4 py-3 bg-[#050505]/70 backdrop-blur-sm rounded-xl border border-gold/15">
            {/* Header row */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.25em] text-gold/50 font-mono">
                Temporal Scrubber
              </span>
              <span className="text-[11px] font-mono text-gold tabular-nums">
                {(currentYear ?? TIMELINE_MAX_YEAR) < 0
                  ? `${Math.abs(currentYear ?? TIMELINE_MAX_YEAR).toLocaleString()} BCE`
                  : `${currentYear ?? TIMELINE_MAX_YEAR} CE`}
              </span>
            </div>

            {/* Custom div slider — thumb is centered on yearPct() exactly,
                matching the SVG yearScale at the locked fit zoom. Native range
                inputs have internal browser padding that offsets the thumb by
                ~thumbRadius at the extremes, breaking pixel alignment. */}
            <div
              ref={trackRef}
              className="relative h-1 bg-neutral-800 rounded-full cursor-pointer my-2"
              onPointerDown={(e) => {
                scrubbingRef.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                if (!trackRef.current || !onYearChange) return;
                const rect = trackRef.current.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                onYearChange(Math.round(TIMELINE_MIN_YEAR + pct * (TIMELINE_MAX_YEAR - TIMELINE_MIN_YEAR)));
              }}
              onPointerMove={(e) => {
                if (!scrubbingRef.current || !trackRef.current || !onYearChange) return;
                const rect = trackRef.current.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                onYearChange(Math.round(TIMELINE_MIN_YEAR + pct * (TIMELINE_MAX_YEAR - TIMELINE_MIN_YEAR)));
              }}
              onPointerUp={() => { scrubbingRef.current = false; }}
            >
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-amber-500 pointer-events-none"
                style={{ left: `calc(${yearPct(currentYear ?? TIMELINE_MAX_YEAR)}% - 8px)` }}
              />
            </div>

            {/* Tick labels — positioned by yearPct() so they match the range
                input thumb position for each year. */}
            <div className="relative h-4 mt-0.5">
              {TICK_YEARS.map(yr => (
                <span
                  key={yr}
                  className="absolute -translate-x-1/2 text-[9px] uppercase tracking-[0.2em] font-mono text-gold/30"
                  style={{ left: `${yearPct(yr)}%` }}
                >
                  {yr < 0 ? `${Math.abs(yr)} BCE` : yr === 0 ? '0' : `${yr}`}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 text-[9px] text-gold/30 font-mono uppercase tracking-widest">
        {viewMode === 'timeline'
          ? 'Scroll / drag to pan vertically · Time axis locked · Scrub to grow'
          : 'Scroll / pinch to zoom · Drag to pan · Click node to expand / collapse'}
      </div>
    </div>
  );
};
