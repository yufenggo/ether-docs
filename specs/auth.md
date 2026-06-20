---
title: 身份与认证（Auth）模块设计
status: accepted
last_reviewed: 2026-06-20
---

# 身份与认证（Auth）模块设计

> 🔒 **设计冻结 AF-1（Auth Freeze 1 · 2026-06-20）**：块3「身份与认证」一期设计在此**封版冻结**。
> - **冻结即基线**：本版作为后续实现的稳定依据；非经"解冻 / 变更"不再改动认证设计。
> - **🔶建议保持"建议"**：标 🔶 的项不在冻结时强制拍成"已定"，作为推荐保留、留待实现期逐项确认。
> - **解冻方式**：要改认证设计，在 `changes/` 新开一条变更说明动机、评审后再改，并更新本冻结版本号。

> 本文件是**认证模块的自包含设计**（已确认 / 冻结），按模块汇总，不引用在途的 `changes/`。
> 与租户相关的登录定位（路径式 `/{tenant_code}`、状态门）见 [tenant.md](tenant.md)。
> 标记：✅已定（已拍板 / 有 ADR） · 🔶建议(待确认) · ⏭️二期/后续 · ⚠️已接受风险。

> **术语**（首次出现解释）：
> - **AT / RT**：Access Token（访问令牌，短命）/ Refresh Token（刷新令牌，长命，静默换 AT）。
> - **plane（平面）**：`t:{tenant_code}`（租户面）/ `platform`（平台运营面）。同一套机制，命名空间区分。
> - **sid**：稳定会话 ID（跨刷新轮换不变，撤销锚点）。**PairID**：gale 为每对 AT/RT 生成的 id，随轮换变。
> - **jti**：单个 JWT 的唯一标识（标准 claim），与 `tenant_code` 无关。

---

## 1. 定位：认证是什么、与租户模块的关系

- 块3 负责"**证明你是谁**"（authentication）：登录、会话、令牌签发/刷新/撤销、验证码、LDAP、激活/设密/找回、失败锁定。
- "**你能做什么**"（authorization / RBAC）归块4；本模块只产出身份与会话，权限点由块4 校验。
- 与租户的衔接：登录入口与租户定位（`/{tenant_code}` vs 平台 `/admin`）、租户状态门（锁定/销毁一刀切）见 [tenant.md](tenant.md)；本模块的会话/令牌内嵌 `tenant_code` 并在每请求校验租户状态。
- **基础框架**：服务端基于 gale 框架（gin + HS256 JWT + go-redis）；凡 gale 已有能力优先复用，gale 不做的部分自建于 `gale.Redis()` 等。

---

## 2. 会话与 JWT（AT/RT）✅ 会话中心化撤销

### 2.1 统一建模：租户用户 + 平台超管同一套会话
租户用户与平台运营/超管**共用同一套 Session/AT/RT/撤销机制**，只分 **plane**：登录入口不同（`/{tenant_code}` vs `/admin`），机制一致，仅 Redis key 命名空间不同（`t:{tenant_code}:…` vs `platform:…`）。

### 2.2 AT / RT 分工
- **AT**：每次请求携带证明身份；**短命**（如 15 分钟）；**内含 `sid`**。
- **RT**：**长命**（如 7 天滑动），AT 过期时静默换新 AT，免重复登录。

### 2.3 会话中心化撤销（取代"只拉黑 jti"）
- **缺陷**：只把 AT 的 `jti` 加黑名单**不够**——AT 过期后，有效 RT 仍能刷出新 AT（新 jti 不在黑名单）→ 踢人被绕过。**撤销必须同时杀 RT**。
- **方案**：AT 带 `sid`；每请求**查会话是否存活**。**撤销 = 删会话记录** → AT（请求查不到会话→拒）+ RT（刷新查不到会话→拒）**一次性全死**。
- **代价**：每请求多一次 Redis 查会话；但本就要每请求查租户状态，无额外负担。

### 2.4 基于 gale 落地（用框架自带 JWT，不自建）
- **直接用 gale 的 API**：
  - `gale.SignTokenPair(claims)` → 一次签 **AT+RT**（都是 JWT，共享 `PairID`）；登录用。
  - `gale.RefreshTokenPair(at, rt, newClaims)` → 验 RT+AT、签**新一对**（新 PairID）；轮换用。
  - `gale.JWTMiddleware(factory)` → 验签 + 注入 claims；**自带 30s 宽限期 + `X-Token-Expiring` 响应头**（前端据此**静默续签**）。
  - `gale.ParseToken` / `GetClaims` / `GetUserID` → 解析与取值。
