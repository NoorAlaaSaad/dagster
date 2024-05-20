from typing import NamedTuple, Optional, Sequence

import dagster._check as check
from dagster._core.definitions.partition import PartitionsDefinition
from dagster._core.definitions.partition_key_range import PartitionKeyRange
from dagster._serdes import whitelist_for_serdes
from dagster._serdes.errors import DeserializationError
from dagster._serdes.serdes import deserialize_value


@whitelist_for_serdes
class PartitionWipeRecord(
    NamedTuple(
        "_PartitionWipeRecord", [("partition_range", PartitionKeyRange), ("timestamp", float)]
    )
):
    """Record of a partition wipe event."""

    def __new__(cls, partition_range: PartitionKeyRange, timestamp: float):
        check.inst_param(partition_range, "partition_range", PartitionKeyRange)
        check.float_param(timestamp, "timestamp")
        return super(PartitionWipeRecord, cls).__new__(cls, partition_range, timestamp)


def update_last_partition_wipe_records(
    existing: Sequence[PartitionWipeRecord],
    new: PartitionWipeRecord,
    partitions_def: PartitionsDefinition,
) -> Sequence[PartitionWipeRecord]:
    """Update a list of partition wipe records with a new record.  If the new record overlaps with
    existing records, the existing records will be merged with the new record.  If the new record
    is disjoint from existing records, the new record will be added to the list.
    """
    new_records = []
    for i, record in enumerate(existing):
        # no more overlap is possible
        if record.partition_range.start > new.partition_range.end:
            new_records.extend(existing[i:])
            break

        # overlap with existing range, update the existing range to exclude overlap with new range
        elif record.partition_range.end >= new.partition_range.start:
            for updated_range in partitions_def.subtract_ranges(
                record.partition_range, new.partition_range
            ):
                new_records.append(PartitionWipeRecord(updated_range, record.timestamp))

        # insert new record in correct location (sorted by range start)
        insertion_index = next(
            (
                i
                for i, r in enumerate(new_records)
                if r.partition_range.start > new.partition_range.start
            ),
            -1,
        )
        new_records.insert(insertion_index, new)
    return new_records


@whitelist_for_serdes
class AssetDetails(
    NamedTuple(
        "_AssetDetails",
        [
            ("last_wipe_timestamp", Optional[float]),
            ("last_partition_wipe_timestamps", Sequence[PartitionWipeRecord]),
        ],
    )
):
    """Set of asset fields that do not change with every materialization.  These are generally updated
    on some non-materialization action (e.g. wipe).
    """

    def __new__(
        cls,
        last_wipe_timestamp: Optional[float] = None,
        last_partition_wipe_timestamps: Optional[Sequence[PartitionWipeRecord]] = None,
    ):
        return super(AssetDetails, cls).__new__(
            cls,
            check.opt_float_param(last_wipe_timestamp, "last_wipe_timestamp"),
            check.opt_sequence_param(
                last_partition_wipe_timestamps,
                "last_partition_wipe_timestamps",
                of_type=PartitionWipeRecord,
            ),
        )

    @staticmethod
    def from_db_string(db_string):
        if not db_string:
            return None

        try:
            details = deserialize_value(db_string, AssetDetails)
        except DeserializationError:
            return None

        return details
