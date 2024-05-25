from dagster import Definitions, asset
from dagster._core.definitions.declarative_scheduling.declarative_scheduling_job import (
    DeclarativeSchedulingJob,
)
from dagster._core.definitions.declarative_scheduling.scheduling_condition import (
    SchedulingCondition,
)

SchedulingCondition.on_cron("0 0 * * *")


@asset
def an_asset() -> None: ...


"""
* DefinitionsGroup
* Job
"""

"""
A target can be:

* Asset
* Asset Check
* Future things
"""

"""
Everything is a job

Jobs have targets. Targets anything that can be executed.

* Asset
* Asset Check

* Selection? (bound to assets and checks at Definitions construction time)

* ExecutionTarget
"""


defs = Definitions(
    jobs=[
        DeclarativeSchedulingJob(
            name="my_job",
            targets=[an_asset],  # load_assets_from_module can do a bunch of work
            default_scheduling_policy=SchedulingCondition.on_cron("0 0 * * *"),
        )
    ]
)