- **算法与密钥（gale 已定）**：**仅 HS256**（不支持 RS256/none，keyFunc 强制拒，防算法混淆攻击）；单 secret（`GALE_JWT_SECRET` ≥32 字节、环境变量注入）；**无 `kid` 多密钥**。配置：`jwt.access_ttl`（建议 15–30min）/`refresh_ttl`（7d）/`grace_period`（30s）/`cookie_name`。
- **撤销层 = 业务补**：gale 框架不做撤销，**会话中心化正是这层**——gale 负责签发/验证/续签（无状态），**撤销 / 单次使用 / 重用检测由业务用 Redis 会话补**。

**AT / RT 的 claims 结构（扩展 gale `BaseClaims`）**：
```go
// gale.BaseClaims = RegisteredClaims(sub=userId, exp, iat, iss, ID=jti) + PairID + Type(access/refresh)
type AuthClaims struct {
    gale.BaseClaims
    SID        string `json:"sid"`         // ★稳定会话ID(跨轮换不变)——撤销锚
    Plane      string `json:"plane"`        // t | platform
    TenantCode string `json:"tenant_code"` // 租户码(平台面=platform)；用 tenant_code 避免与 jti 混
    RoleID     int    `json:"role_id"`      // 可选；AT 不放完整权限,按需查
}
func (c *AuthClaims) GetBaseClaims() *gale.BaseClaims { return &c.BaseClaims }
```
- `sub`=userId（gale 标准）；`PairID`=gale 生成、**随轮换变**；`sid`=业务生成、**稳定**。
- **轮换时把同一个 `sid` 传进 `RefreshTokenPair` 的 newClaims**，使会话跨轮换连续。

**sid ↔ PairID 配合**：`sid` 是稳定会话锚（撤销 / 查活按它）；`PairID` 是每对 token 的 id（随轮换变，存进会话做重用检测）。会话记录 `sess:{sid}` 存 `currentPairID / prevPairID`；刷新时 RT 的 PairID ≠ current 且 ≠ prev（过宽限）→ 判失窃删会话。

**校验链**：`gale.JWTMiddleware`（验签+宽限）→ **业务中间件**（查 `sess:{sid}` 在不在 + PairID 对不对 + 查 `tstatus`）→ 放行。

**前端落地（✅ AT 内存 + RT HttpOnly）**：AT 走 `Authorization: Bearer`（gale 读 Header）；RT 放 HttpOnly cookie（业务在 handler 用 `c.SetCookie` 写，gale 不接管 cookie 写）。刷新端点读 cookie 的 RT + AT，调 `RefreshTokenPair`，再 `Set-Cookie` 新 RT。

### 2.5 流转逻辑（登录 / 请求 / 刷新轮换 / 即时失效 / 租户一刀切）
```mermaid
sequenceDiagram
  participant U as 前端(浏览器)
  participant API as 后端(gale)
  participant R as Redis

  Note over U,R: ① 登录
  U->>API: 账号 + 密码 + 验证码
  API->>R: gale SignTokenPair → 建会话 sess:{sid}(含 currentPairID) + usess:{userId}
  API-->>U: AT(内存,含sid,15min) + RT(HttpOnly cookie,7d)

  Note over U,R: ② 正常请求(AT 有效)
  U->>API: 请求 + Authorization: Bearer AT
  API->>R: 查 sess:{sid} 存活? 查 tstatus:{tenant_code}?
  API-->>U: 200(会话在 + 租户正常)

  Note over U,R: ③ AT 过期 → 刷新 + RT 轮换
  U->>API: POST /refresh (RT cookie 浏览器自动带)
  API->>R: 取 sess:{sid} 的 currentPairID 比对
  alt RT.PairID == currentPairID(正常)
    API->>R: gale RefreshTokenPair → 存新 PairID(旧作废) + 滑动续期
    API-->>U: 新 AT(内存) + Set-Cookie 新 RT
  else PairID 命中 prev(已用过=失窃)
    API->>R: 删会话 sess:{sid}
    API-->>U: 401 强制重新登录
  end

  Note over U,R: ④ 即时失效(登出/踢人/禁用)
  U->>API: 登出 / 管理员踢人 / 禁用
  API->>R: 删会话 sess:{sid}(AT与RT一并失效)
  Note right of API: 禁用另在 DB 置 disabled(挡再登录)

  Note over U,R: ⑤ 租户级一刀切(平台锁定该租户)
  API->>R: 失效 tstatus:{tenant_code} 缓存
  U->>API: 任意请求(AT 还没过期)
  API->>R: 查 tstatus → locked
  API-->>U: 拒绝(不等 AT 过期)
```

