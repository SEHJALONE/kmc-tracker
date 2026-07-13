"""
Shapes pipeline output to match the `dwi` catalog entry format consumed by
src/data/catalogConfig.js and rendered by CatalogAdmin.jsx / WorkInstructions.jsx:

  { CODE: { title, revision, reference, description, warnings[], steps[],
            parts[], modelUrl } }

Steps and warnings aren't derivable from CAD geometry, so they're left
empty for the admin to fill in via CatalogAdmin same as today. The
generated JSON is meant to be reviewed, then either pasted into
CatalogAdmin manually or merged in a follow-up import step - this script
does not write to the live Google Sheet catalog directly.
"""


def build_dwi_entry(station_code, title, bom, model_filename):
    return {
        station_code: {
            "title": title,
            "revision": "",
            "reference": station_code,
            "description": "",
            "warnings": [],
            "steps": [],
            "parts": bom,
            "modelUrl": f"TODO: upload {model_filename} to a public host (Drive/GitHub) and paste the direct-download URL here",
        }
    }
