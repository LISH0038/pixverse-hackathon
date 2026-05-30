# StoryTree 技术实现路径 v2｜含卡点梳理与解法

> 配套 PRD v4 · 面向开发落地 · 重点：PixVerse 集成、角色稳定性、生成质量、卡点规避
> 基于 PixVerse 官方 OpenAPI 当前能力（异步、单段 5/8s、参考图锁脸、Fusion 多主体参考）

---

## 本次修订（v1 → v2）

- **主力生成接口改为 Fusion（Reference to Video）**：多张角色参考图 + prompt 直接出镜头，单角色镜头也走 Fusion（1 个 subject）。统一一条生成线。
- **删除末帧衔接 / Transition 接口**：短剧靠镜头硬切，不需要帧级衔接；人物/风格一致性由参考图保证，与衔接无关。`nodes` 不再存 `endFrameUrl`。
- **单段时长修正为 5s / 8s**：官方 API 只支持这两个值，原"5-15s / 5-10s"作废。更长内容靠多镜头拼接。
- **参考图规范**：传给 API 的是单张干净正脸，三视图仅团队内部定妆用。
- **参数/模型校准**：`motion_mode`（非 `fast_mode`）、模型用 C1 / V6 / v4.5，本项目不使用 fast。

---

## 0. 一句话技术现实（先认清）

PixVerse **不能**一次生成 30s 多镜头短剧。它是：**异步（出片约 90s）、单段 5s 或 8s、纯文字锁不住脸（必须喂参考图）、生成花 credits**。整套方案围绕这四个约束设计。

---

## 1. 两条生产线（最重要的顶层区分）

产品里有**两种视频**，形态、生产方式完全不同，必须分开设计：

| | A. 种子内容（团队预置） | B. 用户嫩芽（现场/用户生成） |
|---|---|---|
| 是什么 | 母片 V0 + 分支 V1/V2/V3 等，精致多镜头短剧 | 用户在某节点"续写"出的单个 5/8s 片段 |
| 谁做 | 团队赛前精心生产 | 用户/评委在生成弹窗里产生 |
| 形态 | 多镜头硬切拼接（V0 = 多镜约 30s+） | **单镜头** 5/8s（一次 Fusion 调用） |
| 锁脸 | 精调参考图 + 多备选，质量拉满 | 自动喂继承的角色参考图，够用即可 |
| 用途 | demo 主体 + 撑树骨架 + 吃 40% 视频分 | 演示"共创"机制的真功能 |

**关键认知**：用户单次生成 = 一个 5/8s 单镜头，不是一集短剧。这符合 UGC"轻量接龙"逻辑——用户接一个瞬间，不是拍一集。**PRD 必须写清这个区分**，否则开发会以为用户能一键生成多镜头剧。

---

## 2. 端到端数据流（用户生成一个分支的完整链路）

```
① 用户在节点点【＋】→ 打开生成弹窗
② 弹窗自动加载该节点的【继承资产包】
   （沿父链累积的角色参考图 img_id + ref_name、场景图、风格参数）
   弹窗显示"本分支继承：林夏✓ 陈翊✓ 暴雪街头✓"，用户可勾选本镜出场的角色
③ 用户编辑预填的 prompt（用 @名字 调用出场角色）+ 风格默认继承
④ 点【生成(5 token)】
   → 前端调后端 → 后端组装 image_references 数组（出场角色=subject、场景=background）
   → 调 PixVerse Fusion API（/openapi/v2/video/fusion/generate）
   → 返回 generation_id（异步任务已提交）
⑤ 前端轮询状态（每 5-10s 查一次）
   → status: 5(生成中) → 1(成功) / 7(审核失败) / 8(失败)
⑥ 成功 → 返回 video_url → 弹窗预览
⑦ 不满意 → 【Shuffle】重新生成（换 seed，再调一次）
⑧ 满意 → 【使用】→ 二次确认 → 新节点入树
   → 新节点继承父链资产，自身 ownAssetIds 默认为空（用已有角色，不凭空加新人）
```

**注意 ②④⑤ 是技术核心**：资产继承（保一致）、组装 Fusion 引用数组、异步提交 + 轮询（处理 90s 延迟）。**本版无末帧、无 Transition**——镜头之间是叙事切换，不做帧衔接。

---

## 3. ★卡点 1：90 秒生成延迟（最大的坑）

异步 API 出片约 90s。demo 现场让评委干等 90s = 致命。两种解法：

