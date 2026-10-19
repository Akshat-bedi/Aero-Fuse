"""JSON Schema export coverage."""

import json
from pathlib import Path

from app.domain import schemas


def test_export_schemas_writes_every_model(tmp_path: Path) -> None:
    written = schemas.export_schemas(tmp_path)
    assert len(written) == len(schemas.SCHEMA_MODELS)
    for path in written:
        assert path.is_file()
        schema = json.loads(path.read_text(encoding="utf-8"))
        # Recursive models (Recommendation.alternatives) export as a top-level $ref.
        assert "title" in schema or "$ref" in schema


def test_expected_schema_names_exist(tmp_path: Path) -> None:
    schemas.export_schemas(tmp_path)
    for name in ("wire_snapshot", "recommendation", "ops_event", "scenario_result", "audit_entry"):
        assert (tmp_path / f"{name}.schema.json").is_file()


def test_wire_snapshot_schema_uses_wire_aliases(tmp_path: Path) -> None:
    schemas.export_schemas(tmp_path)
    schema = json.loads((tmp_path / "wire_snapshot.schema.json").read_text(encoding="utf-8"))
    properties = schema["properties"]
    for alias in ("stateVersion", "weaponStocks", "activeEvents", "auditLog", "bounds"):
        assert alias in properties


def test_default_output_dir_is_backend_docs_schemas() -> None:
    expected = Path(__file__).resolve().parents[1] / "docs" / "schemas"
    assert schemas.default_output_dir() == expected
