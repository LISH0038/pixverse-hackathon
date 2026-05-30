# StoryTree 技术实现路径｜含卡点梳理与解法

> 配套 PRD v4 · 面向开发落地 · 重点：PixVerse 集成、角色稳定性、生成质量、卡点规避
> 基于 PixVerse 当前 API 能力（异步、单段5-15s、参考图锁脸、首尾帧、多主体融合）

---

## 0. 一句话技术现实（先认清）

PixVerse **不能**一次生成你的 30s 多镜头短剧。它是：**异步（出片约90s）、单段5-15s、纯文字锁不住脸（必须喂参考图）、生成要花 credits**。整套技术方案都是围绕这四个约束设计的。

---

## 1. 两条生产线（最重要的顶层区分）

产品里有**两种视频**，形态、生产方式完全不同，必须分开设计：

| | A. 种子内容（团队预置） | B. 用户嫩芽（现场/用户生成） |
|---|---|---|
| 是什么 | 母片V0 + 分支V1/V2/V3 等，精致多镜头短剧 | 用户在某节点"续写"出的单个5-10s片段 |
| 谁做 | 团队赛前精心生产 | 用户/评委在生成弹窗里产生 |
| 形态 | 多镜头拼接（V0=9镜约36s） | **单镜头**5-10s（一次API调用） |
| 锁脸 | 精调参考图+多备选，质量拉满 | 自动喂继承的资产图，够用即可 |
| 用途 | demo 主体 + 撑起树的骨架 + 吃40%视频分 | 演示"共创"机制的真功能 |

**关键认知**：用户单次生成 = 一个5-10s单镜头，不是一集短剧。这反而符合UGC"轻量接龙"的产品逻辑——用户接一个瞬间，不是拍一集。**PRD 要明确写清这个区分**，否则开发会以为用户能一键生成多镜头剧。

---

## 2. 端到端数据流（用户生成一个分支的完整链路）

```
① 用户在节点点【＋】→ 打开生成弹窗
② 弹窗自动加载该节点的【继承资产包】
   （父链上的角色参考图img_id、场景图、风格参数、父节点末帧）
③ 用户编辑预填的prompt（可微调）+ 可选上传参考图
④ 点【生成(5token)】
   → 前端调后端 → 后端调PixVerse img2video API
   → API返回 generation_id（异步任务已提交）
⑤ 前端轮询状态（每5-10s查一次 status）
   → status: 5(生成中) → 1(成功) / 7(审核失败) / 8(失败)
⑥ 成功 → 返回video_url → 弹窗预览
⑦ 不满意 → 【Shuffle】重新生成（换seed，再调一次）
⑧ 满意 → 【使用】→ 二次确认 → 新节点入树
   → 自动把本次视频末帧存为新节点的"末帧资产"
```

**注意 ②④⑤ 是技术核心**：资产继承（保一致）、异步提交、轮询（处理90s延迟）。

---

## 3. ★卡点 1：90秒生成延迟（最大的坑）

异步API出片约90s。demo现场让评委干等90s = 致命。三种解法：

### 方案 A — 预生成 + 拟实时（demo 主推，最稳）
- 把 demo 脚本里评委会触发的生成结果**全部提前生成好**，按"父节点+预期prompt"映射存储。
- 评委点【生成】→ 播 3-5s 精心设计的 loading 动画（"AI 正在构思分支…"）→ 返回预生成结果。
- 体验上是实时，实际放预制片。**所有成熟 AI demo 都这么做，不丢人。**
- 配套：Shuffle 也预生成2-3个备选，让"换一版"也即时。

### 方案 B — 真调API一次（答辩亮点，证明"真的接了")
- 答辩时真调一次 API，用 `fast_mode=true` + 540p 压到最快。
- 90s等待期用来讲解架构/商业模式，时间填满，反而显专业。
- 只演示一次，作为"我们真接了 PixVerse API"的硬证明。

### 方案 C — 候选池匹配（折中）
- 预生成一批片段，用户生成时按prompt相似度返回最匹配的。技术比A重，黑客松不推荐。

**结论：demo 主体用 A，答辩留一次 B。** 这是黑客松视频类项目的标准打法。

---

## 4. ★卡点 2：长视频 = 分段生成 + 拼接（团队预置内容）