### 2.6 RT 轮换 + 重用检测
- **轮换**：每次刷新调 `RefreshTokenPair` 签新一对（新 `PairID`），**新 PairID 写进会话记录**、旧的移到 `prevPairID`。
- **重用检测**：若来的 RT 的 `PairID` **命中 prev**（已作废）且**过了宽限期** → 判失窃 → **删会话、强制重登**（一个 `sid` 会话即一个"令牌家族"）。
- **正常刷新无感**：AT 过期（15min）→ 前端自动后台刷新 → 无感知。"401 强制重登"**只在失窃分支**触发，不是常态。真需重登仅：① RT 过期；② 检测到 RT 失窃；③ 主动登出/改密；④ 平台锁定/销毁该租户。

### 2.7 RT 寿命与并发刷新（🔶建议）
- **滑动续期**：每次轮换给新 RT 全新 7d TTL → 7 天内有活动就续、活跃用户不掉线。**绝对上限**（如 30d 强制重登）可选，是否启用待实现期定。
- **并发刷新缓解**：严格单次使用时，多标签页/网络重试可能两请求几乎同时用同一 RT → 第二个被误判失窃。缓解：① "刚换下来的上一对"留 **~10s 宽限**仍接受；② 前端刷新**串行化/加锁**。

### 2.8 撤销 / 禁用 / 并发：同一套会话操作，不同范围
| 操作 | 本质 | 范围 | 额外 |
|---|---|---|---|
| 登出 | 删会话 | 当前 `sid` | — |
| 踢人下线 / 拉黑 | 删会话 | 指定的 `sid`（一个 / 多个） | — |
| 禁用用户 | 删会话 | 该用户**全部 sid**（经 `usess`） | **+ DB 置 disabled**（挡再登录） |
| 改密 | 删会话 | 该用户全部 sid（可留当前） | — |
| 设备会话唯一 / 并发控制 | 删会话 | 该用户**其它 sid**（或限 N） | 登录时按 `usess` 触发；等保三级要求 |

> 关键：**踢人 ≠ 禁用**——踢人只删会话（用户能重新登录）；禁用必须**额外在 DB 打标记**挡住再登录。

### 2.9 前端会话方案（🔶推荐）
> HttpOnly cookie = JS 读不到的 cookie，**防 XSS 偷 token**，但带来 CSRF（需 SameSite + CSRF token）。

| 方案 | AT | RT | 防 XSS 偷 token | CSRF |
|---|---|---|---|---|
| 🔶推荐 | **内存** | **HttpOnly+Secure+SameSite cookie**，`Path=/{tenant_code}` 限定刷新接口 | RT 偷不走、AT 短命 | 仅刷新接口需防 |
| 备选 | HttpOnly cookie | HttpOnly cookie | 都偷不走、前端不碰 token | **所有写接口都要防** |

- 同源多租户：cookie `Path=/{tenant_code}` 隔离；AT/RT 均绑 tenant_code（服务端校验）。
- 纵深防御：HttpOnly 只挡"偷 token"，挡不住 XSS 就地操作 → CSP + 输出转义仍要做。

### 2.10 JWT 安全 / 防滥用 / 审计
- **签名算法** HS256（gale 强制拒 `none`/RS256）；单 secret 环境注入、按密钥管理（块7）、不入代码/日志；无 `kid`。
- **Claims 校验**：gale 自带验签 + `exp`/`nbf`/`iss`；业务再校验 `plane` / `tenant_code` 一致。
- **刷新端点限流**：`/refresh` 与登录端点一样限流（gale 自带限流），防 RT 滥用/暴力。
- **认证事件审计**：登录成功/失败、登出、刷新、撤销、踢人、禁用 → 接块6 审计（等保要求覆盖每用户重要行为）。

---

## 3. 登录图形验证码 ✅（基于 gale genx，Redis 自管校验）

一期登录**强制携带图形验证码**，类型默认 **`String` 6 位**（gale 内置安全字符集，已排除 `0/1/i/l/o/I/L/O` 等易混字符）。**直接复用 gale 自带能力，不自建滑块、不接外部云验证码**——gale 图形验证码纯进程内生成、零外部依赖、可内网、数据不出境，正合本项目地基约束。

| 能力 | gale | 自补 |
|---|---|---|
| 生成图形验证码 | ✅ `gale.NewCaptchaBase64()` → `(id, answer, dataURL, err)` | — |
| 安全字符集（防混淆） | ✅ `String` 型内置 | — |
| 存储 id→answer / 校验比对 | ❌ 明确不做 | 业务用 `gale.Redis()` 自存自校 + 用后即删 |
| 滑块/行为/云验证码 | ❌ 无 | 留 `CaptchaProvider` 扩展位，二期再实现 |

