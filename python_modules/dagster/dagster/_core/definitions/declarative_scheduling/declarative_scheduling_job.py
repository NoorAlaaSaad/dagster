from typing import Iterable

from dagster._core.definitions.assets import AssetsDefinition


class DeclarativeSchedulingJob:
    def __init__(
        self, *, name: str, targets: Iterable[AssetsDefinition], default_scheduling_policy
    ) -> None:
        self.name = name
        self.targets = targets
