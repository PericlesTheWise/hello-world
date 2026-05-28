import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Language } from '../types';

interface Props {
  languages: Language[];
  onSelect: (lang: Language) => void;
  selectedId?: string;
  fontSize?: number;
  viewMode?: 'tree' | 'timeline';
}

const VIRTUAL_ROOT_ID = '__world_root__';
const TRANSITION_MS = 280;

function parseEarliestYear(approxDate?: string): number | null {
  if (!approxDate) return null;
  const s = approxDate.replace(/,/g, '').replace(/\+/g, '');
  const numbers = s.match(/(\d+)/g);
  if (!numbers) return null;
  const isBCE = /BCE/i.test(s);
  const values = numbers.map(n => isBCE ? -parseInt(n) : parseInt(n));
  return isBCE ? Math.min(...values) : Math.min(...values);
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

export const LanguageTree: React.FC<Props> = ({ languages, onSelect, selectedId, fontSize = 11, viewMode = 'tree' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const fittedRef = useRef(false);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
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
      const spacing = Math.max(20, Math.min(28, Math.floor(dimensions.height / Math.max(leafCount, 1))));
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
      ? d3.scaleLinear().domain([-5000, 2100]).range([80, dimensions.width - 200]).clamp(true)
      : null;

    // Assign each family a non-overlapping vertical band so lines from different
    // families can never cross each other in timeline mode.
    const nodeToFamilyId = new Map<string, string>();
    const familyBandMap = new Map<string, { start: number; height: number; xMin: number; xMax: number }>();

    if (yearScale) {
      const familyXRange = new Map<string, { xMin: number; xMax: number }>();
      const familyEarliestYear = new Map<string, number>();

      for (const node of allNodes) {
        let cur: d3.HierarchyPointNode<Language> | null = node;
        while (cur.parent && cur.parent.data.id !== VIRTUAL_ROOT_ID) {
          cur = cur.parent;
        }
        const fid = cur.data.id;
        nodeToFamilyId.set(node.data.id, fid);

        const range = familyXRange.get(fid) ?? { xMin: Infinity, xMax: -Infinity };
        range.xMin = Math.min(range.xMin, node.x);
        range.xMax = Math.max(range.xMax, node.x);
        familyXRange.set(fid, range);

        const yr = parseEarliestYear(node.data.approxDate);
        if (yr !== null) {
          const existing = familyEarliestYear.get(fid);
          if (existing === undefined || yr < existing) familyEarliestYear.set(fid, yr);
        }
      }

      const sortedFamilies = [...familyXRange.keys()].sort(
        (a, b) => (familyEarliestYear.get(a) ?? 0) - (familyEarliestYear.get(b) ?? 0)
      );

      const bandGap = 30;
      let curY = 0;
      for (const fid of sortedFamilies) {
        const range = familyXRange.get(fid)!;
        const spread = range.xMax - range.xMin;
        familyBandMap.set(fid, { start: curY, height: spread, xMin: range.xMin, xMax: range.xMax });
        curY += spread + bandGap;
      }
    }

    const getPos = (d: d3.HierarchyPointNode<Language>) => {
      if (yearScale) {
        const year = parseEarliestYear(d.data.approxDate);
        const px = year != null ? yearScale(year) : yearScale(-3000);

        const fid = nodeToFamilyId.get(d.data.id);
        const band = fid ? familyBandMap.get(fid) : undefined;
        if (band) {
          const spread = band.xMax - band.xMin;
          const py = spread === 0
            ? band.start
            : band.start + ((d.x - band.xMin) / spread) * band.height;
          return { x: py, y: px };
        }
        return { x: d.x, y: px };
      }
      return { x: d.x, y: d.y };
    };

    // ── SVG / zoom init ───────────────────────────────────────────────────────
    const svg = d3.select(svgRef.current);

    if (!gRef.current) {
      gRef.current = svg.append('g').attr('class', 'tree-root');
      zoomRef.current = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.05, 3])
        .on('zoom', event => {
          transformRef.current = event.transform;
          gRef.current?.attr('transform', event.transform);
        });
      svg.call(zoomRef.current);
    } else {
      if (zoomRef.current) svg.call(zoomRef.current);
    }

    // ── Wheel behaviour: horizontal scroll in timeline, zoom in tree ──────────
    if (viewMode === 'timeline' && zoomRef.current) {
      // Block D3 zoom from consuming wheel events so our handler can drive panning.
      zoomRef.current.filter(event => event.type !== 'wheel' && !event.button);
      svg.on('wheel.hscroll', (event: WheelEvent) => {
        event.preventDefault();
        // Use whichever axis has more movement (supports both trackpad swipe and scroll wheel).
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        const cur = transformRef.current;
        const next = d3.zoomIdentity.translate(cur.x - delta * 0.8, cur.y).scale(cur.k);
        if (zoomRef.current) svg.call(zoomRef.current.transform, next);
      }, { passive: false } as AddEventListenerOptions);
    } else if (zoomRef.current) {
      zoomRef.current.filter(event => !event.button);
      svg.on('wheel.hscroll', null);
    }

    const g = gRef.current;

    // ── Fit to view — only on first data render (or mode change) ─────────────
    if (!fittedRef.current && zoomRef.current) {
      const all = root.descendants().filter(d => d.data.id !== VIRTUAL_ROOT_ID);
      let tx: number, ty: number, scale: number;

      if (viewMode === 'timeline') {
        const bandedXs = all.map(d => getPos(d).x);
        const minBX = Math.min(...bandedXs);
        const maxBX = Math.max(...bandedXs);
        scale = Math.min(0.9, dimensions.height / ((maxBX - minBX) + 120));
        tx = 0;
        ty = dimensions.height / 2 - ((minBX + maxBX) / 2) * scale;
      } else {
        const xs = all.map(d => d.x);
        const ys = all.map(d => d.y);
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
    } else {
      g.attr('transform', transformRef.current);
    }

    const trans = d3.transition().duration(TRANSITION_MS).ease(d3.easeQuadInOut);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const isSel   = (d: d3.HierarchyPointNode<Language>) => d.data.id === selectedId;
    const isRoot  = (d: d3.HierarchyPointNode<Language>) => d.data.parentLanguageId === VIRTUAL_ROOT_ID;
    const hasCh   = (d: d3.HierarchyPointNode<Language>) => (childrenMap.get(d.data.id)?.length ?? 0) > 0;
    const isExp   = (d: d3.HierarchyPointNode<Language>) => expandedIds.has(d.data.id);
    const r       = (d: d3.HierarchyPointNode<Language>) => isSel(d) ? 9 : isRoot(d) ? 7 : hasCh(d) ? 6 : 4;

    // ── Timeline axis ─────────────────────────────────────────────────────────
    g.selectAll<SVGGElement, unknown>('g.timeline-axis').remove();
    if (yearScale) {
      const axisMaxX = allNodes.reduce((acc, node) => Math.max(acc, getPos(node).x), -Infinity);
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

    const linkData = root.links().filter(l => l.source.data.id !== VIRTUAL_ROOT_ID);
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
      .data(allNodes, d => d.data.id);

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

    const applyLabel = (sel: d3.Selection<SVGTextElement, d3.HierarchyPointNode<Language>, SVGGElement, unknown>) =>
      sel
        .attr('dy', '0.31em')
        .attr('x', d => d.children ? -(r(d) + 6) : (r(d) + 6))
        .attr('text-anchor', d => d.children ? 'end' : 'start')
        .text(d => d.data.name)
        .style('font-size', d => isRoot(d) ? `${fontSize + 2}px` : `${fontSize}px`);

    applyLabel(nodeAll.select<SVGTextElement>('.lbl-bg'));
    applyLabel(nodeAll.select<SVGTextElement>('.lbl-fg'))
      .style('fill', d => isSel(d) ? '#c5a059' : isRoot(d) ? '#d4bc8a' : '#e0d8cc')
      .style('opacity', d => isSel(d) ? 1 : 0.85);

    return () => {
      if (svgRef.current) d3.select(svgRef.current).on('wheel.hscroll', null);
    };
  }, [visibleLanguages, expandedIds, dimensions, selectedId, fontSize, childrenMap, viewMode]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ background: '#0a0a0a' }}>
      <svg ref={svgRef} className="w-full h-full" />
      {visibleLanguages.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gold/40 uppercase tracking-[0.3em] font-mono text-xs">
          Accessing Genealogical Records…
        </div>
      )}
      <div className="absolute bottom-4 right-4 text-[9px] text-gold/30 font-mono uppercase tracking-widest">
        {viewMode === 'timeline'
          ? 'Scroll to pan · Drag to pan · Click node to expand / collapse'
          : 'Scroll to zoom · Drag to pan · Click node to expand / collapse'}
      </div>
    </div>
  );
};
