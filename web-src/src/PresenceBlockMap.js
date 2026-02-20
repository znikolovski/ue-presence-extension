/*
 * <license header>
 */

import React, { useState, useMemo, useEffect } from 'react';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import Image from '@spectrum-icons/workflow/Image';
import TextSize from '@spectrum-icons/workflow/TextSize';
import Folder from '@spectrum-icons/workflow/Folder';
import Edit from '@spectrum-icons/workflow/Edit';
import FileTemplate from '@spectrum-icons/workflow/FileTemplate';
import More from '@spectrum-icons/workflow/More';

/**
 * Extract path from editable resource (e.g. urn:aemconnection:/content/.../root/main).
 * Returns the path segment used to infer hierarchy.
 */
function getPathFromResource(resource) {
  if (!resource || typeof resource !== 'string') return '';
  const match = resource.match(/^urn:[^:]+:(.+)$/);
  return match ? match[1] : resource;
}

/**
 * Find the editable whose path is the longest strict prefix of the given path.
 * Handles jcr:content and other intermediate segments (e.g. title under card).
 */
function findParentByPath(path, byPath) {
  if (!path || path === '/') return null;
  let candidate = path;
  while (candidate) {
    const slash = candidate.lastIndexOf('/');
    candidate = slash > 0 ? candidate.slice(0, slash) : '';
    if (candidate && byPath.has(candidate)) return byPath.get(candidate);
  }
  return null;
}

/**
 * Try to get a path from an orphan id. Orphan ids can be:
 * - URN: urn:aemconnection:/content/.../card/jcr:content/title
 * - Raw path: /content/.../card/jcr:content/title
 */
function getPathFromOrphanId(orphanId) {
  if (!orphanId || typeof orphanId !== 'string') return '';
  const fromUrn = getPathFromResource(orphanId);
  if (fromUrn) return fromUrn;
  if (orphanId.startsWith('/')) return orphanId;
  return '';
}

/**
 * For an orphan id (property/field under a block), find parent. Tries:
 * 1. Path-based: if orphan id is/contains a path, find editable whose resource path is the longest prefix
 * 2. Id prefix: ids like "{parentId}_field" or "{parentId}-title"
 */
function findParentForOrphan(orphanId, knownIds, byPath) {
  const orphanPath = getPathFromOrphanId(orphanId);
  if (orphanPath) {
    const parentId = findParentByPath(orphanPath, byPath);
    if (parentId) return parentId;
  }
  let bestParent = null;
  let bestLen = 0;
  for (const parentId of knownIds) {
    if (parentId.length >= orphanId.length) continue;
    const sep = orphanId[parentId.length];
    if ((sep === '_' || sep === '-' || sep === '.' || sep === '/') &&
        orphanId.startsWith(parentId) &&
        parentId.length > bestLen) {
      bestParent = parentId;
      bestLen = parentId.length;
    }
  }
  return bestParent;
}

/**
 * Build a tree from flat editables + presence orphans. Orphans are properties/fields
 * under blocks (e.g. text under card). Attach them under parent by id prefix when possible.
 */
