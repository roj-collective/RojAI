"""
agent/schemas.py — Domain models for the RojAI merchandising agent.

Pure data structures — no AWS imports, no I/O.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# ── Product ──────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Product:
    """A product listing to be audited."""
    product_id: str
    product_name: str
    description: str
    category: str
    marketplace: str
    brand: Optional[str] = None
    current_title: str = ""
    current_bullet_points: list[str] = field(default_factory=list)
    current_seo_keywords: list[str] = field(default_factory=list)
    current_tags: list[str] = field(default_factory=list)


# ── Audit Finding ────────────────────────────────────────────────────────────

class Severity(str, Enum):
    """Finding severity levels, ordered from most to least urgent."""
    CRITICAL = "critical"   # Listing is severely deficient (score 0)
    HIGH = "high"           # Major gap affecting conversions
    MEDIUM = "medium"       # Noticeable improvement opportunity
    LOW = "low"             # Minor polish suggestion


@dataclass(frozen=True)
class Finding:
    """A single quality issue identified during audit."""
    rule_id: str
    field: str
    severity: Severity
    message: str
    current_value: str          # Human-readable description of current state
    points_deducted: int        # Points lost from the max score


# ── Audit Result ─────────────────────────────────────────────────────────────

@dataclass
class AuditResult:
    """Complete audit outcome for one product."""
    product_id: str
    product_name: str
    quality_score: int                          # 0-100
    max_score: int                              # Always 100
    findings: list[Finding] = field(default_factory=list)
    needs_recommendations: bool = False         # True if score < threshold

    @property
    def passed(self) -> bool:
        return not self.needs_recommendations


# ── AI Recommendation ────────────────────────────────────────────────────────

@dataclass
class Recommendation:
    """AI-generated improvement suggestions for a product listing."""
    product_id: str
    product_name: str
    suggested_title: str
    suggested_bullet_points: list[str]
    suggested_seo_keywords: list[str]
    suggested_tags: list[str]
    summary: str                                # One-sentence explanation of changes
    source: str = "bedrock"                     # "bedrock" or "mock"