> ⚠️ gale 底层 `base64Captcha.DefaultMemStore` 是**进程内**存储，多副本部署 ID 不能跨实例校验——故**必须**用 `gale.Redis()` 存答案，**禁用其内存 store**。

```mermaid
sequenceDiagram
  participant FE as 前端
  participant API as 登录服务
  participant R as Redis
  FE->>API: GET /captcha
  API->>API: gale.NewCaptchaBase64(String, len=6)
  API->>R: SET captcha:{id} = answer EX 120（原子带过期）
  API-->>FE: { captcha_id, image(base64 dataURL) }
  FE->>API: POST /login { user, pwd, captcha_id, captcha_input }
  API->>R: GET captcha:{captcha_id}
  R-->>API: answer / nil
  API->>R: DEL captcha:{captcha_id}（命中即删，one-shot）
  alt 验证码缺失/过期/不符
    API-->>FE: 400 验证码错误（前端刷新图）
  else 验证码通过
    Note over API: 仅在码通过后才做"查账号+校验密码哈希"（昂贵步骤）
    alt 账号或密码错
      API-->>FE: 401 用户名或密码错误（统一文案，防账号枚举）
    else 成功
      API-->>FE: 签发 AT/RT（转 §2 会话流程）
    end
  end
```

**Redis key 与 TTL（防无限扩张）**：`captcha:{id}` = answer，TTL **120s**。
1. **TTL 自动回收是根本**：每 key 生成即带 120s 过期，Redis 到期自动驱逐，无需定时清理。
2. **原子带过期写入**：必须单命令 `SET key val EX 120`，**不可** `SET` 后再 `EXPIRE`（防进程崩在中间留下无 TTL 的孤儿 key 永不回收）。
3. **用后即焚（one-shot）**：校验后即 `DEL`（不论对错），防重放、提前释放。
4. **生成接口限流**：`GET /captcha` 套 gale 限流按 IP，防刷堆 key。
5. **容量可估**：上界 ≈ 峰值生成速率 × 120s × 单条(≈100B)，收敛有限、可监控。

**校验规则与防枚举**（顺序不可换）：
1. **先验码、后验密码**：在账号查库/密码哈希校验（昂贵）**之前**先验证码，挡脚本、省资源、收窄被试面。
2. **大小写不敏感比对**：`String` 型用 `strings.EqualFold`，降输入摩擦（熵略降，6 位仍足够一期）。
3. **错误文案分层**：验证码错 → 明确"验证码错误"（前端刷图，不泄露账号存在性）；账号不存在/密码错 → **统一**"用户名或密码错误"。
4. **验证码 ≠ 防撞库主力**：图形码抗 OCR 弱，作用是抬自动化成本；防撞库靠 §6 失败锁定 + 限流。

**扩展位 `CaptchaProvider`（⏭️二期）**：抽象为 provider 接口，一期只实现 gale 图形码；二期可按租户切滑块/云厂商/Turnstile。**无障碍**（音频/字符降级）、**风险驱动加强**（失败/异地/新设备升级验证）列入二期，但不弱化一期"每次必带"。

---

## 4. 激活 / 设密 / 重置密码 token ✅（基于 gale encryption + genx，Redis 自管）

覆盖三类同构场景（一次性带外凭证 out-of-band token）：

| 场景 | 触发 | 终态 |
|---|---|---|
| 租户管理员**首次激活 + 设密** | 平台创建租户后 | 设密 → 账号激活 → 可登录 |
| **重置管理员密码** | 平台超管操作（控制平面→租户库高权写通道，双人复核） | 设新密 |
| 终端用户**自助找回密码** | 用户点"忘记密码" | 设新密 |

| 需要 | gale | 自补 |
|---|---|---|
| 高熵随机 token | ✅ `gale.RandString(32)`（crypto/rand） | — |
| 密码哈希（设密产物） | ✅ `gale.HashPassword` / `CheckPassword`（bcrypt） | — |
| token 指纹（存哈希不存明文） | ✅ `gale.SHA256String(token)` | — |
| 存储 + 一次性 + 时效 | ✅ `gale.Redis()` SET EX / DEL | 业务自管 key/TTL |
| 单飞作废旧 token（并发安全） | ✅ `gale.WithLock(ctx,key,ttl,fn)` | 按 user 加锁删旧 |
| **邮件 / 通知发送** | ❌ gale 无邮件模块 | **解耦到块10** |

