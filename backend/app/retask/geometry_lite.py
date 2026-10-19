"""Lightweight route/threat geometry for the B6a rule slice.

This module deliberately avoids shapely/geoalchemy: B4 replaces it with the
real geo-risk engine. Everything here is pure, deterministic arithmetic on the
fictional Veridia plane:

- local equirectangular projection (111 km per degree of latitude, longitude
  scaled by ``cos(lat)``) — the same approximation the frontend mock uses;
- polyline distance and circle-exposure length for threat envelopes;
- route helpers for in-progress missions and launch-base endpoints.

Route-clearance convention (documented in ``backend/docs/RETASK_RULES.md``):
the departure/recovery endpoints that coincide with the launch base are
ignored when judging whether an option *clears* a threat. The seed itself
assigns Route C a low risk score even though its loop starts and ends at a base
within 85 km of THR-02; base defence is a base-status concern, not a routing
one. Mission impact analysis uses the same convention.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.domain import LatLng, Mission, MissionStatus, RouteOption, Threat

KM_PER_DEG_LAT = 111.0
BASE_ENDPOINT_TOLERANCE_KM = 1.0
_EPSILON = 1e-9


def km_per_deg_lng(lat: float) -> float:
    """Longitude scale at a given latitude (km per degree)."""
    return KM_PER_DEG_LAT * math.cos(math.radians(lat))


def distance_km(a: LatLng, b: LatLng) -> float:
    """Approximate great-circle distance between two points in km."""
    mid_lat = (a.lat + b.lat) / 2.0
    dx = (b.lng - a.lng) * km_per_deg_lng(mid_lat)
    dy = (b.lat - a.lat) * KM_PER_DEG_LAT
    return math.hypot(dx, dy)


def point_to_segment_distance_km(point: LatLng, start: LatLng, end: LatLng) -> float:
    """Shortest distance from ``point`` to segment ``start``-``end`` in km."""
    ref_lat = (start.lat + end.lat) / 2.0
    scale = km_per_deg_lng(ref_lat)
    px = (point.lng - start.lng) * scale
    py = (point.lat - start.lat) * KM_PER_DEG_LAT
    vx = (end.lng - start.lng) * scale
    vy = (end.lat - start.lat) * KM_PER_DEG_LAT
    length_sq = vx * vx + vy * vy
    if length_sq <= _EPSILON:
        return math.hypot(px, py)
    t = max(0.0, min(1.0, (px * vx + py * vy) / length_sq))
    return math.hypot(px - t * vx, py - t * vy)


def segment_circle_exposure_km(
    start: LatLng, end: LatLng, center: LatLng, radius_km: float
) -> float:
    """Length of the segment that lies inside the threat circle."""
    ref_lat = (start.lat + end.lat) / 2.0
    scale = km_per_deg_lng(ref_lat)
    ax = (start.lng - center.lng) * scale
    ay = (start.lat - center.lat) * KM_PER_DEG_LAT
    bx = (end.lng - center.lng) * scale
    by = (end.lat - center.lat) * KM_PER_DEG_LAT
    dx = bx - ax
    dy = by - ay
    length = math.hypot(dx, dy)
    if radius_km <= 0.0 or length <= _EPSILON:
        return 0.0

    a_coef = dx * dx + dy * dy
    b_coef = 2.0 * (ax * dx + ay * dy)
    c_coef = ax * ax + ay * ay - radius_km * radius_km
    discriminant = b_coef * b_coef - 4.0 * a_coef * c_coef
    if discriminant < 0.0:
        return 0.0

    root = math.sqrt(discriminant)
    t1 = (-b_coef - root) / (2.0 * a_coef)
    t2 = (-b_coef + root) / (2.0 * a_coef)
    inside_start = max(0.0, t1)
    inside_end = min(1.0, t2)
    if inside_end <= inside_start:
        return 0.0
    return (inside_end - inside_start) * length


def route_distance_km(points: list[LatLng]) -> float:
    """Total polyline length in km."""
    return sum(distance_km(points[index - 1], points[index]) for index in range(1, len(points)))


def route_exposure_km(points: list[LatLng], threat: Threat) -> float:
    """Length of the route inside the threat's engagement envelope."""
    if not points:
        return 0.0
    if len(points) == 1:
        inside = distance_km(points[0], threat.position) <= threat.range_km
        return 1.0 if inside else 0.0
    return sum(
        segment_circle_exposure_km(
            points[index - 1], points[index], threat.position, threat.range_km
        )
        for index in range(1, len(points))
    )


