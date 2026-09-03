#!/usr/bin/env bash
# filter-branch 的 --msg-filter 脚本：
# 删除提交消息中的 Co-Authored-By 行
# 用法：git filter-branch --msg-filter 'bash scripts/strip-coauthor.sh' -- master
grep -v -i 'Co-Authored-By' "$1" || true
