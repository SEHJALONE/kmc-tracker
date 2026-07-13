"""
Exports a document's geometry to a browser-viewable format.

OBJ is the target: it's natively supported by FreeCAD's Mesh module
(verified working headless) and by the app's existing Online3DViewer
component, so no extra conversion step is needed before a worker can view
the model.

GLB/glTF is not yet wired up: FreeCAD 1.1 doesn't ship a console-importable
glTF exporter module (only the OpenCASCADE RWGltf bindings, which need a
full XCAF document assembled by hand). Add it here if GLB is ever needed
(smaller files, embedded materials) - OBJ works today and is enough to
prove the pipeline.
"""
import Mesh


def export_obj(leaves, output_path, tessellation_tolerance=0.1):
    """Tessellate every leaf part's shape into one combined mesh and write
    it to output_path (.obj)."""
    mesh = Mesh.Mesh()
    for leaf in leaves:
        shape = leaf["obj"].Shape
        mesh.addFacets(shape.tessellate(tessellation_tolerance))
    mesh.write(output_path)
    return output_path