种子内容（V0等）30s+多镜头，单段最长15s，必须分段：

- **分段**：一个分镜镜头 = 一次API生成（你的分镜本就按4-6s切，直接对应）。
- **段间衔接**：用 **Transition(首尾帧)接口** —— 前一镜末帧作为后一镜首帧，画面接得上。<PixVerse 支持 first-last frame transition>
- **拼接**：用 ffmpeg 把多段mp4合成一条 + 加字幕/配乐（后期，不进产品）。
- **工作量预警**：V0(9镜)=9次生成+调参+挑片+拼接。**这是赛前最大工作量，越早开工越好。**

---

## 5. ★角色稳定性 + 以分支为单位的资产库（你最关心的"脸稳定"）

纯文字必漂脸。稳定靠**参考图 + 固定关键词 + 负向提示**三件套，并由**以分支为单位的资产库**自动喂给每次生成。

### 5.1 数据建模（最终版，归一化两表 + 继承计算）

**核心决策：资产独立成库，节点只存引用 id（不内嵌）。** 同一个角色（林夏）被几十个节点引用，内嵌会重复存、改一处要改几十处；独立成库 = 单一数据源、去重、好维护。

**表 1 · `assets`（资产库，所有资产存一份）**
```json
{
  "asset_lx": {
    "assetId": "asset_lx",
    "type": "character",
    "name": "林夏",
    "pixverseImgId": "img_10086",
    "refImageUrl": "/assets/ref/linxia_front.png",
    "promptPrefix": "A 28-year-old East Asian woman, shoulder-length straight black hair, oval face, cold pale skin, sharp calm eyes, tailored dark grey business suit",
    "negativePrompt": "no changing outfit, no different face, no extra person",
    "introducedBy": "node_V0"
  },
  "asset_cy": { "assetId":"asset_cy","type":"character","name":"陈翊","pixverseImgId":"img_10087","promptPrefix":"A 32-year-old East Asian man, neat short hair, sharp navy suit, arrogant","introducedBy":"node_V0" },
  "asset_meteor": { "assetId":"asset_meteor","type":"character","name":"气象学家","pixverseImgId":"img_10088","promptPrefix":"A 45-year-old East Asian man, messy greying hair, glasses, beige cardigan, weary","introducedBy":"node_V3" },
  "asset_scene_meeting": { "assetId":"asset_scene_meeting","type":"scene","name":"玻璃会议室","pixverseImgId":"img_20001","introducedBy":"node_V0" },
  "asset_scene_blizzard": { "assetId":"asset_scene_blizzard","type":"scene","name":"暴雪街头","pixverseImgId":"img_20002","introducedBy":"node_V0" },
  "asset_scene_lab": { "assetId":"asset_scene_lab","type":"scene","name":"昏暗实验室","pixverseImgId":"img_20003","introducedBy":"node_V3" },
  "asset_scene_chentower": { "assetId":"asset_scene_chentower","type":"scene","name":"陈家大楼内部","pixverseImgId":"img_20004","introducedBy":"node_V4" },
  "asset_style_main": { "assetId":"asset_style_main","type":"style","name":"寒潮主风格","promptPrefix":"vertical 9:16, cinematic short-drama, high contrast, teal-and-cold-blue grading, shallow DOF, 4k, film grain","introducedBy":"node_V0" }
}
```