### 方案 A — 预生成 + 拟实时（demo 主推，最稳）
- 把 demo 脚本里评委会触发的生成结果**全部提前生成好**，按"父节点 + 预期 prompt"映射存储。
- 评委点【生成】→ 播 3-5s 精心设计的 loading 动画（"AI 正在构思分支…"）→ 返回预生成结果。
- 体验上是实时，实际放预制片。**成熟 AI demo 都这么做，不丢人。**
- 配套：Shuffle 也预生成 2-3 个备选，让"换一版"也即时。

### 方案 B — 真调 API 一次（答辩亮点，证明"真的接了"）
- 答辩时真调一次 Fusion API，用 **540p / 5s / normal**（本项目不用 fast）压到尽量快。
- 90s 等待期用来讲架构 / 商业模式，时间填满，反而显专业。
- 只演示一次，作为"我们真接了 PixVerse API"的硬证明。

**结论：demo 主体用 A，答辩留一次 B。** 黑客松视频类项目的标准打法。

---

## 4. ★卡点 2：长视频 = 分镜分段生成 + 硬切拼接（团队预置内容）

种子内容（V0 等）30s+ 多镜头，单段最长 8s，必须分段：

- **分段**：一个分镜镜头 = 一次生成（分镜本就按 5-8s 切，直接对应）。
- **段间处理**：**镜头硬切**，按叙事顺序排列即可，**不做帧级衔接**（短剧本就靠切镜推进，不需要 Transition）。
- **拼接**：用 ffmpeg 把多段 mp4 顺序合成一条 + 加字幕/配乐（后期，不进产品）。
- **每镜用 Fusion 生成**：把这一镜出场的角色（subject）+ 场景（background）参考图组进 image_references，保证跨镜头人物一致。
- **工作量预警**：V0 多镜 = 多次生成 + 调参 + 挑片 + 拼接。**这是赛前最大工作量，越早开工越好。**

---

## 5. ★角色稳定性 + 以分支为单位的资产库（核心：脸怎么稳）

纯文字必漂脸。稳定靠 **参考图 + 固定关键词 + 负向提示** 三件套，由**以分支为单位的资产库**自动喂给每次 Fusion 生成。**一致性来自参考图，与帧衔接无关——这是本版能删掉末帧的根据。**

### 5.1 数据建模（归一化两表 + 运行时继承）

**核心决策：资产独立成库，节点只存引用 id（不内嵌）。** 同一个角色被几十个节点引用，独立成库 = 单一数据源、去重、好维护。

**表 1 · `assets`（资产库，所有资产存一份）**
每个角色资产带一个 `refName`（英文 token，供 prompt 里 @调用）。

```json
{
  "asset_lx": {
    "assetId": "asset_lx",
    "type": "character",
    "name": "林夏",
    "refName": "linxia",
    "pixverseImgId": "img_10086",
    "refImageUrl": "/assets/ref/linxia_front.png",
    "promptPrefix": "A 28-year-old East Asian woman, shoulder-length straight black hair, oval face, cold pale skin, sharp calm eyes, tailored dark grey business suit",
    "negativePrompt": "no changing outfit, no different face, no extra person",
    "introducedBy": "node_V0"
  },
  "asset_cy": { "assetId":"asset_cy","type":"character","name":"陈翊","refName":"chenyi","pixverseImgId":"img_10087","refImageUrl":"/assets/ref/chenyi_front.png","promptPrefix":"A 32-year-old East Asian man, neat short hair, sharp navy suit, arrogant","negativePrompt":"no different face, no extra person","introducedBy":"node_V0" },
  "asset_meteor": { "assetId":"asset_meteor","type":"character","name":"气象学家","refName":"meteorologist","pixverseImgId":"img_10088","refImageUrl":"/assets/ref/meteor_front.png","promptPrefix":"A 45-year-old East Asian man, messy greying hair, glasses, beige cardigan, weary","introducedBy":"node_V3" },
  "asset_scene_meeting": { "assetId":"asset_scene_meeting","type":"scene","name":"玻璃会议室","refName":"meetingroom","pixverseImgId":"img_20001","introducedBy":"node_V0" },
  "asset_scene_blizzard": { "assetId":"asset_scene_blizzard","type":"scene","name":"暴雪街头","refName":"blizzard","pixverseImgId":"img_20002","introducedBy":"node_V0" },
  "asset_scene_lab": { "assetId":"asset_scene_lab","type":"scene","name":"昏暗实验室","refName":"lab","pixverseImgId":"img_20003","introducedBy":"node_V3" },
  "asset_scene_chentower": { "assetId":"asset_scene_chentower","type":"scene","name":"陈家大楼内部","refName":"chentower","pixverseImgId":"img_20004","introducedBy":"node_V4" },
  "asset_style_main": { "assetId":"asset_style_main","type":"style","name":"寒潮主风格","promptPrefix":"vertical 9:16, cinematic short-drama, high contrast, teal-and-cold-blue grading, shallow DOF, 4k, film grain","introducedBy":"node_V0" }
}
```