**核心安全设计**：
1. **高熵随机** `gale.RandString(32)`（≈190 bit，不可猜举）。
2. **🔑 存哈希、不存明文**：Redis 只存 `SHA256(token)`，**明文 token 仅在发给用户的链接里**。Redis 被读也无法还原成可用链接；校验时把带回的 token 现哈希再比对。
3. **一次性**：设密成功立即 `DEL`，防重放。
4. **时效 TTL**（C2 可调，下为默认兜底）：激活 token **默认 24h**；重置密码 token **默认 30 分钟**（自助找回应短命）。
5. **绑定主体 + 用途**：token 记录 `{user_id, tenant_code, purpose}`，跨账号/跨用途不可重用。
6. **单飞作废旧 token**：同一用户重新申请时旧 token 立即失效（`gale.WithLock` 按 user 加锁 + owner 索引删旧 key）。
7. **设密产物 bcrypt**：`gale.HashPassword`；设密时校验**密码强度**（策略由 C2 下发，连等保2.0）。
8. **防账号枚举**："忘记密码"接口无论账号是否存在都返回同一句"若存在将发送邮件"。
9. **申请接口限流**：按 IP + 账号双维度（`gale.RateLimitMiddlewareIP`）。
10. **链接传输**：仅 HTTPS；token 走**落地页 POST 提交**而非长留 URL query（query 易进日志/Referer）。
11. **激活闭环对接租户状态机**：验 token → 设密 → 管理员/租户「待激活→正常」（见 [tenant.md](tenant.md) 状态机）→ `DEL` token。

```mermaid
sequenceDiagram
  participant OPS as 平台运营/用户
  participant API as 认证服务
  participant R as Redis
  participant N as 块10 通知（解耦）
  OPS->>API: 创建租户 / 申请找回
  API->>API: token = gale.RandString(32)
  API->>R: SET authtoken:{purpose}:{sha256(token)} = {user,tenant,purpose} EX TTL（原子）
  API->>N: 投递"含明文 token 的链接"（事件，渠道由块10 决定）
  Note over OPS,N: 一期：链接可由平台界面出示，超管带外转交；邮件等渠道走块10
  OPS->>API: 打开落地页，POST { token, 新密码 }
  API->>R: GET authtoken:{purpose}:{sha256(token)}
  R-->>API: 记录 / nil
  API->>R: DEL（命中即删，one-shot）
  alt token 缺失/过期/用途不符
    API-->>OPS: 400 链接无效或已过期
  else 通过
    API->>API: 校验密码强度 → gale.HashPassword 存储
    API->>API: 租户/管理员状态机「待激活→正常」
    API-->>OPS: 设密成功，可登录
  end
```

**衔接**：
- ✅ **邮件通道解耦到块10**：auth 只产出"token + 链接"并投递**通知事件**，不含发送实现；块10 后续可演进为通用通知总线（事件驱动）。
- ✅ **可调安全参数归口块2 C2 配置中心**：token TTL、密码强度策略、验证码参数、登录失败锁定阈值等统一由 C2 下发，**代码内置安全默认值兜底**；平台级基线 + 按租户可收紧。一期 C2 做基础配置读取，纳管范围随实现期细化。

---

## 5. LDAP / AD 登录 ✅（可复用认证器，配置驱动，不存密码）

> gale 无 LDAP 能力（源码 0 命中、模块清单无、go.mod 无依赖）。自建用社区事实标准 `github.com/go-ldap/ldap/v3`，作为业务模块接入 gale 生命周期；**LDAP 只负责"验一次密码"**，验通过后走 §2 的会话签发，之后请求不再接触 LDAP。

**设计目标**：
1. **可复用认证器**：一套统一逻辑，行为全由配置决定；平台与各租户走同一套代码。
2. **每租户一份配置**：平台侧 LDAP 配置存**中心库**（控制平面）；各租户 LDAP 配置存**各自租户库**（数据平面，db-per-tenant 一致）。
3. **平台/租户都不存 LDAP 用户密码**：直接用租户 LDAP 服务验证（Search+Bind），密码不落地。
4. **前端单个"是否用 LDAP 登录"开关**：默认关=本地；勾上=走 LDAP。请求带布尔 `use_ldap`，**解决本地与 LDAP 同名账号冲突**（用户显式指明，不靠猜测/回退）。
5. **用户组映射 LDAP 群组**：用户组（group）模型与映射规则**归块4 RBAC**，本节只留对接点。

