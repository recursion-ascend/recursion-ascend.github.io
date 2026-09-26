## 题意

给定字符串 `s`，求不含重复字符的最长子串长度。

## 思路：滑动窗口

维护窗口 `[left, right]` 内没有重复字符。用 `last[c]` 记录字符 `c` 最近一次出现的位置：

1. 右端点 `right` 每次右移一格；
2. 若 `s[right]` 上次出现的位置在窗口内（`last[c] >= left`），把 `left` 跳到 `last[c] + 1`；
3. 更新 `last[c] = right`，用 `right - left + 1` 更新答案。

`left` 只会向右跳、不会回退，所以整体是线性的。

> 关键点：判断条件是 `last[c] >= left`，而不是「`c` 出现过」。窗口左边之外的旧记录已经失效。

## 复杂度

- 时间 $O(n)$：两个指针都只向右移动。
- 空间 $O(|\Sigma|)$：字符集大小，ASCII 下为常数。

## 代码

### Python

```python
class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        last = {}
        best = left = 0
        for right, ch in enumerate(s):
            if ch in last and last[ch] >= left:
                left = last[ch] + 1
            last[ch] = right
            best = max(best, right - left + 1)
        return best
```

### C++

```cpp
class Solution {
public:
    int lengthOfLongestSubstring(string s) {
        vector<int> last(256, -1);
        int best = 0, left = 0;
        for (int right = 0; right < (int)s.size(); ++right) {
            unsigned char c = s[right];
            if (last[c] >= left) left = last[c] + 1;
            last[c] = right;
            best = max(best, right - left + 1);
        }
        return best;
    }
};
```