**表 2 · `nodes`（剧情树，只存资产 id 引用 + 末帧字段）**
```json
{
  "node_V0": {
    "nodeId":"node_V0", "parentId":null, "title":"母片·重生",
    "videoUrl":"/assets/V0.mp4", "endFrameUrl":"/assets/V0_end.png",
    "ownAssetIds":["asset_lx","asset_cy","asset_scene_meeting","asset_scene_blizzard","asset_style_main"],
    "likes":0,"impressions":0,"status":"alive"
  },
  "node_V1": {
    "nodeId":"node_V1","parentId":"node_V0","title":"救世线",
    "videoUrl":"/assets/V1.mp4","endFrameUrl":"/assets/V1_end.png",
    "ownAssetIds":[], "likes":134,"impressions":980,"status":"alive"
  },
  "node_V3": {
    "nodeId":"node_V3","parentId":"node_V0","title":"阴谋线",
    "videoUrl":"/assets/V3.mp4","endFrameUrl":"/assets/V3_end.png",
    "ownAssetIds":["asset_meteor","asset_scene_lab"], "likes":18,"impressions":760,"status":"endangered"
  },
  "node_V4": {
    "nodeId":"node_V4","parentId":"node_V1","title":"潜入陈家楼",
    "videoUrl":"/assets/V4.mp4","endFrameUrl":"/assets/V4_end.png",
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

**这套设计的三个关键好处：**
1. **继承不存死、运行时算**：祖先改资产，子孙自动最新，单一数据源无需同步。树浅（demo 2-3层）性能无忧。
2. **"只继承祖先链、拿不到兄弟分支"自动成立**：V3 父链是 V3→V0，爬不到 V1，所以拿不到 V4 的陈家大楼。规则由树结构天然保证，**不用额外写权限逻辑**。
3. **末帧不进资产库**：`endFrameUrl` 只给直接子节点做首帧衔接，不跨节点共享，放节点自己字段；风格则作为 `type:style` 的资产，与角色走同一套继承机制，统一。

### 5.2 锁脸三件套（每次生成都带）
1. **参考图**：img2video 必传对应角色的 `pixverseImgId`（最强锚点）。
2. **固定关键词顺序**：用 asset 的 `promptPrefix`，顺序永不打乱。
3. **负向提示**：用 asset 的 `negativePrompt` 排除漂移。

### 5.3 同框多角色
男女主同框镜头用 **Fusion/多主体融合**，最多锁3个角色，各传各自 `pixverseImgId`。

### 5.4 产品里怎么自动保证（答辩亮点）
- 用户点某节点"续写" → `getAvailableAssets(nodeId)` 返回继承资产 → 弹窗显示"本分支继承：林夏✓ 陈翊✓ 暴雪街头✓"。
- 生成时把这些 `pixverseImgId` + `promptPrefix` + `negativePrompt` 自动随请求发给 API。
- 用户改的是**动作/剧情**，角色身份前缀**锁定不可删**。
- 效果：用户不用懂锁脸，系统自动喂参考图 → 生成自然和这条分支前文一致。**"剧情树存的是视觉血缘"——技术亮点也是答辩故事。**

### 5.5 demo 存储
不做后端 DB，两个 JSON 文件 `assets.json` + `nodes.json` 放前端，内存里跑 `getAvailableAssets`。够 demo 用，也方便手动编预置树。本版只做"继承不新增"（用户用已有角色，不凭空加新人），新增资产是产品愿景，答辩口述。

---

## 6. ★提高生成质量的具体手段

1. **参考图质量决定一切**：定妆图要高清、正脸、清晰五官、干净背景、均匀光线。<参考图越清晰锁定越强> 先单出高清正面，再做三视图。
2. **分辨率分级**：demo 展示用 720p/1080p；现场真生成用 540p+fast_mode 抢速度；最终成片可外接 upscaler 到4K。
3. **seed 固定**：满意的镜头记下 seed，重生成/微调时复用，减少随机漂移。Shuffle = 换seed。
4. **镜头简单化**：单段别塞太多动作（"furrow brow then turn then walk"易崩）。一段一个主要动作，复杂叙事靠分段。
5. **运镜用参数而非文字**：用 `camera_movement: zoom_in` 等API参数控制运镜，比写在prompt里稳。
6. **负向提示压瑕疵**：no sudden movement, no distorted face, no extra fingers, no flicker。
7. **C1模型优先**：短剧/动作场景用C1（专为短剧多镜头一致性设计）；对话/单人镜头可用v5.6。
8. **批量多生成挑优**：每个关键镜头生成2-3版挑最好，别指望一次过。

---

## 7. 用户在生成弹窗里到底输入什么（你问的）

**必填/默认带：**
- prompt（预填父分支prompt，可改）—— 用户主要改这里
- 继承资产（角色img_id/场景/风格）—— 系统自动带，用户不用管
- 锁定的角色身份前缀 —— 不可删

**可选：**
- 上传自己的参考图（进阶，demo可不开放）
- 选时长（5/8/10s）、运镜（下拉）、风格（默认继承）

**用户体验目标**：用户**只需要写一句"接下来发生什么"**，其余系统全自动。门槛越低，生成越多，越符合"赚token"的商业模式。

---

## 8. 技术架构（TRAE 搭建）

```
前端 (React, TRAE生成)
  ├─ StoryTreeGraph (react-flow 横向树)
  ├─ 生成弹窗 (调后端生成接口 + 轮询)
  └─ 播放器/like/付费UI
        ↓ HTTP