```mermaid
sequenceDiagram
  participant FE as 前端(开关:是否用LDAP)
  participant API as 认证服务
  participant CFG as LDAP配置(中心库/租户库)
  participant DIR as 租户 LDAP/AD
  participant DB as 用户库(中心/租户)
  FE->>API: POST /login { use_ldap=true, username, password, captcha }
  API->>API: 前置：trim 去空格；判空（拒空密码，CVE-2017-14623）；验验证码
  API->>CFG: 读该租户 LDAP 配置(host/bindDN/filter/TLS/CA)
  API->>API: SSRF 校验：协议白名单 + 私有网段拒绝 + 连接时再解析(防 DNS 重绑定)
  API->>DIR: ① 服务账号 Bind（LDAPS/StartTLS，校验证书，InsecureSkipVerify=false）
  API->>DIR: ② Search（ldap.EscapeFilter(username)）取用户 DN(+memberOf)
  DIR-->>API: 用户 entry + DN(条目唯一全路径名)
  API->>DIR: ③ 用 DN + 用户输入密码 Bind 验证
  alt bind 失败
    API->>API: 失败计数（LDAP 独立阈值，压在 AD 之下）
    API-->>FE: 统一失败文案（防枚举）
  else 成功
    API->>DB: JIT：查/建影子账号（承载用户组/RBAC），不存密码
    API->>API: (块4) LDAP 群组 → 用户组映射（可配置，一期预留）
    API->>API: 签发 AT/RT（转 §2 会话）；LDAP 退出链路
    API-->>FE: 登录成功
  end
```

> 术语：**Search+Bind**=先用只读服务账号搜出用户条目、再用用户密码二次绑定验证的两步认证模式；**JIT**（Just-In-Time，即时建账）=首次 LDAP 登录成功时即时在本地建"影子账号"承载用户组/RBAC 角色，不写入密码；**DN**（Distinguished Name）=目录中条目的唯一全路径名；**OU**（Organizational Unit，组织单元）=目录里的分组容器。

**安全清单**（均有权威出处，见 §8）：
1. **🔒 强制 LDAPS / StartTLS + 校验证书**：明文 389 会让 bind 密码明文过网；`InsecureSkipVerify=false`；**私有 CA 支持租户上传 CA 证书**。
2. **🚨 拒空密码（CVE-2017-14623, CVSS 8.1）**：旧版 go-ldap 空密码 `Bind()` 返回 nil 被误判成功。除依赖新版 `AllowEmptyPassword` 默认 false 外，**前置 `trim` 后主动判空拒绝**。
3. **LDAP 注入转义**：用户名拼 filter/DN 前必过 `ldap.EscapeFilter()` 与 `ldap.EscapeDN()`。
4. **必须 Search+Bind，不拼 DN**：AD 用户分布在不同 OU，固定 DN 模板覆盖不全；Direct Bind 有 DN 注入面、无法附加 `accountStatus`/`memberOf` 过滤。
5. **SSRF 防护**（租户可填 LDAP 地址 = 攻击面）：协议白名单（只 `ldap(s)://`）+ 私有网段黑名单（RFC1918 / `127.0.0.0/8` / `169.254.0.0/16` / `::1`）+ **连接时再解析校验 IP（防 DNS 重绑定）**+ 可选预注册白名单 + 禁用 referral 跟随。
6. **服务账号凭据保护**：bind DN 密码用 `gale.Encrypt` 加密存、环境/密钥管理注入、不入日志。
7. **超时 + fail-closed**：查询设超时；LDAP 不可达即**拒绝登录**，**不缓存密码**（不做离线登录）。连接池用外挂（go-ldap 无内置，如 `go-ldapool`），按 `tenant_code` 复用。

**配置与存储（每租户一份）**：

| 配置归属 | 存储位置 | 关键字段 |
|---|---|---|
| 平台侧 LDAP | 中心库（控制平面） | host/port、tls(ldaps/starttls)、ca_cert、bind_dn、**bind_pwd_enc**、base_dn、user_filter、attr_map、group_map、lock_threshold |
| 各租户 LDAP | 各自租户库（数据平面） | 同上 |

**衔接**：
- **§2 会话**：LDAP 仅认证；**AD 中禁用账号**后已签发 JWT 仍有效 → 由同步 Job 检测禁用 → **删 `sess:{sid}`**（复用会话中心化撤销，比 JWT 黑名单干净）。
- **块4 RBAC**：用户组模型 + 群组→用户组映射在块4 定义；一期"只认证、授权用本地 RBAC 手工分配"，群组映射逻辑一期预留接口、配置化，二期落地。
- **块2 C2 配置中心**：LDAP 各项、本地 + LDAP 锁定阈值/窗口/解锁时长、TLS/CA 等可调参数归 C2。
- **C5 权益门控**：LDAP 为商业功能，按租户权益开关启用。
- 🔶 待块4 确认：用户组模型形态与 LDAP 群组映射的一期/二期排期。

