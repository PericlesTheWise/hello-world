import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Language } from '../types';

interface Props {
  languages: Language[];
  onSelect: (lang: Language) => void;
  selectedId?: string;
  fontSize?: number;
}

const VIRTUAL_ROOT_ID = '__world_root__';

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

// For each family root, find the deepest chain and expand every node on it
function computeInitialExpanded(languages: Language[], childrenMap: Map<string, Language[]>): Set<string> {
  const roots = languages.filter(l => l.parentLanguageId === null);
  const expanded = new Set<string>();

  function deepestPath(id: string): string[] {
    const children = childrenMap.get(id) ?? [];
    if (children.length === 0) return [id];
    let best: string[] = [];
    for (const child of children) {
      const path = deepestPath(child.id);
      if (path.length > best.length) best = path;
    }
    return [id, ...best];
  }

  for (const root of roots) {
    const path = deepestPath(root.id);
    for (let i = 0; i < path.length - 1; i++) expanded.add(path[i]);
  }
  return expanded;
}

// Only include nodes whose parent is expanded (or whose parent is null = root)
function getVisibleLanguages(languages: Language[], expandedIds: Set<string>, childrenMap: Map<string, Language[]>): Language[] {
  const roots = languages.filter(l => l.parentLanguageId === null);
  const visible: Language[] = [...roots];
  const queue = [...roots.filter(l => expandedIds.has(l.id))];

  while (queue.length > 0) {
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

export const LanguageTree: React.FC<Props> = ({ languages, onSelect, selectedId, fontSize = 11 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const childrenMap = useMemo(() => buildChildrenMap(languages), [languages]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => computeInitialExpanded(languages, buildChildrenMap(languages))
  );

  // Reset when language dataset changes
  useEffect(() => {
    setExpandedIds(computeInitialExpanded(languages, childrenMap));
  }, [languages, childrenMap]);

  const visibleLanguages = useMemo(
    () => getVisibleLanguages(languages, expandedIds, childrenMap),
    [languages, expandedIds, childrenMap]
  );

  const handleNodeClick = useCallback((lang: Language) => {
    const hasChildren = (childrenMap.get(lang.id)?.length ?? 0) > 0;
    if (hasChildren) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        if (next.has(lang.id)) {
          // Collapse: remove this node and all its descendants from expanded set
          const toRemove = [lang.id];
          let i = 0;
          while (i < toRemove.length) {
            const id = toRemove[i++];
            for (const child of childrenMap.get(id) ?? []) toRemove.push(child.id);
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

  // Keep D3 click handler up-to-date without re-binding
  const handleNodeClickRef = useRef(handleNodeClick);
  useEffect(() => { handleNodeClickRef.current = handleNodeClick; }, [handleNodeClick]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || visibleLanguages.length === 0) return;

    const virtualRoot: Language = { id: VIRTUAL_ROOT_ID, name: 'World Languages', parentLanguageId: null, family: 'Root' };
    const withVirtualRoot = [
      virtualRoot,
      ...visibleLanguages.map(l => ({
        ...l,
        parentLanguageId: l.parentLanguageId === null ? VIRTUAL_ROOT_ID : l.parentLanguageId,
      })),
    ];

    const stratify = d3.stratify<Language>()
      .id(d => d.id)
      .parentId(d => d.parentLanguageId ?? null);

    let root: d3.HierarchyPointNode<Language>;
    try {
      const hierarchy = stratify(withVirtualRoot);
      const leafCount = hierarchy.leaves().length;
      const minSpacing = Math.max(20, Math.min(28, Math.floor(dimensions.height / Math.max(leafCount, 1))));
      root = d3.tree<Language>()
        .nodeSize([minSpacing, 220])
        .separation((a, b) => a.parent === b.parent ? 1 : 1.4)
        (hierarchy) as d3.HierarchyPointNode<Language>;
    } catch (e) {
      console.error('Tree layout error:', e);
      return;
    }

    // Fit to view
    const allNodes = root.descendants().filter(d => d.data.id !== VIRTUAL_ROOT_ID);
    const xs = allNodes.map(d => d.x);
    const ys = allNodes.map(d => d.y);
    const minX = xs.reduce((a, b) => Math.min(a, b), Infinity);
    const maxX = xs.reduce((a, b) => Math.max(a, b), -Infinity);
    const minY = ys.reduce((a, b) => Math.min(a, b), Infinity);
    const maxY = ys.reduce((a, b) => Math.max(a, b), -Infinity);
    const scale = Math.min(0.9, Math.min(
      dimensions.width / ((maxY - minY) + 400),
      dimensions.height / ((maxX - minX) + 80)
    ));
    const tx = 120;
    const ty = dimensions.height / 2 - ((minX + maxX) / 2) * scale;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 3])
      .on('zoom', event => g.attr('transform', event.transform));
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));

    // Links
    g.selectAll('.link')
      .data(root.links().filter(l => l.source.data.id !== VIRTUAL_ROOT_ID))
      .enter().append('path')
      .attr('class', 'link')
      .attr('d', d3.linkHorizontal<d3.HierarchyPointLink<Language>, d3.HierarchyPointNode<Language>>()
        .x(d => d.y).y(d => d.x))
      .attr('fill', 'none')
      .attr('stroke', d => {
        const hi = isAncestor(d.source, selectedId) || isAncestor(d.target, selectedId);
        return hi ? 'rgba(197,160,89,0.7)' : 'rgba(197,160,89,0.18)';
      })
      .attr('stroke-width', d => {
        const hi = isAncestor(d.source, selectedId) || isAncestor(d.target, selectedId);
        return hi ? 2 : 1;
      });

    const nodeData = root.descendants().filter(d => d.data.id !== VIRTUAL_ROOT_ID);

    const isSelected  = (d: d3.HierarchyPointNode<Language>) => d.data.id === selectedId;
    const isRoot      = (d: d3.HierarchyPointNode<Language>) => d.data.parentLanguageId === VIRTUAL_ROOT_ID;
    const hasChildren = (d: d3.HierarchyPointNode<Language>) => (childrenMap.get(d.data.id)?.length ?? 0) > 0;
    const isExp       = (d: d3.HierarchyPointNode<Language>) => expandedIds.has(d.data.id);

    const circleR = (d: d3.HierarchyPointNode<Language>) =>
      isSelected(d) ? 9 : isRoot(d) ? 7 : hasChildren(d) ? 6 : 4;

    // Nodes
    const nodes = g.selectAll('.node')
      .data(nodeData).enter().append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .on('click', (_e, d) => handleNodeClickRef.current(d.data))
      .style('cursor', d => hasChildren(d) ? 'pointer' : 'default');

    // Outer glow ring for family roots
    nodes.filter(isRoot).append('circle')
      .attr('r', 14).attr('fill', 'none')
      .attr('stroke', 'rgba(197,160,89,0.15)').attr('stroke-width', 8);

    // Main circle
    nodes.append('circle')
      .attr('r', circleR)
      .attr('fill', d => isSelected(d) ? '#c5a059' : isRoot(d) ? '#1a1308' : '#0a0a0a')
      .attr('stroke', '#c5a059')
      .attr('stroke-width', d => isSelected(d) ? 3 : isRoot(d) ? 2 : 1.2)
      .style('filter', d =>
        isSelected(d) ? 'drop-shadow(0 0 8px rgba(197,160,89,0.8))'
        : isRoot(d) ? 'drop-shadow(0 0 4px rgba(197,160,89,0.3))'
        : 'none'
      );

    // +/− inside nodes that have children
    nodes.filter(hasChildren).append('text')
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .text(d => isExp(d) ? '−' : '+')
      .style('font-size', d => `${circleR(d) * 1.4}px`)
      .style('font-family', 'monospace')
      .style('font-weight', 'bold')
      .style('fill', d => isSelected(d) ? '#0a0a0a' : '#c5a059')
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    // Labels (with background outline for readability)
    nodes.append('text')
      .attr('dy', '0.31em')
      .attr('x', d => d.children ? -(circleR(d) + 6) : (circleR(d) + 6))
      .attr('text-anchor', d => d.children ? 'end' : 'start')
      .text(d => d.data.name)
      .style('font-size', d => isRoot(d) ? `${fontSize + 2}px` : `${fontSize}px`)
      .style('font-family', '"Playfair Display", serif')
      .style('font-style', 'italic')
      .style('letter-spacing', '0.04em')
      .style('fill', d => isSelected(d) ? '#c5a059' : isRoot(d) ? '#d4bc8a' : '#e0d8cc')
      .style('opacity', d => isSelected(d) ? 1 : 0.85)
      .clone(true).lower()
      .attr('stroke', '#0a0a0a')
      .attr('stroke-width', 4)
      .attr('stroke-linejoin', 'round');

  }, [visibleLanguages, expandedIds, dimensions, selectedId, fontSize, childrenMap]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ background: '#0a0a0a' }}>
      <svg ref={svgRef} className="w-full h-full" />
      {visibleLanguages.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gold/40 uppercase tracking-[0.3em] font-mono text-xs">
          Accessing Genealogical Records…
        </div>
      )}
      <div className="absolute bottom-4 right-4 text-[9px] text-gold/30 font-mono uppercase tracking-widest">
        Scroll to zoom · Drag to pan · Click node to expand / collapse
      </div>
    </div>
  );
};
