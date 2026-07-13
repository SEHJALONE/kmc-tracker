"""
Format registry for the CAD pipeline.

STEP is the official deliverable format from the design team, so it's the
only entry today. To add a new source format later (IGES, native FCStd,
DWG-via-ODA-DXF-bridge, etc.), write a loader function with the same
signature and add one line to FORMAT_LOADERS.
"""
import os
import FreeCAD as App
import Import

# NOTE: the legacy `Part` module's STEP importer/exporter is deprecated and
# flattens everything into merged compound shapes with generic OpenCASCADE
# labels, losing both assembly hierarchy and part names. `Import` (no Gui
# suffix - that one needs a display and fails headless) is the modern
# XCAF-based module: verified to preserve nested App::Part hierarchy and
# original part Labels round-trip.


def load_step(path):
    """Import a STEP file into a new document and return it."""
    doc_name = os.path.splitext(os.path.basename(path))[0]
    doc = App.newDocument(doc_name)
    Import.insert(path, doc.Name)
    doc.recompute()
    return doc


FORMAT_LOADERS = {
    ".step": load_step,
    ".stp": load_step,
}


def load_document(path):
    ext = os.path.splitext(path)[1].lower()
    loader = FORMAT_LOADERS.get(ext)
    if loader is None:
        supported = ", ".join(sorted(FORMAT_LOADERS))
        raise ValueError(f"Unsupported CAD format '{ext}'. Supported: {supported}")
    return loader(path)