---

## 6. 登录失败锁定 / 防枚举 ✅（gale 限流复用 + 失败锁定自建于 Redis）

> **接口粗限流**用 gale `RateLimitMiddlewareIP`（固定 1 秒窗口、计所有请求）直接复用；**账号失败锁定**（只计失败、长窗口、锁账号）gale 限流语义不覆盖，**自建于 `gale.Redis()`**（`INCR`+`EXPIRE` 原子计数）。两者叠加：限流挡"接口被刷"，锁定挡"针对账号撞库"。

**合规取舍**：等保2.0 三级**强制**要求登录失败处理（必须有锁定）；NIST 800-63B 警告永久硬锁本身是 DoS 面。**化解**：**短时锁定 + 自动解锁** + 验证码每次必带 + IP 粗限流。

**双维度计数（缺一不可）**：按账号（防撞单账号；key 带来源维度 local/ldap）+ 按 IP（防一个 IP 撞多账号）。

| 用途 | Key 模式 | Value | TTL | 写/清 |
|---|---|---|---|---|
| 账号失败计数 | `{plane}:loginfail:{source}:{username}` | 计数 | = 统计窗口 | 失败 `INCR`（首次设窗 TTL）；成功登录清零 |
| IP 失败计数 | `loginfail:ip:{ip}` | 计数 | = 统计窗口 | 失败 `INCR`；防撞多账号 |
| 锁定标记 | `{plane}:lock:{source}:{username}` | 锁定态 | = 锁定时长 | 达阈值置；到期**自动解锁**；管理员可手动删 |

**规则**：
1. 登录先查 `lock:{…}`：存在 → 直接拒（通用语），不进验密。
2. 失败 → 账号、IP 双计数 `INCR`（首次 `INCR` 后设窗口 TTL 保证原子，或用 Lua）。达阈值 → 置 `lock`（TTL=锁定时长，到期自动解锁）。
3. **成功登录清零**该账号计数。
4. **管理员可手动解锁**（删 `lock`）+ 审计。
5. **验证码错不计入账号锁定**（验证码每次先挡、未到验密），但**计入 IP 计数**防刷。
6. **阈值/窗口/解锁时长 = C2 配置**（本地、LDAP 各一套，平台基线 + 租户可调；LDAP 阈值压在租户 AD 策略之下）。

**防枚举（account enumeration）**：
1. **统一错误文案**：账号不存在 / 密码错 → 同一句"用户名或密码错误"。
2. **🔑 响应时间等长**：账号不存在时也跑一次 **dummy bcrypt**（假哈希比对），消除"账号是否存在"的时间侧信道；LDAP 侧 search 无果也走统一返回。
3. **锁定提示用通用语**："尝试过多，请稍后再试"——与账号存在性无关。
4. 找回 / 激活接口同样统一文案。

```mermaid
sequenceDiagram
  participant U as 前端
  participant API as 认证服务
  participant R as Redis
  U->>API: 登录(账号+密码+验证码, use_ldap?)
  API->>R: 查 lock:{source}:{username} 锁定?
  alt 已锁定
    API-->>U: 尝试过多，请稍后再试(通用语)
  else 未锁定
    API->>API: 验证码校验(错→不计账号锁定，计 IP)
    API->>API: 查账号→密码校验(账号不存在也跑 dummy bcrypt 等时)
    alt 验密失败
      API->>R: INCR 账号计数(首次设窗TTL) + INCR IP 计数
      API->>R: 达阈值? → SET lock:{source}:{username} EX 锁定时长
      API-->>U: 用户名或密码错误(统一文案)
    else 成功
      API->>R: 清零账号计数
      API-->>U: 签发 AT/RT(转 §2)
    end
  end
```

**默认值（代码内置兜底，C2 可改）**：

| 来源 | 阈值 | 统计窗口 | 锁定时长 |
|---|---|---|---|
| 本地 | 5 次 | 5 min | 10 min |
| LDAP | 3 次 | 5 min | 15 min（且不超过租户 AD 锁定前） |

**LDAP 阈值为何压在租户 AD 策略之下**：LDAP 登录有两层计数器——业务自己的 + **AD 服务器内置的账号锁定策略**（不可控）。每发一次失败 bind，AD 那层 +1。若业务阈值 ≥ AD，会在业务锁人前**先被 AD 把域账号锁死**（波及该员工所有用 AD 的系统）。压在 AD 之下，业务**先挡住、不再向 AD 发失败 bind**，反而保护 AD 账号不被锁死，也防 DoS。