**表 2 · `nodes`（剧情树，只存资产 id 引用，无末帧字段）**

```json
{
  "node_V0": {
    "nodeId":"node_V0", "parentId":null, "title":"母片·重生",
    "videoUrl":"/assets/V0.mp4",
    "ownAssetIds":["asset_lx","asset_cy","asset_scene_meeting","asset_scene_blizzard","asset_style_main"],
    "likes":0,"impressions":0,"status":"alive"
  },
  "node_V1": {
    "nodeId":"node_V1","parentId":"node_V0","title":"救世线",
    "videoUrl":"/assets/V1.mp4",
    "ownAssetIds":[], "likes":134,"impressions":980,"status":"alive"
  },
  "node_V3": {
    "nodeId":"node_V3","parentId":"node_V0","title":"阴谋线",
    "videoUrl":"/assets/V3.mp4",
    "ownAssetIds":["asset_meteor","asset_scene_lab"], "likes":18,"impressions":760,"status":"endangered"
  },
  "node_V4": {
    "nodeId":"node_V4","parentId":"node_V1","title":"潜入陈家楼",
    "videoUrl":"/assets/V4.mp4",
    "ownAssetIds":["asset_scene_chentower"], "likes":0,"impressions":0,"status":"alive"
  }
}
```

**核心逻辑 · 继承资产 = 沿父链累积（运行时算，不存死）**

```javascript
// 某节点可用的全部资产 = 从它到根这条路径上所有 ownAssetIds 的并集
function getAvailableAssets(nodeId, nodes, assets) {
  const ids = new Set();
  let cur = nodes[nodeId];
  while (cur) {
    (cur.ownAssetIds || []).forEach(id => ids.add(id));
    cur = cur.parentId ? nodes[cur.parentId] : null;
  }
  return [...ids].map(id => assets[id]);
}
```

**三个关键好处：**
1. **继承不存死、运行时算**：祖先改资产，子孙自动最新，单一数据源无需同步。树浅（demo 2-3 层）性能无忧。
2. **"只继承祖先链、拿不到兄弟分支"自动成立**：V3 父链是 V3→V0，爬不到 V1，所以拿不到 V4 的陈家大楼。规则由树结构天然保证，**不用额外写权限逻辑**。
3. **风格走同一套继承机制**：风格作为 `type:style` 资产，与角色一起沿父链继承，统一。**不再有末帧字段**——衔接需求已移除。

### 5.2 锁脸三件套（每次 Fusion 生成都带）
1. **参考图**：对每个出场角色，传其 `pixverseImgId` 作为 Fusion 的 subject 引用（最强锚点）。
2. **固定关键词顺序**：用 asset 的 `promptPrefix`，顺序永不打乱。
3. **负向提示**：用 asset 的 `negativePrompt` 排除漂移。

### 5.3 单角色与多角色同框：统一走 Fusion

Fusion（Reference to Video）一次接收**多张参考图**，每张标 `type`（subject / background）+ `img_id` + `ref_name`，在 prompt 里用 `@ref_name` 调用，模型把它们组合成一个一致的镜头。本项目把单角色镜头也走 Fusion（1 个 subject），统一一条生成线。

**组装规则（后端，从 getAvailableAssets 结果生成）：**
- 本镜出场的每个 `type:character` 资产 → `{ type:"subject", img_id, ref_name }`
- 当前场景的 `type:scene` 资产（可选）→ `{ type:"background", img_id, ref_name }`
- prompt = 风格前缀 + 各角色 promptPrefix（锁定不可删）+ 用户写的动作描述（用 @ref_name 指代角色/场景）
- negative_prompt = 各角色 negativePrompt 合并