function buildEditableTree(editables, presence) {
  const byId = new Map();
  const byPath = new Map();

  for (const e of editables) {
    const path = getPathFromResource(e.resource);
    byId.set(e.id, { ...e, path, children: [], _path: path, _orphan: false });
    if (path) byPath.set(path, e.id);
  }

  const roots = [];

  for (const e of editables) {
    const node = byId.get(e.id);
    const explicitParent = e.parentId ?? e.parent;
    if (explicitParent && byId.has(explicitParent)) {
      byId.get(explicitParent).children.push(node);
      continue;
    }
    const path = getPathFromResource(e.resource);
    if (!path || path === '/') {
      roots.push(node);
      continue;
    }
    const parentId = findParentByPath(path, byPath);
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  const blocksWithPresence = new Set(
    presence.filter((p) => p.editable_id).map((p) => p.editable_id)
  );
  const orphanIds = [...blocksWithPresence].filter((id) => !byId.has(id));
  const knownIds = [...byId.keys()];
  const debug = typeof window !== 'undefined' && /[?&]debug=presence/.test(window.location.search);

  for (const eid of orphanIds) {
    const orphanNode = {
      id: eid,
      path: '',
      children: [],
      _path: '',
      _orphan: true,
      type: 'text',
    };
    const parentId = findParentForOrphan(eid, knownIds, byPath);
    if (debug) {
      const orphanPath = getPathFromOrphanId(eid);
      console.log('[PresenceBlockMap] orphan:', {
        id: eid,
        extractedPath: orphanPath || '(none)',
        parentId: parentId || '(root)',
        knownPaths: [...byPath.keys()].slice(0, 5),
        knownIds: knownIds.slice(0, 5),
      });
    }
    if (parentId && byId.has(parentId)) {
      const orphanPath = getPathFromOrphanId(eid);
      orphanNode._propertyHint = orphanPath
        ? orphanPath.split('/').filter(Boolean).pop()
        : eid.startsWith(parentId) ? eid.slice(parentId.length + 1) : null;
      byId.get(parentId).children.push(orphanNode);
    } else {
      roots.push(orphanNode);
    }
  }

  roots.sort((a, b) => {
    const pa = a._path || '';
    const pb = b._path || '';
    return pa.localeCompare(pb);
  });

  const sortChildren = (nodes) => {
    for (const n of nodes) {
      if (n.children?.length) sortChildren(n.children);
    }
    nodes.sort((a, b) => (a._path || a.id || '').localeCompare(b._path || b.id || ''));
  };
  sortChildren(roots);

  return roots;
}

/**
 * Visual block map styled like the Content tree view:
 * nested hierarchy, type icons, expand/collapse, selected state with blue left border.
 */
function PresenceBlockMap({
  editables = [],
  presence = [],
  selectedEditableIds = new Set(),
  highlightedIds = new Set(),
  onSelectEditable,
}) {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [hasInitializedExpand, setHasInitializedExpand] = useState(false);

  useEffect(() => {
    if (tree.length > 0 && !hasInitializedExpand) {
      const collectExpandable = (nodes, acc = new Set()) => {
        for (const n of nodes) {
          if (n.children?.length) {
            acc.add(n.id);
            collectExpandable(n.children, acc);
          }
        }
        return acc;
      };
      setExpandedIds(collectExpandable(tree));
      setHasInitializedExpand(true);
    } else if (tree.length === 0) {
      setHasInitializedExpand(false);
    }
  }, [tree, hasInitializedExpand]);
  const presenceByEditable = useMemo(() => {
    const out = {};
    for (const p of presence) {
      const eid = p.editable_id || '__none__';
      if (!out[eid]) out[eid] = [];
      out[eid].push(p);
    }
    return out;
  }, [presence]);

  const tree = useMemo(
    () => buildEditableTree(editables, presence),
    [editables, presence]
  );

  const getIconForType = (type, resource) => {
    const t = (type || '').toLowerCase();
    const r = (resource || '').toLowerCase();
    if (t.includes('image') || r.includes('image')) return Image;
    if (t.includes('text') || t === 'string') return TextSize;
    if (t.includes('fragment') || r.includes('fragment')) return FileTemplate;
    if (t.includes('reference') || t.includes('container')) return Folder;
    return Edit;
  };

  const labelForNode = (node) => {
    if (node._orphan) {
      if (node._propertyHint) return node._propertyHint;
      return `block ${node.id.substring(0, 8)}…`;
    }
    if (node.label) return node.label;
    const type = node.type || 'block';
    const short = node.id?.substring(0, 8) || '?';
    return `${type} ${short}…`;
  };

  const toggleExpand = (eid) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid);
      else next.add(eid);
      return next;
    });
  };

  if (tree.length === 0) {
    return (
      <p className="PresenceBlockMap-empty">
        No blocks available. Select a page in the editor.
      </p>
    );
  }

  const renderNode = (node, depth = 0) => {
    const eid = node.id;
    const users = presenceByEditable[eid] || [];
    const label = labelForNode(node);
    const isSelected = selectedEditableIds.has(eid);
    const hasHighlight = users.some((u) => highlightedIds.has(u.user_id));
    const hasChildren = node.children?.length > 0;
    const isExpanded = expandedIds.has(eid);
    const IconComponent = node._orphan ? Edit : getIconForType(node.type, node.resource);

    return (
      <div key={eid} className="PresenceBlockMap-node">
        <div
          className={`PresenceBlockMap-row ${isSelected ? 'PresenceBlockMap-row--selected' : ''} ${hasHighlight ? 'PresenceBlockMap-row--highlighted' : ''}`}
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={hasChildren ? isExpanded : undefined}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <div className="PresenceBlockMap-rowInner" onClick={() => onSelectEditable?.(eid)}>
            <span
              className="PresenceBlockMap-chevron"
              aria-hidden
              onClick={(e) => {
                if (hasChildren) {
                  e.stopPropagation();
                  toggleExpand(eid);
                }
              }}
              style={{ cursor: hasChildren ? 'pointer' : 'default', opacity: hasChildren ? 1 : 0.3 }}
            >
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown size="XS" />
                ) : (
                  <ChevronRight size="XS" />
                )
              ) : (
                <ChevronDown size="XS" />
              )}
            </span>
            <span className="PresenceBlockMap-icon" aria-hidden>
              <IconComponent size="S" />
            </span>
            <span className="PresenceBlockMap-label">{label}</span>
            {users.length > 0 && (
              <span className="PresenceBlockMap-users">
                {users.map((u) => (
                  <span
                    key={`${u.user_id}-${u.editable_id}`}
                    className="PresenceBlockMap-userDot"
                    style={{ backgroundColor: u.color }}
                    title={u.user_id}
                    aria-hidden
                  />
                ))}
                <span className="PresenceBlockMap-userNames">
                  {users.map((u) => u.user_id).join(', ')}
                </span>
              </span>
            )}
            <button
              type="button"
              className="PresenceBlockMap-moreBtn"
              aria-label={`Go to ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectEditable?.(eid);
              }}
            >
              <More size="S" aria-hidden />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="PresenceBlockMap-children" role="group">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="PresenceBlockMap ContentTree-style" role="tree" aria-label="Page blocks">
      <div className="PresenceBlockMap-tree">
        {tree.map((node) => renderNode(node))}
      </div>
    </div>
  );
}

export default PresenceBlockMap;
