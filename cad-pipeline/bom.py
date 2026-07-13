"""
Builds a bill-of-materials from leaf nodes (see tree_walker.flatten_leaves).

FreeCAD auto-disambiguates duplicate Labels within a document by appending
a numeric suffix (e.g. two objects both labelled "Air Tank 20L" become
"Air Tank 20L" and "Air Tank 20L001"). That suffix must be stripped before
grouping identical parts to get an accurate qty count.
"""
import re

_DEDUP_SUFFIX = re.compile(r"0*\d+$")


def normalize_label(label):
    stripped = _DEDUP_SUFFIX.sub("", label).strip()
    return stripped or label


def extract_bom(leaves):
    """Group leaf parts by PartNumber (custom property, if present) or by
    normalized label, and count quantities. Returns a list of dicts shaped
    like the catalog's `parts` entries."""
    groups = {}
    order = []

    for leaf in leaves:
        obj = leaf["obj"]
        part_no = getattr(obj, "PartNumber", "") if hasattr(obj, "PartNumber") else ""
        description = normalize_label(leaf["label"])
        key = part_no or description

        if key not in groups:
            groups[key] = {
                "partNo": part_no,
                "description": description,
                "qty": 0,
                "unit": "ea",
                "consumable": False,
            }
            order.append(key)
        groups[key]["qty"] += 1

    return [groups[key] for key in order]
