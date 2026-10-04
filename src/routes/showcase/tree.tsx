import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * A left-to-right family tree: the ingredients on the left, joined by elbow
 * connectors into the thing they make on the right. Pure CSS (see `.sc-tree`
 * in showcase.css), so it re-skins with everything else and needs no layout pass.
 * Used for a species' breeding route and for the passive planner's lineage.
 */
export interface TNode {
  key: string;
  card: ReactNode;
  /** The parents that make this node; none for something you already own. */
  kids?: TNode[];
}

export function Tree({ root }: { root: TNode }) {
  const box = useRef<HTMLDivElement>(null);
  // The goal is on the right and the tree grows leftwards, so start scrolled to the
  // right end: the thing you asked for (and its parents) is what you see first.
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [root.key]);

  return (
    <div className="sc-tree-scroll" ref={box}>
      <TreeNode node={root} />
    </div>
  );
}

function TreeNode({ node }: { node: TNode }) {
  const kids = node.kids ?? [];
  return (
    <div className="sc-tree">
      {kids.length > 0 && (
        <div className="sc-tree-kids">
          {kids.map((k) => (
            <div className="sc-tree-kid" key={k.key}>
              <TreeNode node={k} />
            </div>
          ))}
        </div>
      )}
      <div className={`sc-tree-node${kids.length ? ' has-kids' : ''}`}>{node.card}</div>
    </div>
  );
}