**请求示例（同框二人）：**
```json
{
  "image_references": [
    { "type":"subject",    "img_id": 10086, "ref_name":"linxia" },
    { "type":"subject",    "img_id": 10087, "ref_name":"chenyi" },
    { "type":"background", "img_id": 20001, "ref_name":"meetingroom" }
  ],
  "prompt": "@linxia coldly tears the cheque in front of @chenyi inside @meetingroom, ...(+角色锁定前缀+风格)",
  "model": "v4.5",
  "duration": 5,
  "quality": "540p",
  "aspect_ratio": "9:16",
  "seed": 123456789
}
```

> Fusion 支持多张参考图（角色 + 物体 + 背景），用 @ref_name 在 prompt 中指代。参考图要单主体清晰、正脸、干净背景。单角色镜头就只传 1 个 subject。

### 5.4 产品里怎么自动保证（答辩亮点）
- 用户点某节点"续写" → `getAvailableAssets(nodeId)` 返回继承资产 → 弹窗显示"本分支继承：林夏✓ 陈翊✓ 暴雪街头✓"，可勾选本镜出场角色。
- 生成时后端自动把出场角色的 `pixverseImgId` 组成 `image_references`，并把 `promptPrefix` / `negativePrompt` 随请求发出。
- 用户改的是**动作/剧情**（用 @名字 指代谁做什么），角色身份前缀**锁定不可删**。
- 效果：用户不用懂锁脸，系统自动喂参考图 → 生成自然和这条分支前文一致。**"剧情树存的是视觉血缘"——技术亮点也是答辩故事。**

### 5.5 demo 存储
不做后端 DB，两个 JSON 文件 `assets.json` + `nodes.json` 放前端，内存里跑 `getAvailableAssets`。够 demo 用，也方便手动编预置树。本版只做"继承不新增"（用户用已有角色，不凭空加新人），新增资产是产品愿景，答辩口述。

---

## 6. ★提高生成质量的具体手段

1. **参考图质量决定一切**：定妆图要高清、正脸、清晰五官、干净背景、均匀光线、单主体孤立。三视图仅团队内部统一角色设计用；**传给 API 的是从中裁出的单张正脸**，不要直接喂三视图拼图（模型可能误判成多人）。
2. **分辨率分级**：demo 展示用 720p/1080p；现场真生成用 540p 抢速度；最终成片可外接 upscaler 到 4K。
3. **seed 固定**：满意的镜头记下 seed，重生成/微调时复用，减少随机漂移。Shuffle = 换 seed。
4. **镜头简单化**：单段别塞太多动作（"furrow brow then turn then walk"易崩）。一段一个主要动作，复杂叙事靠分段。
5. **运镜用参数而非文字**：`camera_movement` 参数控制运镜比写 prompt 稳。**注意**：官方文档标注 camera_movement 支持 v4/v4.5，换 C1/V6 前需在该模型上实测是否生效。
6. **负向提示压瑕疵**：no sudden movement, no distorted face, no extra fingers, no flicker。
7. **模型选型**：动作/分镜/角色连续性强的镜头用 **C1**（适合动作编排、分镜到视频、角色一致）；对话/单人通用镜头用 **V6**（通用、时序稳）。Fusion 支持 C1 / V6 / v4.5。
8. **批量多生成挑优**：每个关键镜头生成 2-3 版挑最好，别指望一次过。

---

## 7. 用户在生成弹窗里到底输入什么

**必填/默认带：**
- prompt（预填父分支 prompt，可改）—— 用户主要改这里，用 @名字 指代出场角色
- 继承资产（角色 img_id + ref_name / 场景 / 风格）—— 系统自动带，用户不用管
- 锁定的角色身份前缀 —— 不可删

**可选：**
- 勾选本镜出场角色（默认带主角）
- 选时长（**5s / 8s**）、运镜（下拉）、风格（默认继承）

**用户体验目标**：用户**只需要写一句"接下来发生什么"**，其余系统全自动。门槛越低，生成越多，越符合"赚 token"的商业模式。

---

## 8. 技术架构（TRAE 搭建）

```
前端 (React, TRAE生成)
  ├─ StoryTreeGraph (react-flow 横向树)
  ├─ 生成弹窗 (调后端生成接口 + 轮询)
  └─ 播放器/like/付费UI
        ↓ HTTP
后端 (轻量 Node/Python, 代理API + 存资产)
  ├─ /generate → 组装 image_references → 调 PixVerse Fusion，存任务
  ├─ /status/:id → 轮询 PixVerse 状态
  ├─ 资产库 (assets.json + nodes.json，getAvailableAssets 算继承)
  └─ API-KEY 藏在后端（绝不放前端）
        ↓ HTTPS
PixVerse OpenAPI (https://app-api.pixverse.ai)
  ├─ /openapi/v2/image/upload          (上传参考图，拿 img_id)
  ├─ /openapi/v2/video/fusion/generate (★主力：多主体参考生视频)
  └─ /openapi/v2/video/result/{id}     (轮询生成状态)
```

