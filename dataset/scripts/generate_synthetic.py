"""Generate the bundled synthetic trace and preprocess it to 5-minute features.

    python dataset/scripts/generate_synthetic.py
"""

import json

from capplan_ml.pipeline import run_data

if __name__ == "__main__":
    manifest = run_data(source="synthetic")
    print(json.dumps(manifest, indent=2))
