## 题意

`height[i]` 表示宽度为 1 的柱子高度，求下雨后柱子之间能接多少水。

## 思路

位置 $i$ 上方的水量由两侧最高柱中较矮的那根决定：

$$
w_i = \min\Big(\max_{j \le i} h_j,\ \max_{j \ge i} h_j\Big) - h_i
$$

直接按公式预处理前缀最大值与后缀最大值即可做到 $O(n)$ 时间、$O(n)$ 空间。双指针可以把空间降到 $O(1)$。

### 双指针

左右指针 `l`、`r` 相向移动，分别维护 `left_max = max(h[0..l])` 和 `right_max = max(h[r..n-1])`。每一步移动**较矮**的那一侧：

- 若 `h[l] < h[r]`，则 `l` 处的水位就是 `left_max`，累加 `left_max - h[l]` 后右移 `l`；
- 否则对称地处理 `r`。

**为什么 `l` 处水位一定是 `left_max`？** 设 `left_max` 出现在位置 $k \le l$。若 $k = l$，由 `h[l] < h[r]` 知右侧最大值不小于它；若 $k < l$，左指针当初能越过 $k$，说明那时右指针所在位置 $r'$ 满足 $h_k < h_{r'}$，而 $r' \ge r > l$ 仍在 $l$ 右侧。两种情况都有 $\max_{j \ge l} h_j \ge$ `left_max`，所以公式里的 $\min$ 取到的就是 `left_max`。

## 复杂度

- 时间 $O(n)$：每个位置只被访问一次。
- 空间 $O(1)$。

## 代码

### Python

```python
class Solution:
    def trap(self, height: List[int]) -> int:
        l, r = 0, len(height) - 1
        left_max = right_max = 0
        water = 0
        while l < r:
            if height[l] < height[r]:
                left_max = max(left_max, height[l])
                water += left_max - height[l]
                l += 1
            else:
                right_max = max(right_max, height[r])
                water += right_max - height[r]
                r -= 1
        return water
```

### C++

```cpp
class Solution {
public:
    int trap(vector<int>& height) {
        int l = 0, r = (int)height.size() - 1;
        int leftMax = 0, rightMax = 0, water = 0;
        while (l < r) {
            if (height[l] < height[r]) {
                leftMax = max(leftMax, height[l]);
                water += leftMax - height[l++];
            } else {
                rightMax = max(rightMax, height[r]);
                water += rightMax - height[r--];
            }
        }
        return water;
    }
};
```

## 相关

单调栈解法按「层」累加水量，也是 $O(n)$，适合练习单调栈的套路。
