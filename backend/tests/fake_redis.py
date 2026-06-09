"""In-memory Redis stand-in for unit tests."""


class FakeRedis:
    def __init__(self) -> None:
        self._data: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self._data.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self._data[key] = value
        return True

    async def delete(self, key: str) -> int:
        if key in self._data:
            del self._data[key]
            return 1
        return 0

    async def exists(self, key: str) -> int:
        return int(key in self._data)

    async def incr(self, key: str) -> int:
        current = int(self._data.get(key, "0"))
        current += 1
        self._data[key] = str(current)
        return current

    async def expire(self, key: str, seconds: int) -> bool:
        return key in self._data
