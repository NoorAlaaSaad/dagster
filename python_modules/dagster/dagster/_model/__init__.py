from abc import ABC
from functools import cached_property, partial
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Dict,
    Hashable,
    NamedTuple,
    Optional,
    Type,
    TypeVar,
    Union,
)

from pydantic import BaseModel, ConfigDict, PrivateAttr
from typing_extensions import Annotated, Self, TypeAlias, dataclass_transform

from dagster._check import build_check_call
from dagster._utils.cached_method import ALT_CACHED_METHOD_CACHE_FIELD

from .pydantic_compat_layer import USING_PYDANTIC_2

if USING_PYDANTIC_2:
    from pydantic import InstanceOf as InstanceOf  # type: ignore
else:
    # fallback to a no-op on pydantic 1 as there is no equivalent
    AnyType = TypeVar("AnyType")
    InstanceOf: TypeAlias = Annotated[AnyType, ...]


class DagsterModel(BaseModel):
    """Standardizes on Pydantic settings that are stricter than the default.
    - Frozen, to avoid complexity caused by mutation.
    - extra=forbid, to avoid bugs caused by accidentally constructing with the wrong arguments.
    - arbitrary_types_allowed, to allow non-model class params to be validated with isinstance.
    - Avoid pydantic reading a cached property class as part of the schema.
    """

    if not USING_PYDANTIC_2:
        # the setattr approach for cached_method works in pydantic 2 so only declare the PrivateAttr
        # in pydantic 1 as it has non trivial performance impact
        _cached_method_cache__internal__: Dict[Hashable, Any] = PrivateAttr(default_factory=dict)

    if TYPE_CHECKING:
        # without this, the type checker does not understand the constructor kwargs on subclasses
        def __init__(self, **data: Any) -> None: ...

    if USING_PYDANTIC_2:
        model_config = ConfigDict(  # type: ignore
            extra="forbid",
            frozen=True,
            arbitrary_types_allowed=True,
            ignored_types=(cached_property,),
        )
    else:

        class Config:
            extra = "forbid"
            frozen = True
            arbitrary_types_allowed = True
            keep_untouched = (cached_property,)

    def model_copy(self, *, update: Optional[Dict[str, Any]] = None) -> Self:
        if USING_PYDANTIC_2:
            return super().model_copy(update=update)  # type: ignore
        else:
            return super().copy(update=update)

    @classmethod
    def model_construct(cls, **kwargs: Any) -> Self:
        if USING_PYDANTIC_2:
            return super().model_construct(**kwargs)  # type: ignore
        else:
            return super().construct(**kwargs)


T = TypeVar("T", bound=Type)


def _banned(*args, **kwargs):
    raise Exception("This method is not allowed on `@dagster_model`s.")


def _dagster_model_transform(
    cls: T,
    *,
    enable_cached_method: bool,
) -> T:
    field_set = {
        **cls.__annotations__,
        **({ALT_CACHED_METHOD_CACHE_FIELD: Any} if enable_cached_method else {}),
    }
    base = NamedTuple(f"_{cls.__name__}", field_set.items())
    orig_new = base.__new__

    checks = {
        name: build_check_call(ttype=ttype, name=name)
        for name, ttype in cls.__annotations__.items()
    }

    def __checked_new__(cls, *args, **kwargs):
        for key, fn in checks.items():
            fn(kwargs[key])

        cache_fields = {ALT_CACHED_METHOD_CACHE_FIELD: {}} if enable_cached_method else {}
        return orig_new(cls, **kwargs, **cache_fields)

    base.__new__ = __checked_new__

    return type(
        cls.__name__,
        (cls, base),
        {
            "__iter__": _banned,
            "__getitem__": _banned,
            "__hidden_iter__": base.__iter__,
        },
    )  # type: ignore


@dataclass_transform()  # what dataclass transform options do we want on
def dagster_model(
    cls: Optional[T] = None,
    *,
    enable_cached_method: bool = False,
) -> Union[T, Callable[[T], T]]:
    if cls:
        return _dagster_model_transform(
            cls,
            enable_cached_method=enable_cached_method,
        )
    else:
        return partial(
            _dagster_model_transform,
            enable_cached_method=enable_cached_method,
        )


def dagster_model_with_new(
    cls: Optional[T] = None,
    *,
    enable_cached_method: bool = False,
) -> Union[T, Callable[[T], T]]:
    """Use this when you override __new__ so the type checker respects your constructor."""
    if cls:
        return _dagster_model_transform(
            cls,
            enable_cached_method=enable_cached_method,
        )
    else:
        return partial(
            _dagster_model_transform,
            enable_cached_method=enable_cached_method,
        )


class Copyable(ABC):
    """Since the
    * type checker doesn't know its a NamedTuple
    * we have banned __iter__ which the _replace and _asdict use
    we need to expose copy functionality via a class to inherit.
    """

    def copy(self, **kwargs) -> Self:
        if not (hasattr(self, "_fields") and hasattr(self, "__hidden_iter__")):
            raise Exception("Copyable only works for @dagster_model decorated classes")

        return self.__class__(
            **dict(
                zip(self._fields, self.__hidden_iter__()),  # type: ignore
                **kwargs,
            )
        )