后端 (轻量 Node/Python, 代理API + 存资产)
  ├─ /generate → 调 PixVerse img2video，存任务
  ├─ /status/:id → 轮询PixVerse状态
  ├─ 资产库 (节点→img_id映射，可先用JSON/内存)
  └─ API-KEY 藏在后端（绝不放前端）
        ↓ HTTPS
PixVerse OpenAPI
  ├─ /openapi/v2/video/img/generate (图生视频)
  ├─ /openapi/v2/video/transition (首尾帧衔接)
  └─ Fusion (多主体融合)
```

**关键**：API-KEY 必须在后端，不能暴露在前端代码里。demo 阶段后端可以极简（甚至本地起一个），重点是把"前端→后端→PixVerse→轮询→回显"这条链路打通一次（哪怕只为方案B那一次真生成）。

---

## 9. 卡点总清单（一眼看全）

| 卡点 | 影响 | 解法 |
|---|---|---|
| 生成90s延迟 | demo干等 | 预生成拟实时(A) + 答辩真调一次(B) |
| 单段≤15s | 长剧要拼 | 分镜=分段，ffmpeg拼接，首尾帧衔接 |
| 纯文字漂脸 | 角色不一致 | 参考图+固定前缀+负向提示三件套 |
| 新角色无参考图 | 用户加新人脸会漂 | demo限用已有角色；产品愿景讲"首次生成存为资产" |
| 参考图要先传拿img_id | 多一步 | 资产赛前预传，存img_id备用 |
| 审核失败(status7) | 生成中断 | 前端兜底提示+重试 |
| 生成烧credits | 真生成花钱 | 现场用预生成，真生成限一次 |
| API-KEY暴露 | 安全 | 必须后端代理 |
| 多段拼接工作量大 | 赛前时间紧 | 最先开工；demo保V0+V1完整，其余缩镜头 |

---

## 10. 落地里程碑（技术视角，按依赖）

| 序 | 任务 | 卡点关联 | 优先级 |
|---|---|---|---|
| 1 | 生成全部定妆图/场景图，上传PixVerse拿img_id，建资产库 | 角色稳定性地基 | 最高，最先 |
| 2 | 跑通一次API：img2video调用+轮询+回显（验证链路） | 90s延迟、架构 | 最高 |
| 3 | 团队分段生成V0+V1所有镜头，ffmpeg拼接成片 | 长视频拼接 | P0 |
| 4 | TRAE搭前端：横向树+节点+播放 | — | P0 |
| 5 | 生成弹窗：继承资产自动带入+prompt预填+轮询UI | 用户输入、自动锁脸 | P0 |
| 6 | 预生成demo会用到的"用户生成结果"（方案A） | 90s延迟 | P0 |
| 7 | like/drop/健康度 + mock数据 | — | P0 |
| 8 | 生成V2/V3（含气象学家资产） | — | P1 |
| 9 | 答辩真调一次API（方案B）+ fast_mode调优 | 90s延迟亮点 | P1 |
| 10 | 联调+录屏兜底 | — | 必做 |

**最关键的两件事**：里程碑1（资产库地基，决定一致性）和里程碑2（跑通一次API，决定可行性）。这两个不通，后面全是空中楼阁——**第一天就该把这两件事做掉**。

---

## 11. 给答辩的技术亮点（呼应40%视频+30%TRAE）

1. **视觉血缘资产库**：剧情树每节点继承祖先的角色/场景参考图，生成自动锁脸——一致性是系统保证而非碰运气。
2. **真接 PixVerse API**：现场演示一次真生成（方案B），证明不是套壳。
3. **分镜=分段=API调用**的工程化流水线：把"30s短剧"拆成可控的5-10s单元生产再拼接。
4. **TRAE 搭出复杂的横向剧情树可视化 + 异步生成轮询UI**——展示TRAE处理复杂前端的能力。
