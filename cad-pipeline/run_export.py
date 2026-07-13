"""
CAD pipeline entry point - run with FreeCAD's headless interpreter:

  freecadcmd run_export.py --pass <input.step> <STATION_CODE> [output_dir]

Example:
  freecadcmd run_export.py --pass "C:\\models\\C01-02_air_tanks.step" C01-02

Produces, in output_dir (default: cad-pipeline/output/<STATION_CODE>/):
  - model.obj        combined mesh, viewable in the app's existing 3D viewer
  - <CODE>.json       a `dwi` catalog entry (title, parts/BOM, modelUrl placeholder)
                      ready to review and paste into CatalogAdmin
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from importers import load_document
from tree_walker import build_tree, flatten_leaves
from bom import extract_bom
from exporter import export_obj
from catalog_shape import build_dwi_entry


def parse_args(argv):
    if "--pass" in argv:
        argv = argv[argv.index("--pass") + 1:]
    if len(argv) < 2:
        raise SystemExit(
            "Usage: freecadcmd run_export.py --pass <input.step> <STATION_CODE> [output_dir]"
        )
    input_path = argv[0]
    station_code = argv[1]
    output_dir = argv[2] if len(argv) > 2 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "output", station_code
    )
    return input_path, station_code, output_dir


def main():
    input_path, station_code, output_dir = parse_args(sys.argv)
    os.makedirs(output_dir, exist_ok=True)

    print(f"Loading {input_path} ...")
    doc = load_document(input_path)

    tree = build_tree(doc)
    leaves = flatten_leaves(tree)
    print(f"Found {len(leaves)} part(s) in the tree.")

    bom = extract_bom(leaves)
    print(f"BOM: {len(bom)} distinct part(s) after qty grouping.")

    model_path = os.path.join(output_dir, "model.obj")
    export_obj(leaves, model_path)
    print(f"Exported mesh to {model_path}")

    title = tree[0]["label"] if tree else station_code
    entry = build_dwi_entry(station_code, title, bom, "model.obj")

    json_path = os.path.join(output_dir, f"{station_code}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(entry, f, indent=2)
    print(f"Wrote catalog entry to {json_path}")

    print("\nNext steps:")
    print(f"  1. Upload {model_path} somewhere public (Drive/GitHub) and copy its direct-download URL")
    print(f"  2. Review {json_path} - fill in revision/description/steps/warnings, paste the model URL")
    print("  3. Paste the reviewed fields into CatalogAdmin -> Work Instructions tab -> station "
          f"{station_code}")


main()
