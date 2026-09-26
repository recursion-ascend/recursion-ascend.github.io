## 题意

给定整数数组 `nums` 和目标值 `target`，找出和为 `target` 的两个元素下标。保证恰有一组解。

## 思路：一遍哈希

从左到右扫描，用哈希表记录「值 → 下标」。走到 `nums[i]` 时，只需查询 `target - nums[i]` 是否已经出现过：

- 出现过：直接返回两个下标；
- 没出现：把 `nums[i]` 记下来，继续。

先查后存，保证不会把同一个元素用两次。

## 复杂度

- 时间 $O(n)$：每个元素只进出哈希表一次。
- 空间 $O(n)$：哈希表最多存 $n$ 个元素。

## 代码

### Python

```python
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []
```

### C++

```cpp
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); ++i) {
            auto it = seen.find(target - nums[i]);
            if (it != seen.end()) return {it->second, i};
            seen[nums[i]] = i;
        }
        return {};
    }
};
```