def route_intersects(points: list[LatLng], threat: Threat) -> bool:
    """True when any part of the polyline lies inside the threat circle."""
    if not points:
        return False
    if len(points) == 1:
        return distance_km(points[0], threat.position) <= threat.range_km
    return route_exposure_km(points, threat) > _EPSILON


def strip_base_endpoints(
    points: list[LatLng],
    base: LatLng | None,
    tolerance_km: float = BASE_ENDPOINT_TOLERANCE_KM,
) -> list[LatLng]:
    """Drop leading/trailing points that sit on the launch base.

    Loop routes (``base -> ingress -> target -> egress -> base``) repeat the
    base at both ends; the base leg is not a routing decision.
    """
    if base is None or not points:
        return list(points)
    kept = list(points)
    while len(kept) > 1 and distance_km(kept[0], base) <= tolerance_km:
        kept.pop(0)
    while len(kept) > 1 and distance_km(kept[-1], base) <= tolerance_km:
        kept.pop()
    return kept


def remaining_route_points(mission: Mission) -> list[LatLng]:
    """Route from the next waypoint onward (in-progress) or the full route."""
    route = list(mission.route)
    if not route:
        return []
    if mission.status is MissionStatus.IN_PROGRESS and mission.current_waypoint_index is not None:
        index = mission.current_waypoint_index % len(route)
        return route[index:] + route[:index]
    return route


def clearance_points(mission: Mission, launch_base: LatLng | None) -> list[LatLng]:
    """Points used to judge whether the current plan crosses a threat."""
    return strip_base_endpoints(remaining_route_points(mission), launch_base)


def option_clearance_points(
    mission: Mission, option: RouteOption, launch_base: LatLng | None
) -> list[LatLng]:
    """Points used to judge whether a candidate route option clears a threat."""
    return strip_base_endpoints(list(option.waypoints), launch_base)


def nearest_waypoint_index(points: list[LatLng], position: LatLng) -> int:
    """Index of the closest waypoint (0 for an empty route)."""
    if not points:
        return 0
    return min(range(len(points)), key=lambda index: distance_km(points[index], position))


def route_option_id_for(mission: Mission) -> str:
    """Id of the route option matching the current route, else ``"Custom"``."""
    for option in mission.route_options or []:
        if _same_points(list(option.waypoints), mission.route):
            return option.id
    return "Custom"


def route_option_for(mission: Mission, route_id: str) -> RouteOption | None:
    """Look up a route option by its wire id (e.g. ``Route C``)."""
    for option in mission.route_options or []:
        if option.id == route_id:
            return option
    return None


@dataclass(frozen=True)
class RouteAssessment:
    """One candidate route option evaluated against a threat."""

    option: RouteOption
    distance_km: float
    exposure_km: float
    clears: bool


def assess_route_options(
    mission: Mission, threat: Threat, launch_base: LatLng | None
) -> list[RouteAssessment]:
    """Assess every route option, sorted by exposure then risk then distance."""
    assessments: list[RouteAssessment] = []
    for option in mission.route_options or []:
        points = option_clearance_points(mission, option, launch_base)
        exposure = route_exposure_km(points, threat)
        assessments.append(
            RouteAssessment(
                option=option,
                distance_km=route_distance_km(list(option.waypoints)),
                exposure_km=exposure,
                clears=exposure <= _EPSILON,
            )
        )
    assessments.sort(
        key=lambda item: (
            item.exposure_km,
            item.option.risk_score if item.option.risk_score is not None else 100.0,
            item.distance_km,
            item.option.id,
        )
    )
    return assessments


def _same_points(first: list[LatLng], second: list[LatLng]) -> bool:
    if len(first) != len(second):
        return False
    return all(
        abs(a.lat - b.lat) <= 1e-6 and abs(a.lng - b.lng) <= 1e-6
        for a, b in zip(first, second, strict=True)
    )