---

## 7. Redis 命名空间总表（汇总）

> 单 Redis、控制平面共享，**功能域前缀 + 租户段**分层；键内**不含项目名**（命名空间靠功能域前缀实现）。
> `plane` = `t:{tenant_code}`（租户面）或 `platform`（平台面）。租户作用域 key 统一带 `t:{tenant_code}` 段，便于按租户批量清理。

| 用途 | Key 模式 | TTL |
|---|---|---|
| 会话记录（撤销/轮换核心） | `{plane}:sess:{sid}` | = RT 滑动寿命（如 7d） |
| 每用户会话索引（SET of sid） | `{plane}:usess:{userId}` | 滑动续期 |
| 租户状态缓存（一刀切） | `tstatus:{tenant_code}` | 短（30–60s） |
| 验证码答案 | `captcha:{id}` | 120s |
| 激活/设密 token 主记录 | `authtoken:{purpose}:{sha256(token)}` | 激活 24h / 重置 30m |
| 激活/设密 token 单飞索引 | `authtoken:owner:{purpose}:{user_id}` | 同主记录 |
| 账号失败计数 | `{plane}:loginfail:{source}:{username}` | = 统计窗口 |
| IP 失败计数 | `loginfail:ip:{ip}` | = 统计窗口 |
| 锁定标记 | `{plane}:lock:{source}:{username}` | = 锁定时长 |

- **校验请求**：验 AT 签名+过期 → 查 `sess:{sid}` 存活 → 查 `tstatus:{tenant_code}` → 都过才放行。
- **租户销毁**：`SCAN t:{tenant_code}:*` 批量删该租户全部 redis 痕迹（键前缀与 SCAN 通配前缀须始终一致）。

---

## 8. 一期 做 / 不做（认证范围）

**一期做**：
- 会话与 JWT（AT/RT、会话中心化撤销、RT 轮换+重用检测）。
- 本地账号登录（bcrypt）+ LDAP/AD 登录（Search+Bind、不存密码、每租户配置）。
- 图形验证码（每次登录必带）。
- 激活/设密/重置密码 token（存哈希不存明文、一次性、单飞）。
- 登录失败锁定 + 防枚举（双维度、短时锁定、dummy bcrypt 等时）。

**一期不做 / ⏭️二期**：
- ⏭️ **MFA（多因素认证）**：TOTP / Passkey 二期。⚠️**等保三级"双因素"为一期缺口，二期由 MFA 补**（已接受风险）。
- ⏭️ 企业 SSO（OIDC/SAML）超出一期（一期企业身份仅 LDAP/AD）。
- ⏭️ 滑块/行为验证码、云厂商验证码（`CaptchaProvider` 扩展位）。
- ⏭️ LDAP 群组→角色自动映射（一期只认证、手工授权）。
- ⏭️ 验证码无障碍降级、风险驱动验证升级。

---

## 9. 关联决策（ADR）与外部出处

**ADR**：
- [ADR-0008](../architecture/decisions/0008-identity-login.md) — 身份与登录：路径式租户定位 + 本地/LDAP + 验证码（账号租户内独立）。
- 租户相关：见 [tenant.md](tenant.md) 关联 ADR。

**外部权威出处**（LDAP/安全）：
- go-ldap/v3：[pkg.go.dev](https://pkg.go.dev/github.com/go-ldap/ldap/v3)；空密码修复 [PR #126](https://github.com/go-ldap/ldap/pull/126)、[CVE-2017-14623 / GHSA-x27w-qxhg-343v](https://github.com/advisories/GHSA-x27w-qxhg-343v)
- OWASP：[LDAP Injection](https://cheatsheetseries.owasp.org/cheatsheets/LDAP_Injection_Prevention_Cheat_Sheet.html)、[SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)、[Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- 平台实现参考：[Grafana LDAP](https://grafana.com/docs/grafana/latest/setup-grafana/configure-access/configure-authentication/ldap/)、[GitLab LDAP](https://docs.gitlab.com/ee/administration/auth/ldap/)、[Keycloak LDAP](https://www.keycloak.org/docs/latest/server_admin/index.html)、[Authentik LDAP](https://docs.goauthentik.io/users-sources/sources/protocols/ldap/)
- AD 锁定叠加：[Netwrix Account Lockout Best Practices](https://netwrix.com/en/resources/guides/account-lockout-best-practices/)

---
↑ [返回 specs 索引](README.md)