**主力线只有一条**：Upload Image 拿 img_id → 沿父链取角色资产 → Fusion 生成 → 轮询 → 回显。
**退场接口**：img2video（单图首帧）、Transition（首尾帧衔接）本版不用，可在答辩中作为"我们对比过的其他路径"一句带过。
**关键**：API-KEY 必须在后端，不能暴露在前端。demo 阶段后端可极简，重点是把"前端→后端→Fusion→轮询→回显"这条链路打通一次（哪怕只为方案 B 那一次真生成）。

---

## 9. 卡点总清单（一眼看全）

| 卡点 | 影响 | 解法 |
|---|---|---|
| 生成 90s 延迟 | demo 干等 | 预生成拟实时(A) + 答辩真调一次(B) |
| 单段 ≤8s | 长剧要拼 | 分镜 = 分段，ffmpeg 顺序拼接，镜头硬切不做帧衔接 |
| 纯文字漂脸 | 角色不一致 | 参考图(Fusion subject) + 固定前缀 + 负向提示三件套 |
| 同框多角色脸都要稳 | 一张参考图锁不住多人 | Fusion 传多张 subject，@ref_name 指代 |
| 新角色无参考图 | 用户加新人脸会漂 | demo 限用已有角色；产品愿景讲"首次生成存为资产" |
| 参考图要先传拿 img_id | 多一步 | 资产赛前预传，存 img_id 备用 |
| 审核失败(status 7) | 生成中断 | 前端兜底提示 + 重试 |
| 生成烧 credits | 真生成花钱 | 现场用预生成，真生成限一次 |
| API-KEY 暴露 | 安全 | 必须后端代理 |
| 多段拼接工作量大 | 赛前时间紧 | 最先开工；demo 保 V0+V1 完整，其余缩镜头 |

---

## 10. 落地里程碑（技术视角，按依赖）

| 序 | 任务 | 卡点关联 | 优先级 |
|---|---|---|---|
| 1 | 生成全部定妆图/场景图（单张正脸），上传 PixVerse 拿 img_id，建资产库 | 角色稳定性地基 | 最高，最先 |
| 2 | 跑通一次 Fusion API：组装 image_references + 调用 + 轮询 + 回显（验证链路） | 90s 延迟、架构 | 最高 |
| 3 | 团队分镜生成 V0+V1 各镜头（每镜 Fusion），ffmpeg 硬切拼接成片 | 长视频拼接 | P0 |
| 4 | TRAE 搭前端：横向树 + 节点 + 播放 | — | P0 |
| 5 | 生成弹窗：继承资产自动组装 image_references + prompt 预填 + 出场角色勾选 + 轮询 UI | 用户输入、自动锁脸 | P0 |
| 6 | 预生成 demo 会用到的"用户生成结果"（方案 A） | 90s 延迟 | P0 |
| 7 | like/drop/健康度 + mock 数据 | — | P0 |
| 8 | 生成 V2/V3（含气象学家资产） | — | P1 |
| 9 | 答辩真调一次 Fusion API（方案 B，540p/5s/normal） | 90s 延迟亮点 | P1 |
| 10 | 联调 + 录屏兜底 | — | 必做 |

**最关键的两件事**：里程碑 1（资产库地基，决定一致性）和里程碑 2（跑通一次 Fusion，决定可行性）。这两个不通，后面全是空中楼阁——**第一天就该把这两件事做掉**。

---

## 11. 给答辩的技术亮点（呼应 40% 视频 + 30% TRAE）

1. **视觉血缘资产库**：剧情树每节点继承祖先的角色/场景参考图，生成时自动组装成 Fusion 多主体引用——一致性是系统保证而非碰运气。
2. **真接 PixVerse Fusion API**：现场演示一次真生成（方案 B），证明不是套壳。
3. **多主体参考 → 同框一致**：用 @ref_name 把多个角色锁进同一镜头，"用户在别人创作上微调衍生"有了技术支点。
4. **TRAE 搭出复杂的横向剧情树可视化 + 异步生成轮询 UI**——展示 TRAE 处理复杂前端的能力。
