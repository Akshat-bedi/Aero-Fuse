"""Wire enumerations shared by the domain models (API_CONTRACT.md section 3)."""

from enum import StrEnum
from typing import Literal

Priority = Literal[1, 2, 3, 4]


class AircraftType(StrEnum):
    FIGHTER_A = "Fighter-A"
    STRIKE_B = "Strike-B"
    TRANSPORT_C = "Transport-C"
    RECON_D = "Recon-D"
    HELICOPTER_E = "Helicopter-E"


class AircraftStatus(StrEnum):
    SERVICEABLE = "serviceable"
    MAINTENANCE = "maintenance"
    UNSERVICEABLE = "unserviceable"
    AIRBORNE = "airborne"
    TURNAROUND = "turnaround"


class CrewStatus(StrEnum):
    AVAILABLE = "available"
    RESTING = "resting"
    ON_MISSION = "on-mission"
    UNAVAILABLE = "unavailable"


class RunwayStatus(StrEnum):
    OPEN = "open"
    DEGRADED = "degraded"
    CLOSED = "closed"


class MissionType(StrEnum):
    CAP = "CAP"
    STRIKE = "strike"
    RECON = "recon"
    AIRLIFT = "airlift"
    SAR = "SAR"
    ESCORT = "escort"


class MissionStatus(StrEnum):
    PLANNED = "planned"
    APPROVED = "approved"
    IN_PROGRESS = "in-progress"
    COMPLETED = "completed"
    AT_RISK = "at-risk"
    CANCELLED = "cancelled"


class AirspaceType(StrEnum):
    RESTRICTED = "restricted"
    CORRIDOR = "corridor"
    NO_FLY = "no-fly"
    DANGER = "danger"


class ThreatType(StrEnum):
    SAM = "SAM"
    FIGHTER = "fighter"
    RADAR = "radar"
    AAA = "AAA"


class ThreatStatus(StrEnum):
    ACTIVE = "active"
    SUSPECTED = "suspected"
    NEUTRALISED = "neutralised"


class Severity(StrEnum):
    NOMINAL = "nominal"
    CAUTION = "caution"
    SEVERE = "severe"


class EventType(StrEnum):
    THREAT_DETECTED = "THREAT_DETECTED"
    AIRCRAFT_UNSERVICEABLE = "AIRCRAFT_UNSERVICEABLE"
    BASE_CLOSED = "BASE_CLOSED"
    WEATHER_DEGRADED = "WEATHER_DEGRADED"
    NEW_PRIORITY_MISSION = "NEW_PRIORITY_MISSION"
    CREW_UNAVAILABLE = "CREW_UNAVAILABLE"


class RecommendationStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    MODIFIED = "modified"
    STALE = "stale"
    EXPIRED = "expired"


class ChangeKind(StrEnum):
    AIRCRAFT_SWAP = "aircraft_swap"
    CREW_SWAP = "crew_swap"
    REROUTE = "reroute"
    DELAY = "delay"
    CANCEL = "cancel"
    NEW_ASSIGNMENT = "new_assignment"


class TradeoffDirection(StrEnum):
    GOOD = "good"
    BAD = "bad"
    NEUTRAL = "neutral"


class AlertSeverity(StrEnum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class AlertType(StrEnum):
    THREAT = "threat"
    READINESS = "readiness"
    WEATHER = "weather"
    CREW = "crew"
    CONFLICT = "conflict"
    PREDICTION = "prediction"
    DATA_QUALITY = "data-quality"


class RetaskStage(StrEnum):
    FUSING = "fusing"
    CONSTRAINTS = "constraints"
    OPTIMISING = "optimising"
    RANKING = "ranking"
    READY = "ready"
