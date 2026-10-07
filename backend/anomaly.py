"""Reviewer-only invoice anomaly scoring from a reproducible Isolation Forest."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re

import joblib
import numpy as np

MODEL_PATH = Path(__file__).resolve().parent / "models" / "invoice_anomaly.joblib"
FEATURE_VERSION = "verifi-invoice-isolation-forest-v1"
ALERT_PERCENTILE = 98.5
_artifact = None


def _features(records, limits, default_limit, known_categories=None):
    """Build stable features from the uploaded batch; each model finding can cite its peer."""
    ratios = []
    vendors = []
    categories = []
    for row in records:
        try:
            amount = float(row.get("_amt"))
        except (TypeError, ValueError):
            amount = float("nan")
        # `_c` is punctuation-stripped for matching, so use the original category label
        # when present to preserve spaces in policy keys such as "office supplies".
        raw_category = row.get("category")
        if raw_category is None or not str(raw_category).strip():
            raw_category = row.get("_c")
        category = re.sub(r"\s+", " ", str(raw_category or "").strip().lower())
        limit = float(limits.get(category, default_limit))
        ratios.append(amount / limit if np.isfinite(amount) and limit > 0 else 0.0)
        vendors.append(str(row.get("_v") or ""))
        categories.append(category)

    by_vendor_category = {}
    for idx, (vendor, category) in enumerate(zip(vendors, categories)):
        if vendor:
            by_vendor_category.setdefault((vendor, category), []).append(idx)

    peer_z = np.zeros(len(records), dtype=float)
    peers = [None] * len(records)
    peer_count = np.zeros(len(records), dtype=int)
    for indices in by_vendor_category.values():
        if len(indices) < 5:
            continue
        values = np.asarray([ratios[i] for i in indices], dtype=float)
        center = float(np.median(values))
        mad = float(np.median(np.abs(values - center)))
        scale = max(1.4826 * mad, 0.04)
        representatives = sorted(indices, key=lambda j: abs(ratios[j] - center))
        for idx in indices:
            peer_z[idx] = min(10.0, abs(ratios[idx] - center) / scale)
            peer_count[idx] = len(indices) - 1
            peers[idx] = representatives[0] if representatives[0] != idx else representatives[1]

    known_categories = list(known_categories or limits)
    x = np.zeros((len(records), 2 + len(known_categories) + 1), dtype=float)
    if not records:
        return x, [], []
    x[:, 0] = np.clip(ratios, 0.0, 2.0)
    x[:, 1] = peer_z
    for col, category in enumerate(known_categories, start=2):
        x[:, col] = np.asarray([c == category for c in categories], dtype=float)
    other_col = 2 + len(known_categories)
    x[:, other_col] = np.asarray([c not in known_categories for c in categories], dtype=float)
    details = [
        {"amount_ratio": ratios[i], "vendor_peer_z": float(peer_z[i]),
         "peer_count": int(peer_count[i]), "peer_index": peers[i]}
        for i in range(len(records))
    ]
    return x, details, ["amount_to_policy_limit", "vendor_peer_deviation", *known_categories, "other_category"]


def _load():
    global _artifact
    if _artifact is None and MODEL_PATH.exists():
        _artifact = joblib.load(MODEL_PATH)
    return _artifact


def score_records(records, limits, default_limit):
    """Return a synthetic-baseline anomaly percentile per row; missing model is non-fatal."""
    artifact = _load()
    if not artifact:
        return [None] * len(records)
    categories = artifact["metadata"]["categories"]
    x, details, _ = _features(records, limits, default_limit, categories)
    model = artifact["model"]
    reference = artifact["reference_anomaly_scores"]
    if not len(records):
        return []
    anomaly = -model.score_samples(x)
    ranks = np.searchsorted(reference, anomaly, side="right") * 100.0 / len(reference)
    return [
        {**details[i], "score": round(float(ranks[i]), 1)}
        for i in range(len(records))
    ]


def status():
    artifact = _load()
    if not artifact:
        return {"ready": False, "model": FEATURE_VERSION, "message": "Trained model artifact is missing."}
    return {"ready": True, **artifact["metadata"]}


def training_features(records, limits, default_limit, categories=None):
    """Shared with the training script so training and inference use identical features."""
    return _features(records, limits, default_limit, categories)[0]
