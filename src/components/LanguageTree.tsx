import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Language } from '../types';

interface Props {
  languages: Language[];
  onSelect: (lang: Language) => void;
  selectedId?: string;
  fontSize?: number;
}

const VIRTUAL_ROOT_ID = '__world_root__';

export const LanguageTree: React.FC<Props> = ({ languages, onSelect, selectedId, fontSize = 11 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || languages.length === 0) return;

    // Add virtual root so multiple language families can coexist in one tree
    const virtualRoot: Language = {
      id: VIRTUAL_ROOT_ID,
      name: 'World Languages',
      parentLanguageId: null,
      family: 'Root',
    };

    const withVirtualRoot = languages.map(l => ({
      ...l,
      parentLanguageId: l.parentLanguageId === null ? VIRTUAL_ROOT_ID : l.parentLanguageId,
    }));
    withVirtualRoot.unshift(virtualRoot);

    const stratify = d3.stratify<Language>()
      .id(d => d.id)
      .parentId(d => d.parentLanguageId ?? null);

    let root: d3.HierarchyPointNode<Language>;
    try {
      const hierarchy = stratify(withVirtualRoot);
      const nodeCount = hierarchy.leaves().length;
      const minSpacing = Math.max(20, Math.min(28, Math.floor(dimensions.height / Math.max(nodeCount, 1))));
      const treeLayout = d3.tree<Language>()
        .nodeSize([minSpacing, 220])
        .separation((a, b) => (a.parent === b.parent ? 1 : 1.4));
      root = treeLayout(hierarchy) as d3.HierarchyPointNode<Language>;
    } catch (e) {
      console.error('Tree layout error:', e);
      return;
    }

    // Compute fit-to-view transform
    const allNodes = root.descendants().filter(d => d.data.id !== VIRTUAL_ROOT_ID);
    const xs = allNodes.map(d => d.x);
    const ys = allNodes.map(d => d.y);
    const minX = xs.reduce((a, b) => Math.min(a, b), Infinity);
    const maxX = xs.reduce((a, b) => Math.max(a, b), -Infinity);
    const minY = ys.reduce((a, b) => Math.min(a, b), Infinity);
    const maxY = ys.reduce((a, b) => Math.max(a, b), -Infinity);
    const treeW = (maxY - minY) + 400;
    const treeH = (maxX - minX) + 80;
    const scale = Math.min(0.9, Math.min(dimensions.width / treeW, dimensions.height / treeH));
    const tx = 120;
    const ty = dimensions.height / 2 - ((minX + maxX) / 2) * scale;
    const initialTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Create g first so zoom handler can reference it
    const g = svg.append('g');

    // Zoom/pan — apply initial transform after g exists
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 3])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);
    svg.call(zoom.transform, initialTransform);

    // Links
    g.selectAll('.link')
      .data(root.links().filter(l => l.source.data.id !== VIRTUAL_ROOT_ID))
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d3.linkHorizontal<d3.HierarchyPointLink<Language>, d3.HierarchyPointNode<Language>>()
        .x(d => d.y)
        .y(d => d.x))
      .attr('fill', 'none')
      .attr('stroke', d => {
        const isAncestorOfSelected = isAncestor(d.source, selectedId) || isAncestor(d.target, selectedId);
        return isAncestorOfSelected ? 'rgba(197,160,89,0.7)' : 'rgba(197,160,89,0.18)';
      })
      .attr('stroke-width', d => {
        const isAncestorOfSelected = isAncestor(d.source, selectedId) || isAncestor(d.target, selectedId);
        return isAncestorOfSelected ? 2 : 1;
      });

    // Nodes (skip virtual root)
    const nodes = g.selectAll('.node')
      .data(root.descendants().filter(d => d.data.id !== VIRTUAL_ROOT_ID))
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .on('click', (_event, d) => onSelect(d.data))
      .style('cursor', 'pointer');

    const isSelected = (d: d3.HierarchyPointNode<Language>) => d.data.id === selectedId;
    const isRoot = (d: d3.HierarchyPointNode<Language>) => d.data.parentLanguageId === VIRTUAL_ROOT_ID;

    // Outer glow ring for roots
    nodes.filter(isRoot)
      .append('circle')
      .attr('r', 14)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(197,160,89,0.15)')
      .attr('stroke-width', 8);

    nodes.append('circle')
      .attr('r', d => isSelected(d) ? 9 : isRoot(d) ? 7 : 4.5)
      .attr('fill', d => isSelected(d) ? '#c5a059' : isRoot(d) ? '#1a1308' : '#0a0a0a')
      .attr('stroke', '#c5a059')
      .attr('stroke-width', d => isSelected(d) ? 3 : isRoot(d) ? 2 : 1.2)
      .style('filter', d => isSelected(d) ? 'drop-shadow(0 0 8px rgba(197,160,89,0.8))' : isRoot(d) ? 'drop-shadow(0 0 4px rgba(197,160,89,0.3))' : 'none');

    // Text with background stroke for readability
    nodes.append('text')
      .attr('dy', '0.31em')
      .attr('x', d => (d.children ? -14 : 14))
      .attr('text-anchor', d => (d.children ? 'end' : 'start'))
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

  }, [languages, dimensions, selectedId, onSelect, fontSize]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ background: '#0a0a0a' }}>
      <svg ref={svgRef} className="w-full h-full" />
      {languages.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gold/40 uppercase tracking-[0.3em] font-mono text-xs">
          Accessing Genealogical Records…
        </div>
      )}
      <div className="absolute bottom-4 right-4 text-[9px] text-gold/30 font-mono uppercase tracking-widest">
        Scroll to zoom · Drag to pan · Click to explore
      </div>
    </div>
  );
};

function isAncestor(node: d3.HierarchyPointNode<Language>, selectedId?: string): boolean {
  if (!selectedId) return false;
  let current: d3.HierarchyPointNode<Language> | null = node;
  while (current) {
    if (current.data.id === selectedId) return true;
    current = current.parent;
  }
  return false;
}
