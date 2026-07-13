"""
Walks a FreeCAD document's object tree into a plain node structure.

Handles both shapes FreeCAD can produce from a STEP import:
  - Hierarchical: App::Part / assembly containers nested via .Group
  - Flat: a plain list of shape-bearing objects with no containers

A node is a dict: {"name": str, "label": str, "type_id": str,
"children": [node, ...], "obj": <FreeCAD object>}
"""

CONTAINER_TYPES = {"App::Part", "Assembly::AssemblyObject"}


def _has_real_shape(obj):
    return hasattr(obj, "Shape") and not obj.Shape.isNull()


def _make_node(obj):
    children = []
    if hasattr(obj, "Group"):
        children = [_make_node(child) for child in obj.Group]
    return {
        "name": obj.Name,
        "label": obj.Label,
        "type_id": obj.TypeId,
        "children": children,
        "obj": obj,
    }


def build_tree(doc):
    """Return a list of root nodes. Falls back to a flat list of every
    shape-bearing object if the document has no container hierarchy."""
    roots = list(doc.RootObjects)
    if roots:
        return [_make_node(r) for r in roots]
    return [_make_node(o) for o in doc.Objects if _has_real_shape(o)]


def flatten_leaves(nodes):
    """Depth-first walk returning every node that is a real shape (a
    part), skipping containers and non-shape housekeeping objects."""
    leaves = []
    for node in nodes:
        if node["children"]:
            leaves.extend(flatten_leaves(node["children"]))
        elif _has_real_shape(node["obj"]):
            leaves.append(node)
    return leaves
