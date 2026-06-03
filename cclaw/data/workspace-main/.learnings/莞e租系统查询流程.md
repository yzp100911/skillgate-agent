# 莞e租系统查询流程

## 快速开始

```bash
# 1. 打开目标页面
agent-browser open "https://gez.dongguanbank.cn/landlord/#/house/index"
agent-browser wait --load networkidle

# 2. 登录（账号18926879306）
# 页面首次加载如有隐私弹窗，点击"同意并授权"
agent-browser snapshot -i   # 找到登录元素
agent-browser fill @e6 "18926879306"
agent-browser fill @e7 "100911yzpYZP"
agent-browser check @e3   # 勾选协议
agent-browser click @e1   # 点击登录
agent-browser wait --load networkidle

# 3. 等待跳转完成后，进入房源页面
agent-browser open "https://gez.dongguanbank.cn/landlord/#/house/index"
agent-browser wait --load networkidle

# 4. 搜索房号（以428为例）
agent-browser snapshot -i   # 获取搜索框ref
agent-browser fill @e51 "428"
agent-browser wait 1500    # 等待搜索结果

# 5. 点击租客名字进入详情
agent-browser eval 'document.body.innerText' | grep -E "428"  # 确认找到房间
agent-browser snapshot -i   # 找到租客名字的generic ref
agent-browser click @e82    # 点击租客名
agent-browser wait 2000

# 6. 查看租期信息
agent-browser eval 'document.body.innerText'
# 输出中包含: 租期起止日期：YYYY/MM/DD - YYYY/MM/DD
```

---

## 账号密码

| 账号 | 密码 | 备注 |
|------|------|------|
| 18122859721 | 100911yzp@ | 第一个账号 |
| 18926879306 | 100911yzpYZP | 第二个账号（尾号9306） |

---

## 关键 Ref 坐标（可能随页面更新变化，以snapshot为准）

### 登录页
- 手机号输入框: `ref=e6`
- 密码输入框: `ref=e7`
- 协议复选框: `ref=e3`
- 登录按钮: `ref=e1`
- 隐私同意按钮: `ref=e5`

### 房源页
- 搜索框（房间号）: `ref=e51`
- 租客名字generic: `ref=e82`（搜索结果出来后可见）
- 退出登录: 个人中心 → 退出登录

### 房源详情页（侧滑Drawer）
- 租约Tab: `ref=e56`（点击"租约详情"）
- 账单Tab: `ref=e57`
- 查看按钮（逾期账单行）: `ref=e224`
- 收款按钮: `ref=e225`
- 微信/支付宝扫码支付: `ref=e99`

---

## 常见问题处理

### 1. 搜索框填入后无反应
```bash
# 尝试等待更长时间
agent-browser wait 2000
# 或先点击搜索框再fill
agent-browser click @e51
agent-browser fill @e51 "428"
```

### 2. 点击租客名字没反应
```bash
# 用JS直接点击
agent-browser eval '
const els = document.querySelectorAll("*");
for (let el of els) {
  if (el.innerText === "杜帅帅" && el.tagName !== "SCRIPT") {
    el.click();
    break;
  }
}
'
```

### 3. session过期需重新登录
```bash
# 点击个人中心 → 退出登录 → 重新走登录流程
agent-browser click 个人中心按钮
agent-browser eval 'document.body.innerText' | grep "退出登录"
# 找到退出登录的ref并点击
```

### 4. 页面显示"您还没有添加房间"
说明当前登录的账号没有房源，可能登错账号了。换账号登录。

---

## 查询结果示例

### 428房（账号18926879306）
```
租客：杜帅帅
租约状态：即将到期
租期：2025/02/13 - 2026/05/31
租金：850元/月
```

### 325房（账号18926879306）
```
租客：姚泽平
租约状态：租约即将到期
租期（第一次签约）：2025/05/01 - 2026/04/30
租期（第二次签约）：2026/05/01 - 2026/05/31
当前欠费：租金·第13期（2026/05）欠12元，逾期7天
```

---

## 缴租二维码获取流程

1. 进入325房详情页
2. 点击"账单" tab
3. 找到逾期账单行，点击"查看"按钮
4. 弹窗内点击"微信/支付宝扫码支付"（`ref=e99`）
5. 弹出真正的缴费二维码，点击"保存到电脑"可下载
