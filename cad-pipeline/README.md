# CAD Pipeline

Converts a 3D CAD assembly into what the Digital Work Instructions (DWI)
module needs: a browser-viewable model file plus an auto-extracted parts
list (BOM), shaped to drop straight into the `dwi` catalog entry that
`CatalogAdmin.jsx` / `WorkInstructions.jsx` / `CADViewer.jsx` already
render.

This replaces manually typing the parts table by hand per station.

## Why FreeCAD, and why local (not deployed)

The DWI module originally aimed for Autodesk Platform Services (APS) for a
full CAD viewer + DWG support, but APS onboarding now requires creating a
paid "hub" before you can even get API credentials — not worth the setup
cost. FreeCAD is open-source, already installed, has a real Assembly
workbench, and its Python API can be scripted headless (no GUI, no
account, no subscription).

This pipeline runs **locally on this PC**, not on Vercel — FreeCAD is a
heavy desktop application, unsuited to a serverless function. It's a
batch tool you run whenever a new assembly file arrives, producing files
you review and then paste into CatalogAdmin (or upload) — it does not
write to the live Google Sheet catalog directly, to avoid an unreviewed
script touching production data.

## Requirements

- FreeCAD 1.1 (already installed at `AppData\Local\Programs\FreeCAD 1.1`)
- `freecadcmd.exe` — the headless interpreter, in the same `bin\` folder

## Usage

```
"C:\Users\KMC-PC\AppData\Local\Programs\FreeCAD 1.1\bin\freecadcmd.exe" ^
  "C:\Users\KMC-PC\kmc-tracker\cad-pipeline\run_export.py" ^
  --pass "C:\full\path\to\assembly.step" STATION_CODE [output_dir]
```

**Use full absolute Windows paths for every argument.** freecadcmd's own
CLI parser silently swallows relative paths combined with `--pass` and
exits with no error and no output — verified while building this.

Produces in `output_dir` (default `cad-pipeline/output/<STATION_CODE>/`):
- `model.obj` — combined mesh of every part, viewable in the app's
  existing `CADViewer.jsx` (OBJ is already a supported format there)
- `<STATION_CODE>.json` — a `dwi` catalog entry: `title` (from the
  assembly's top-level label), `parts` (BOM, qty-grouped), and a
  `modelUrl` placeholder to fill in after uploading the OBJ somewhere
  public

Then: upload `model.obj`, paste its direct-download URL into the JSON's
`modelUrl`, fill in `steps`/`warnings`/`description` (not derivable from
geometry), and paste the result into CatalogAdmin → Work Instructions tab.

## Official format: STEP

STEP (`.stp`/`.step`) is the format requested from the design team —
nearly every CAD tool can export it, FreeCAD reads it with full assembly
structure via the modern `Import` module, and the app's viewer already
supports it as a fallback (no glTF conversion needed for OBJ output).

**Import gotcha found while testing:** the legacy `Part.insert()` STEP
importer (what most FreeCAD Python examples online show) flattens
everything into one merged shape with generic OpenCASCADE labels,
discarding both assembly hierarchy and part names. Use `Import.insert()`
(the module is just `Import`, not `ImportGui` — that one needs a display
and fails headless with "Cannot load Gui module in console application").
This is what `importers.py` does; verified round-trip: nested
`App::Part` assemblies and original part `Label`s survive `Import.export`
→ `Import.insert`.

## Adding another source format later

`importers.py` has one registry dict, `FORMAT_LOADERS`, mapping file
extension to a loader function that returns a FreeCAD document. To add a
format, write a loader with that signature and add one line:

```python
FORMAT_LOADERS = {
    ".step": load_step,
    ".stp": load_step,
    ".iges": load_iges,   # add when needed
}
```

Known future candidates:
- **IGES** — same `Import` module, `Import.insert()` should work the same way (untested).
- **Native FreeCAD (`.FCStd`)** — use `App.open()` (this *is* the right call for FCStd, unlike STEP).
- **DWG** — FreeCAD cannot open DWG natively (Autodesk's format is closed). Needs a free bridge first: [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter) DWG→DXF, then FreeCAD's DXF import. Note the current chassis `.dwg` files in `Chassis Systems\Drawings\` are 2D layout drawings, not 3D solids — DXF import would give 2D geometry only, no BOM/assembly tree. Real 3D DWG (from AutoCAD Mechanical/Inventor) would need testing to confirm assembly structure survives the DXF bridge.

## Known limitations

- GLB/glTF export isn't wired up — FreeCAD 1.1 doesn't ship a
  console-importable glTF exporter (only low-level OpenCASCADE `RWGltf`
  bindings, which need a hand-assembled XCAF document). OBJ works today
  and the viewer already supports it, so this wasn't worth building yet.
- BOM quantity grouping strips FreeCAD's auto-dedup label suffix (it
  renames a second "Air Tank 20L" to "Air Tank 20L001") via
  `bom.normalize_label()`. If a real part legitimately ends in digits
  (e.g. "M8 Bolt 001"), it'll get stripped too — prefer setting a
  `PartNumber` custom property on parts if precise part numbers matter;
  `extract_bom()` uses that over the label when present.
- One `model.obj` per station, matching the catalog's single `modelUrl`
  field today. Sub-assembly-level individual model files aren't exported
  since there's nowhere in the current data model to put more than one
  URL per station.
