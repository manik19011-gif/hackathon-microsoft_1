"""Train Veri-Fi's demo anomaly detector on reproducible synthetic clean invoices.

The shipped data is synthetic. Train and calibrate on separate generated batches; no
customer data is used. This model is a review signal, never an approval/denial model.
"""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
import random
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
import sklearn

import anomaly
import rules

SEED = 74102
TRAIN_ROWS = 40_000
CALIBRATION_ROWS = 8_000
VENDORS = {
    "travel": ["skyhightravels", "northstarjourneys", "urbanmobility", "bluepeakair"],
    "meals": ["cafebloom", "greenfork", "dailygrain", "harvesttable"],
    "software": ["cloudninesoftware", "signalstack", "orbitplatform", "northwindapps"],
    "office supplies": ["acmeofficesupplies", "papertrail", "workspacestock", "stationeryhub"],
    "consulting": ["brightlineconsulting", "fieldstoneadvisory", "meridianpartners", "oakridgeconsulting"],
    "utilities": ["powergridutilities", "citywater", "brightenergy", "metrofiber"],
    "marketing": ["adwavemedia", "launchhouse", "studioseven", "marketcraft"],
}
SHAPES = {
    "travel": (2.4, 4.7), "meals": (2.2, 5.1), "software": (2.8, 4.0),
    "office supplies": (2.0, 5.2), "consulting": (3.0, 3.8),
    "utilities": (2.8, 4.8), "marketing": (2.7, 4.0),
}


def make_clean_batch(count: int, seed: int, batch_id: int):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    categories = list(rules.LIMITS)
    vendor_profiles = {
        (cat, vendor): (float(rng.uniform(0.16, 0.48)), float(rng.uniform(0.07, 0.15)))
        for cat, vendors in VENDORS.items() for vendor in vendors
    }
    rows = []
    start = date(2025, 1, 1)
    for pos in range(count):
        cat = py_rng.choice(categories)
        vendor = py_rng.choice(VENDORS[cat])
        center, spread = vendor_profiles[(cat, vendor)]
        alpha, beta = SHAPES[cat]
        ratio = float(rng.beta(alpha, beta) * 0.95)
        ratio = max(0.025, min(0.86, center + (ratio - 0.36) * spread * 3.0))
        amount = round(ratio * rules.LIMITS[cat], 2)
        when = start + timedelta(days=py_rng.randrange(365))
        rows.append({
            "_i": pos,
            "_amt": amount,
            "_v": vendor,
            "_c": cat,
            "_n": f"{cat[:3].upper()}-{py_rng.randrange(10000, 99999)}-{batch_id}",
            "_date": pd.Timestamp(when),
            "employee": f"synthetic-{py_rng.randrange(1000)}",
        })
    return rows


def train():
    categories = dict(rules.LIMITS)
    default_limit = rules.DEFAULT_LIMIT
    train_rows = make_clean_batch(TRAIN_ROWS, SEED, 1)
    calibration = make_clean_batch(CALIBRATION_ROWS, SEED + 1, 2)
    category_names = list(categories)
    x_train = anomaly.training_features(train_rows, categories, default_limit, category_names)
    x_calibration = anomaly.training_features(calibration, categories, default_limit, category_names)
    model = IsolationForest(
        n_estimators=180, max_samples=512, contamination="auto",
        random_state=SEED, n_jobs=-1,
    ).fit(x_train)
    reference = np.sort(-model.score_samples(x_calibration)).astype(float)

    # A separate stress set contains plausible in-limit invoices that differ sharply
    # from their vendor's peer amounts. It checks ranking behavior, not fraud accuracy.
    stress = make_clean_batch(0, SEED + 2, 3)
    stress_indices = []
    for vendor, cat in (("skyhightravels", "travel"), ("cafebloom", "meals"),
                        ("cloudninesoftware", "software"), ("brightlineconsulting", "consulting")):
        base = len(stress)
        limit = categories[cat]
        for i in range(11):
            ratio = 0.23 + (i % 4) * 0.035
            stress.append({"_i": len(stress), "_amt": round(ratio * limit, 2), "_v": vendor,
                           "_c": cat, "_n": f"BASE-{vendor}-{i}", "_date": pd.Timestamp("2025-03-01"),
                           "employee": f"peer-{i}"})
        stress_indices.append(len(stress))
        stress.append({"_i": len(stress), "_amt": round(0.78 * limit, 2), "_v": vendor,
                       "_c": cat, "_n": f"OUTLIER-{base}", "_date": pd.Timestamp("2025-03-15"),
                       "employee": "peer-outlier"})
    x_stress = anomaly.training_features(stress, categories, default_limit, category_names)
    stress_scores = -model.score_samples(x_stress)
    stress_percentiles = np.searchsorted(reference, stress_scores, side="right") * 100 / len(reference)
    stress_detected = int(sum(bool(stress_percentiles[i] >= anomaly.ALERT_PERCENTILE) for i in stress_indices))

    metadata = {
        "model": anomaly.FEATURE_VERSION,
        "algorithm": "Isolation Forest",
        "scikit_learn_version": sklearn.__version__,
        "training_rows": TRAIN_ROWS,
        "calibration_rows": CALIBRATION_ROWS,
        "training_data": "Generated synthetic clean invoices; no customer data",
        "categories": category_names,
        "feature_names": ["amount_to_policy_limit", "vendor_peer_deviation", *categories, "other_category"],
        "alert_percentile": anomaly.ALERT_PERCENTILE,
        "trained_at_utc": pd.Timestamp.now(tz="UTC").isoformat(),
        "interpretation": "Percentile against a separate synthetic clean-invoice calibration set; not a fraud probability.",
        "stress_cases_detected": stress_detected,
        "stress_cases_total": 4,
    }
    anomaly.MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "reference_anomaly_scores": reference, "metadata": metadata},
                anomaly.MODEL_PATH, compress=3)
    print(f"Saved {anomaly.MODEL_PATH}")
    print(f"Model: {metadata['algorithm']} · {TRAIN_ROWS:,} synthetic training rows · {CALIBRATION_ROWS:,} calibration rows")
    print(f"Synthetic vendor-outlier stress cases ranked above {anomaly.ALERT_PERCENTILE:g}: {stress_detected}/4")
    print("This is a demo model, not a production fraud classifier. Validate on representative labeled data before deployment.")


if __name__ == "__main__":
    train()
