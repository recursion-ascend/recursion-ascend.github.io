> 这是一篇**示例文章**，用来演示博客支持的写法。写好自己的第一篇后，可以把它从 `blog/posts.json` 里删掉。

## 怎么新增一篇文章

最简单的方式是用仓库里的脚本：

```bash
python3 tools/new.py post "文章标题" --tags hpc,notes
```

它会做两件事：

1. 在 `blog/posts/` 下新建一个 Markdown 文件；
2. 在 `blog/posts.json` 里登记标题、日期、标签和摘要。

然后用任何编辑器写正文，`git push` 之后网站就会自动更新。

## 数学公式

行内公式用单个美元符号，例如 Ring AllReduce 在 $p$ 个节点上传输 $n$ 字节数据的经典代价模型：

$$
T_{\text{ring}} = 2(p-1)\,\alpha + 2\,\frac{p-1}{p}\,\frac{n}{\beta}
$$

其中 $\alpha$ 是单次通信延迟，$\beta$ 是链路带宽。当 $n$ 很大时，带宽项主导，总时间趋近于 $2\frac{n}{\beta}$，与节点数无关。

## 代码

代码块会自动高亮，右上角有复制按钮：

```python
def ring_allreduce_time(p: int, n: float, alpha: float, beta: float) -> float:
    """Latency-bandwidth cost of ring all-reduce."""
    return 2 * (p - 1) * alpha + 2 * (p - 1) / p * n / beta
```

```cpp
double ring_allreduce_time(int p, double n, double alpha, double beta) {
    return 2.0 * (p - 1) * alpha + 2.0 * (p - 1) / p * n / beta;
}
```

## 表格

| 算法 | 延迟项 | 带宽项 |
| --- | --- | --- |
| Ring | $2(p-1)\alpha$ | $2\frac{p-1}{p}\frac{n}{\beta}$ |
| Recursive halving-doubling (Rabenseifner) | $2\log_2 p\,\alpha$ | $2\frac{p-1}{p}\frac{n}{\beta}$ |

### 小结

标题（`##`、`###`）会自动出现在右侧目录里；中英文混排、公式、代码、表格都可以直接写。
