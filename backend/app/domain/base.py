"""Pydantic base model wiring camelCase wire aliases."""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class WireModel(BaseModel):
    """Base for wire-facing models: camelCase JSON, snake_case Python."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )
