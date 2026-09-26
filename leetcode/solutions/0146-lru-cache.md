## 题意

设计一个容量为 `capacity` 的 LRU（最近最少使用）缓存，`get` 与 `put` 都要求平均 $O(1)$。容量满时淘汰最久没被访问的键。

## 思路：哈希表 + 双向链表

- **双向链表**按访问时间排序：表头是最近使用的，表尾是最久未使用的。
- **哈希表**把 `key` 映射到链表节点，做到 $O(1)$ 定位。

操作：

1. `get(key)`：查哈希表；命中则把节点移到表头并返回值。
2. `put(key, value)`：已存在则更新值并移到表头；否则若已满，删除表尾节点及其哈希表记录，再在表头插入新节点。

用头尾两个**哨兵节点**可以省去所有空指针判断。

> 系统里的影子：推理引擎的 KV Cache / 前缀缓存、操作系统的页缓存，淘汰策略里经常能看到 LRU 的思路。

## 复杂度

- `get` / `put` 均为 $O(1)$。
- 空间 $O(\text{capacity})$。

## 代码

### Python

```python
class Node:
    __slots__ = ("key", "val", "prev", "next")

    def __init__(self, key=0, val=0):
        self.key, self.val = key, val
        self.prev = self.next = None


class LRUCache:
    def __init__(self, capacity: int):
        self.cap = capacity
        self.map = {}
        self.head, self.tail = Node(), Node()  # sentinels
        self.head.next, self.tail.prev = self.tail, self.head

    def _remove(self, node: Node) -> None:
        node.prev.next, node.next.prev = node.next, node.prev

    def _push_front(self, node: Node) -> None:
        node.prev, node.next = self.head, self.head.next
        self.head.next.prev = node
        self.head.next = node

    def get(self, key: int) -> int:
        node = self.map.get(key)
        if node is None:
            return -1
        self._remove(node)
        self._push_front(node)
        return node.val

    def put(self, key: int, value: int) -> None:
        node = self.map.get(key)
        if node is not None:
            node.val = value
            self._remove(node)
            self._push_front(node)
            return
        if len(self.map) == self.cap:
            lru = self.tail.prev
            self._remove(lru)
            del self.map[lru.key]
        node = Node(key, value)
        self.map[key] = node
        self._push_front(node)
```

### C++

`std::list::splice` 可以在 $O(1)$ 内把节点移到表头，且不会使迭代器失效。

```cpp
class LRUCache {
    int cap;
    list<pair<int, int>> items;  // front = most recently used
    unordered_map<int, list<pair<int, int>>::iterator> pos;

public:
    LRUCache(int capacity) : cap(capacity) {}

    int get(int key) {
        auto it = pos.find(key);
        if (it == pos.end()) return -1;
        items.splice(items.begin(), items, it->second);
        return it->second->second;
    }

    void put(int key, int value) {
        auto it = pos.find(key);
        if (it != pos.end()) {
            it->second->second = value;
            items.splice(items.begin(), items, it->second);
            return;
        }
        if ((int)items.size() == cap) {
            pos.erase(items.back().first);
            items.pop_back();
        }
        items.emplace_front(key, value);
        pos[key] = items.begin();
    }
};
```
