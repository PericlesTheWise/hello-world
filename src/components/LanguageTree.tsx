import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Plus, Minus, RotateCcw } from 'lucide-react';
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

function parseEarliestYear(approxDate?: string): number | null {
  if (!approxDate) return null;
  const s = approxDate.replace(/,/g, '');

  const nums: { val: number; idx: number }[] = [];
  const numRe = /\d+/g;
  let m: RegExpExecArray | null;
  while ((m = numRe.exec(s)) !== null) nums.push({ val: parseInt(m[0], 10), idx: m.index });
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
  return Math.min(...signed);
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
  function deepestPath(id: string): string[] {
    const children = childrenMap.get(id) ?? [];
    if (!children.length) return [id];
    let best: string[] = [];
    for (const c of children) {
      const p = deepestPath(c.id);
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

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  // Bumped by the "Reset View" control to force a re-fit through the layout effect.
  const [fitNonce, setFitNonce] = useState(0);
  const childrenMap = useMemo(() => buildChildrenMap(languages), [languages]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => computeInitialExpanded(languages, buildChildrenMap(languages))
  );

  useEffect(() => {
    setExpandedIds(computeInitialExpanded(languages, childrenMap));
    fittedRef.current = false;
  }, [languages, childrenMap]);

  useEffect(() => {
    fittedRef.current = false;
  }, [viewMode]);

  const visibleLanguages = useMemo(
    () => getVisibleLanguages(languages, expandedIds, childrenMap),
    [languages, expandedIds, childrenMap]
  );

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
    if (!svgRef.current || dimensions.width === 0 || visibleLanguages.length === 0) return;

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
          // programmatic transitions leave it null. A real gesture pauses tracking.
          if (event.sourceEvent) autoTrackPausedRef.current = true;
        });
      svg.call(zoomRef.current);

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
      const M = 80; // top/bottom breathing room
      let tyBounds: { min: number; max: number };
      if (maxS - minS + 2 * M <= dimensions.height) {
        // Content fits — pin it centered (no scroll).
        const ty = dimensions.height / 2 - (minS + maxS) / 2;
        tyBounds = { min: ty, max: ty };
      } else {
        tyBounds = {
          min: (dimensions.height - M) - maxS, // scrolled to bottom
          max: M - minS,                        // scrolled to top
        };
      }
      tyBoundsRef.current = tyBounds;

      // First paint / reset: center the grown content. Otherwise preserve the
      // user's current vertical scroll position.
      let ty = fittedRef.current ? transformRef.current.y : dimensions.height / 2 - (minS + maxS) / 2;
      ty = clamp(ty, tyBounds.min, tyBounds.max);
      fittedRef.current = true;

      // Enforce the lock instantly — the camera does not animate on scrub; only
      // the nodes re-layout. constrain() re-clamps ty for safety.
      svg.call(zoomRef.current.transform, d3.zoomIdentity.translate(TX, ty).scale(K));
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

    linkSel.exit().transition(trans).style('opacity', 0).remove();

    const linkEnter = linkSel.enter().append('path')
      .attr('class', 'link').attr('fill', 'none')
      .attr('d', linkPathFn).style('opacity', 0);

    linkEnter.merge(linkSel)
      .transition(trans)
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

    nodeSel.exit().transition(trans).style('opacity', 0).remove();

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

    nodeAll.transition(trans)
      .style('opacity', 1)
      .attr('transform', d => { const p = getPos(d); return `translate(${p.y},${p.x})`; });

    nodeAll.select<SVGCircleElement>('.main-circle')
      .transition(trans)
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

    // In timeline mode the horizontal axis is year, so left/right placement
    // based on d.children has no meaning — put all labels to the right.
    const labelX = (d: d3.HierarchyPointNode<Language>) =>
      yearScale ? r(d) + 6 : d.children ? -(r(d) + 6) : r(d) + 6;
    const labelAnchor = (d: d3.HierarchyPointNode<Language>) =>
      yearScale ? 'start' : d.children ? 'end' : 'start';

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
  }, [visibleLanguages, expandedIds, dimensions, selectedId, fontSize, childrenMap, viewMode, currentYear, fitNonce]);

  // Tick years for the HTML axis overlay — same set as was in the SVG axis.
  const TICK_YEARS = [-5000, -4000, -3000, -2000, -1000, 0, 500, 1000, 1500, 2000];
  const yearPct = (yr: number) =>
    ((yr - TIMELINE_MIN_YEAR) / (TIMELINE_MAX_YEAR - TIMELINE_MIN_YEAR)) * 100;

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ background: '#0a0a0a' }}>
      <svg ref={svgRef} className="w-full h-full" />

      {/* Floating controls. Zoom +/- are hidden in timeline mode because the
          horizontal axis is locked there; only Reset (re-center) is offered. */}
      <div className="absolute top-4 right-4 flex flex-col gap-px bg-onyx/80 backdrop-blur-sm border border-gold/20 rounded-sm overflow-hidden">
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

      {visibleLanguages.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gold/40 uppercase tracking-[0.3em] font-mono text-xs">
          Accessing Genealogical Records…
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
