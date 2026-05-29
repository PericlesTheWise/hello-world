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
}

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

export const LanguageTree: React.FC<Props> = ({ languages, onSelect, selectedId, fontSize = 11, viewMode = 'tree', currentYear = TIMELINE_MAX_YEAR }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const fittedRef = useRef(false);

  // Auto-tracking camera state. Paused the moment the user manually pans/zooms;
  // re-armed as soon as the timeline scrubber (currentYear) moves again.
  const autoTrackPausedRef = useRef(false);
  const prevYearRef = useRef(currentYear);

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

    // ── Auto-track arming ──────────────────────────────────────────────────────
    // A change in currentYear means the user moved the scrubber, so re-arm the
    // tracking camera (the only thing that pauses it is a manual pan/zoom).
    const yearChanged = currentYear !== prevYearRef.current;
    if (yearChanged) {
      autoTrackPausedRef.current = false;
      prevYearRef.current = currentYear;
    }
    const shouldTrack = viewMode === 'timeline' && !autoTrackPausedRef.current;

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
      const LEAF_SPACING = 34;
      // Minimum visual gap between any two nodes (one-third of leaf spacing).
      const MIN_GAP = LEAF_SPACING / 3;
      let leafIdx = 0;

      const grownKids = (node: d3.HierarchyPointNode<Language>) =>
        (node.children ?? []).filter(c => grownSet.has(c.data.id));

      function assignY(node: d3.HierarchyPointNode<Language>): void {
        if (node.data.id === VIRTUAL_ROOT_ID) {
          grownKids(node).forEach(c => assignY(c));
          return;
        }
        const kids = grownKids(node);
        if (kids.length === 0) {
          // Grown leaf (so far): take the next sequential slot.
          timelineY.set(node.data.id, leafIdx * LEAF_SPACING);
          leafIdx++;
          return;
        }
        kids.forEach(c => assignY(c));
        const childYs = kids.map(c => timelineY.get(c.data.id)!);
        const mid = (Math.min(...childYs) + Math.max(...childYs)) / 2;

        // With an odd number of equally-spaced leaves the midpoint lands exactly
        // on the middle leaf, and ancestor chains all collapse to the same y.
        // Walk outward from the ideal midpoint in alternating directions until
        // we find a position that is at least MIN_GAP from every placed node.
        const placed = [...timelineY.values()];
        let y = mid;
        for (let step = 1; step <= 12 && placed.some(v => Math.abs(v - y) < MIN_GAP); step++) {
          const sign = step % 2 === 0 ? 1 : -1;
          y = mid + sign * Math.ceil(step / 2) * MIN_GAP;
        }
        timelineY.set(node.data.id, y);
      }
      assignY(root);
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
        .on('zoom', event => {
          transformRef.current = event.transform;
          gRef.current?.attr('transform', event.transform);
          // sourceEvent is set only for genuine user gestures (drag/wheel/pinch);
          // programmatic transitions leave it null. A real gesture pauses tracking.
          if (event.sourceEvent) autoTrackPausedRef.current = true;
        });
      svg.call(zoomRef.current);
    }

    // Keep the zoom hit-target covering the whole viewport (default d3 zoom
    // filter already handles wheel zoom and ctrl-wheel trackpad pinch).
    svg.select<SVGRectElement>('rect.zoom-bg')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height);

    const g = gRef.current;

    // Single shared transition instance — the camera pan and the node vertical
    // re-layout are scheduled on it together so the diagonal motion is cohesive.
    const trans = d3.transition().duration(TRANSITION_MS).ease(d3.easeQuadInOut);

    // ── Camera: fit on first render, else auto-track the growth front ──────────
    if (!fittedRef.current && zoomRef.current && renderNodes.length) {
      let tx: number, ty: number, scale: number;

      if (viewMode === 'timeline') {
        const yVals = renderNodes.map(d => timelineY.get(d.data.id) ?? 0);
        const minBX = Math.min(...yVals);
        const maxBX = Math.max(...yVals);
        scale = Math.min(0.9, dimensions.height / ((maxBX - minBX) + 120));
        // Center the growth front horizontally right from the first paint.
        tx = dimensions.width / 2 - yearScale!(currentYear) * scale;
        ty = dimensions.height / 2 - ((minBX + maxBX) / 2) * scale;
      } else {
        const xs = renderNodes.map(d => d.x);
        const ys = renderNodes.map(d => d.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        scale = Math.min(0.9, Math.min(
          dimensions.width  / ((maxY - minY) + 400),
          dimensions.height / ((maxX - minX) + 80)
        ));
        tx = 120;
        ty = dimensions.height / 2 - ((minX + maxX) / 2) * scale;
      }

      svg.call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      fittedRef.current = true;
    } else if (yearScale && shouldTrack && zoomRef.current && renderNodes.length) {
      // Auto-tracking camera: keep the current zoom level but pan so the growth
      // front stays centered horizontally and the grown subtree stays centered
      // vertically. Driven through the shared transition so it moves in lockstep
      // with the nodes' vertical re-layout below.
      const k = transformRef.current.k;
      const vYs = renderNodes.map(d => timelineY.get(d.data.id) ?? 0);
      const midV = (Math.min(...vYs) + Math.max(...vYs)) / 2;
      const tx = dimensions.width / 2 - yearScale(currentYear) * k;
      const ty = dimensions.height / 2 - midV * k;
      svg.transition(trans).call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
    } else {
      g.attr('transform', transformRef.current);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    const isSel   = (d: d3.HierarchyPointNode<Language>) => d.data.id === selectedId;
    const isRoot  = (d: d3.HierarchyPointNode<Language>) => d.data.parentLanguageId === VIRTUAL_ROOT_ID;
    const hasCh   = (d: d3.HierarchyPointNode<Language>) => (childrenMap.get(d.data.id)?.length ?? 0) > 0;
    const isExp   = (d: d3.HierarchyPointNode<Language>) => expandedIds.has(d.data.id);
    const r       = (d: d3.HierarchyPointNode<Language>) => isSel(d) ? 9 : isRoot(d) ? 7 : hasCh(d) ? 6 : 4;

    // ── Timeline axis ─────────────────────────────────────────────────────────
    g.selectAll<SVGGElement, unknown>('g.timeline-axis').remove();
    if (yearScale) {
      const grownSlots = renderNodes.map(n => timelineY.get(n.data.id) ?? 0);
      const axisMaxX = grownSlots.length ? Math.max(...grownSlots) : 0;
      const axisLineY = axisMaxX + 50;

      const axisG = g.append('g').attr('class', 'timeline-axis');
      const tickYears = [-5000, -4000, -3000, -2000, -1000, 0, 500, 1000, 1500, 2000];

      axisG.append('line')
        .attr('x1', yearScale(-5000)).attr('x2', yearScale(2100))
        .attr('y1', axisLineY).attr('y2', axisLineY)
        .attr('stroke', 'rgba(197,160,89,0.25)').attr('stroke-width', 1);

      for (const yr of tickYears) {
        const px = yearScale(yr);
        axisG.append('line')
          .attr('x1', px).attr('x2', px)
          .attr('y1', axisLineY - 4).attr('y2', axisLineY + 4)
          .attr('stroke', 'rgba(197,160,89,0.4)').attr('stroke-width', 1);
        axisG.append('text')
          .attr('x', px).attr('y', axisLineY + 16)
          .attr('text-anchor', 'middle')
          .style('font-size', '9px').style('font-family', 'monospace')
          .style('fill', 'rgba(197,160,89,0.5)')
          .text(yr < 0 ? `${Math.abs(yr)} BCE` : yr === 0 ? '0 CE' : `${yr} CE`);
      }

      // Growth front — vertical marker at the scrubber's current year. Rendered
      // inside the zoom group so it stays pixel-aligned with the nodes.
      const frontX = yearScale(currentYear);
      const frontTop = (grownSlots.length ? Math.min(...grownSlots) : 0) - 30;
      axisG.append('line')
        .attr('x1', frontX).attr('x2', frontX)
        .attr('y1', frontTop).attr('y2', axisLineY)
        .attr('stroke', 'rgba(197,160,89,0.10)').attr('stroke-width', 10);
      axisG.append('line')
        .attr('x1', frontX).attr('x2', frontX)
        .attr('y1', frontTop).attr('y2', axisLineY)
        .attr('stroke', 'rgba(197,160,89,0.55)').attr('stroke-width', 1.5);
    }

    // ── Links — enter / update / exit ─────────────────────────────────────────
    const linkPathFn = (d: d3.HierarchyPointLink<Language>) => {
      const sp = getPos(d.source as d3.HierarchyPointNode<Language>);
      const tp = getPos(d.target as d3.HierarchyPointNode<Language>);
      if (yearScale) {
        // Orthogonal elbow: branch point at the parent's year (vertical segment),
        // then a horizontal segment out to the child. Crossing-free because each
        // node owns a unique slot and subtrees occupy disjoint slot-bands.
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
      .style('opacity', 1)
      .attr('fill', 'none')
      .attr('d', linkPathFn)
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

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ background: '#0a0a0a' }}>
      <svg ref={svgRef} className="w-full h-full" />

      {/* Floating zoom controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-px bg-onyx/80 backdrop-blur-sm border border-gold/20 rounded-sm overflow-hidden">
        <button
          onClick={handleZoomIn}
          title="Zoom in"
          className="p-2 text-gold/60 hover:text-gold hover:bg-white/5 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="h-px bg-gold/15" />
        <button
          onClick={handleZoomOut}
          title="Zoom out"
          className="p-2 text-gold/60 hover:text-gold hover:bg-white/5 transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <div className="h-px bg-gold/15" />
        <button
          onClick={handleResetView}
          title="Reset view"
          className="p-2 text-gold/60 hover:text-gold hover:bg-white/5 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {visibleLanguages.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gold/40 uppercase tracking-[0.3em] font-mono text-xs">
          Accessing Genealogical Records…
        </div>
      )}
      <div className="absolute bottom-4 right-4 text-[9px] text-gold/30 font-mono uppercase tracking-widest">
        {viewMode === 'timeline'
          ? 'Scroll / pinch to zoom · Drag to pan · Scrubber auto-tracks growth'
          : 'Scroll / pinch to zoom · Drag to pan · Click node to expand / collapse'}
      </div>
    </div>
  );
};
