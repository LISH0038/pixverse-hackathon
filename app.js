const media = {
  linxia: "@linxia.png",
  chenyi: "@chenyi.png",
  meetingroom: "玻璃会议室.png",
  blizzard: "暴雪街头.png",
  preview: "PixVerse_V6_Image_Text_720P_【画面000004｜冷开场死亡闪回】.mp4",
};

const assets = {
  asset_lx: {
    assetId: "asset_lx",
    type: "character",
    name: "林夏",
    refName: "linxia",
    pixverseImgId: 875295974,
    refImageUrl: media.linxia,
    promptPrefix:
      "A 28-year-old East Asian woman, shoulder-length straight black hair, oval face, cold pale skin, sharp calm eyes, tailored dark grey business suit",
    negativePrompt: "no changing outfit, no different face, no extra person",
  },
  asset_cy: {
    assetId: "asset_cy",
    type: "character",
    name: "陈翊",
    refName: "chenyi",
    pixverseImgId: 875295975,
    refImageUrl: media.chenyi,
    promptPrefix:
      "A 32-year-old East Asian man, neat short hair, sharp navy suit, arrogant and restrained",
    negativePrompt: "no different face, no extra person, no casual clothes",
  },
  asset_meteor: {
    assetId: "asset_meteor",
    type: "character",
    name: "气象学家",
    refName: "meteorologist",
    pixverseImgId: 875295976,
    refImageUrl: media.meetingroom,
    promptPrefix:
      "A 45-year-old East Asian meteorologist, messy greying hair, glasses, tired eyes, beige cardigan",
    negativePrompt: "no young face, no different glasses, no extra person",
  },
  asset_scene_meeting: {
    assetId: "asset_scene_meeting",
    type: "scene",
    name: "玻璃会议室",
    refName: "meetingroom",
    pixverseImgId: 20001,
    refImageUrl: media.meetingroom,
  },
  asset_scene_blizzard: {
    assetId: "asset_scene_blizzard",
    type: "scene",
    name: "暴雪街头",
    refName: "blizzard",
    pixverseImgId: 20002,
    refImageUrl: media.blizzard,
  },
  asset_scene_lab: {
    assetId: "asset_scene_lab",
    type: "scene",
    name: "昏暗实验室",
    refName: "lab",
    pixverseImgId: 20003,
    refImageUrl: media.meetingroom,
  },
  asset_style_main: {
    assetId: "asset_style_main",
    type: "style",
    name: "寒潮主风格",
    refName: "coldwave",
    promptPrefix:
      "vertical 9:16, cinematic short-drama, high contrast, cold winter light, shallow depth of field, film grain, tense revenge drama mood",
  },
};

let nodes = {
  node_V0: {
    nodeId: "node_V0",
    parentId: null,
    title: "母片·寒潮重生",
    synopsis: "死亡闪回后，林夏在暴雪夜重新醒来，发现自己回到被陈家羞辱的那一天。",
    prompt:
      "@linxia wakes up in @blizzard, realizing she has returned to the day before her death.",
    ownAssetIds: [
      "asset_lx",
      "asset_cy",
      "asset_scene_meeting",
      "asset_scene_blizzard",
      "asset_style_main",
    ],
    status: "alive",
    likes: 216,
  },
  node_V1: {
    nodeId: "node_V1",
    parentId: "node_V0",
    title: "救世线·当众撕票",
    synopsis: "林夏在会议室当众撕毁支票，把陈翊的羞辱变成全场反击。",
    prompt:
      "@linxia tears the cheque in front of @chenyi inside @meetingroom, everyone freezes.",
    ownAssetIds: [],
    status: "alive",
    likes: 134,
  },
  node_V3: {
    nodeId: "node_V3",
    parentId: "node_V0",
    title: "阴谋线·实验室录音",
    synopsis: "她追到昏暗实验室，发现气象学家留下的灾难录音。",
    prompt:
      "@linxia finds a hidden recorder in @lab while @meteorologist appears on a cracked monitor.",
    ownAssetIds: ["asset_meteor", "asset_scene_lab"],
    status: "endangered",
    likes: 18,
  },
};

const presetResults = [
  {
    resultId: "preset_A",
    title: "新芽·暴雪回眸",
    synopsis: "林夏在暴雪中回头，第一次发现陈翊身后还有另一个操盘者。",
    videoUrl: media.preview,
    seed: 120845911,
  },
  {
    resultId: "preset_B",
    title: "新芽·会议室反击",
    synopsis: "她把支票推回桌面，会议室灯光骤暗，陈翊终于失去掌控。",
    videoUrl: media.preview,
    seed: 573290184,
  },
  {
    resultId: "preset_C",
    title: "新芽·录音证据",
    synopsis: "一段旧录音曝光寒潮真相，林夏决定把陈家拖进审判现场。",
    videoUrl: media.preview,
    seed: 948220731,
  },
];

const state = {
  selectedNodeId: "node_V1",
  selectedCharacters: new Set(["asset_lx", "asset_cy"]),
  selectedSceneId: "asset_scene_meeting",
  seed: presetResults[0].seed,
  tokenBalance: 95,
  taskStatus: "idle",
  taskId: null,
  resultIndex: 0,
  currentResult: null,
  timers: [],
};

const steps = [
  { key: "assets", label: "读取继承资产", hint: "父链累积角色/场景/风格" },
  { key: "payload", label: "组装 Fusion Payload", hint: "subject + background + prompt" },
  { key: "matching", label: "匹配预制结果", hint: "拟实时返回 3-5 秒" },
  { key: "success", label: "预览生成片段", hint: "可 Shuffle / 使用" },
];

const el = {
  treeList: document.querySelector("#tree-list"),
  nodeCount: document.querySelector("#node-count"),
  selectedTitle: document.querySelector("#selected-title"),
  tokenBalance: document.querySelector("#token-balance"),
  apiStatus: document.querySelector("#api-status"),
  uploadLocalButton: document.querySelector("#upload-local-button"),
  uploadHint: document.querySelector("#upload-hint"),
  assetStrip: document.querySelector("#asset-strip"),
  assetSummary: document.querySelector("#asset-summary"),
  branchPath: document.querySelector("#branch-path"),
  promptInput: document.querySelector("#prompt-input"),
  modeSelect: document.querySelector("#mode-select"),
  modelSelect: document.querySelector("#model-select"),
  durationSelect: document.querySelector("#duration-select"),
  cameraSelect: document.querySelector("#camera-select"),
  sceneSelect: document.querySelector("#scene-select"),
  characterPicker: document.querySelector("#character-picker"),
  generateButton: document.querySelector("#generate-button"),
  generateHint: document.querySelector("#generate-hint"),
  shuffleButton: document.querySelector("#shuffle-button"),
  publishButton: document.querySelector("#publish-button"),
  statusStack: document.querySelector("#status-stack"),
  previewShell: document.querySelector("#preview-shell"),
  payloadOutput: document.querySelector("#payload-output"),
  seedChip: document.querySelector("#seed-chip"),
  taskId: document.querySelector("#task-id"),
  toast: document.querySelector("#toast"),
};

function getAvailableAssets(nodeId) {
  const ids = new Set();
  let current = nodes[nodeId];

  while (current) {
    current.ownAssetIds.forEach((id) => ids.add(id));
    current = current.parentId ? nodes[current.parentId] : null;
  }

  return [...ids].map((id) => assets[id]).filter(Boolean);
}

function getPath(nodeId) {
  const path = [];
  let current = nodes[nodeId];

  while (current) {
    path.unshift(current.nodeId);
    current = current.parentId ? nodes[current.parentId] : null;
  }

  return path;
}

function getDepth(nodeId) {
  return Math.max(0, getPath(nodeId).length - 1);
}

function selectedNode() {
  return nodes[state.selectedNodeId];
}

function selectedAssets() {
  const available = getAvailableAssets(state.selectedNodeId);
  const characters = available.filter(
    (asset) => asset.type === "character" && state.selectedCharacters.has(asset.assetId),
  );
  const scene = available.find((asset) => asset.assetId === state.selectedSceneId);
  const style = available.find((asset) => asset.type === "style");
  return { available, characters, scene, style };
}

function buildPayload() {
  const { characters, scene, style } = selectedAssets();
  const references = characters.map((asset) => ({
    type: "subject",
    img_id: Number(asset.pixverseImgId),
    ref_name: asset.refName,
  }));

  if (scene) {
    references.push({
      type: "background",
      img_id: Number(scene.pixverseImgId),
      ref_name: scene.refName,
    });
  }

  const lockedPrefixes = characters.map((asset) => asset.promptPrefix).join(". ");
  const prompt = [style?.promptPrefix, lockedPrefixes, el.promptInput.value.trim()]
    .filter(Boolean)
    .join(". ");
  const negativePrompt = characters
    .map((asset) => asset.negativePrompt)
    .filter(Boolean)
    .concat(["no distorted face", "no flicker", "no sudden identity change"])
    .join(", ");

  return {
    demo_mode: "pre_generated_fusion_simulation",
    would_call: "/openapi/v2/video/fusion/generate",
    matched_preset: presetResults[state.resultIndex].resultId,
    image_references: references.slice(0, 3),
    prompt,
    negative_prompt: negativePrompt,
    model: el.modelSelect.value,
    duration: Number(el.durationSelect.value),
    quality: "540p",
    aspect_ratio: "9:16",
    motion_mode: "normal",
    camera_movement: el.cameraSelect.value,
    seed: state.seed,
  };
}

function renderTree() {
  const list = Object.values(nodes);
  el.nodeCount.textContent = `${list.length} nodes`;
  el.treeList.innerHTML = "";

  list.forEach((node) => {
    const button = document.createElement("button");
    button.className = `node-button ${node.nodeId === state.selectedNodeId ? "is-active" : ""}`;
    button.type = "button";
    button.style.marginLeft = `${getDepth(node.nodeId) * 20}px`;
    button.innerHTML = `
      <span class="node-dot ${node.status}"></span>
      <span class="node-copy">
        <strong>${node.title}</strong>
        <span>${node.nodeId} · ${node.likes} likes</span>
      </span>
      <span class="node-plus">+</span>
    `;
    button.addEventListener("click", () => selectNode(node.nodeId));
    el.treeList.appendChild(button);
  });
}

function renderAssets() {
  const { available } = selectedAssets();
  const refs = available.filter((asset) => asset.type !== "style");
  el.assetSummary.textContent = `${refs.length} inherited`;
  el.uploadHint.textContent = `当前分支继承 ${refs.map((asset) => asset.name).join("、")}`;
  el.assetStrip.innerHTML = "";

  available.forEach((asset) => {
    const card = document.createElement("article");
    card.className = "asset-card is-uploaded";
    card.innerHTML = `
      <img src="${asset.refImageUrl || media.blizzard}" alt="${asset.name}" />
      <div>
        <strong>${asset.name}</strong>
        <span>${asset.type} · @${asset.refName}</span>
        ${
          asset.type === "style"
            ? `<small>风格前缀自动继承</small>`
            : `<small>mock img_id ${asset.pixverseImgId}</small>`
        }
      </div>
    `;
    el.assetStrip.appendChild(card);
  });
}

function renderControls() {
  const available = getAvailableAssets(state.selectedNodeId);
  const characters = available.filter((asset) => asset.type === "character");
  const scenes = available.filter((asset) => asset.type === "scene");

  el.characterPicker.innerHTML = "";
  characters.forEach((asset) => {
    const label = document.createElement("label");
    label.className = "character-pill";
    label.innerHTML = `
      <input type="checkbox" value="${asset.assetId}" ${
        state.selectedCharacters.has(asset.assetId) ? "checked" : ""
      } />
      <span>${asset.name} @${asset.refName}</span>
    `;
    label.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) {
        state.selectedCharacters.add(asset.assetId);
      } else {
        state.selectedCharacters.delete(asset.assetId);
      }
      syncPayload();
      updateGenerateButton();
    });
    el.characterPicker.appendChild(label);
  });

  el.sceneSelect.innerHTML = "";
  scenes.forEach((asset) => {
    const option = document.createElement("option");
    option.value = asset.assetId;
    option.textContent = `${asset.name} @${asset.refName}`;
    option.selected = asset.assetId === state.selectedSceneId;
    el.sceneSelect.appendChild(option);
  });

  if (!scenes.some((asset) => asset.assetId === state.selectedSceneId) && scenes[0]) {
    state.selectedSceneId = scenes[0].assetId;
    el.sceneSelect.value = state.selectedSceneId;
  }
}

function renderStatus(activeKey = state.taskStatus) {
  el.statusStack.innerHTML = "";
  const activeIndex = steps.findIndex((step) => step.key === activeKey);

  steps.forEach((step, index) => {
    const item = document.createElement("div");
    item.className = "status-item";
    if (activeIndex === index) item.classList.add("is-active");
    if (activeIndex > index || activeKey === "success") item.classList.add("is-done");
    item.innerHTML = `
      <span class="status-mark"></span>
      <strong>${step.label}</strong>
      <small>${step.hint}</small>
    `;
    el.statusStack.appendChild(item);
  });
}

function renderPreview(result = state.currentResult) {
  if (!result) {
    el.previewShell.innerHTML = `
      <div class="preview-empty">
        <span>V</span>
        <p>生成完成后在这里预览预制单镜头片段</p>
      </div>
    `;
    return;
  }

  el.previewShell.innerHTML = `
    <video controls autoplay muted playsinline>
      <source src="${result.videoUrl}" type="video/mp4" />
    </video>
  `;
}

function syncPayload() {
  const payload = buildPayload();
  el.payloadOutput.textContent = JSON.stringify(payload, null, 2);
  el.seedChip.textContent = `seed ${state.seed}`;
}

function updateGenerateButton() {
  const blocker = getGenerateBlocker();
  const isWorking = state.taskStatus === "assets" || state.taskStatus === "payload" || state.taskStatus === "matching";
  el.generateButton.disabled = isWorking;
  el.shuffleButton.disabled = isWorking;
  el.generateHint.classList.toggle("is-ready", !blocker && !isWorking);
  el.generateHint.classList.toggle("is-blocked", Boolean(blocker) && !isWorking);
  el.generateHint.textContent = isWorking
    ? "拟实时生成中：正在读取资产、组装 payload、匹配预制片段。"
    : blocker || "逻辑已就绪：点击生成会返回一个预制视频分支。";
}

function getGenerateBlocker() {
  const { characters } = selectedAssets();
  if (!el.promptInput.value.trim()) return "请先写一句剧情 prompt。";
  if (!characters.length) return "至少勾选一个出场角色。";
  if (buildPayload().image_references.length > 3) return "Fusion 一次最多 3 个参考，请减少出场角色或场景。";
  if (state.tokenBalance < 5) return "demo token 不足。";
  return "";
}

function renderAll() {
  const node = selectedNode();
  el.selectedTitle.textContent = node.title;
  el.branchPath.textContent = getPath(node.nodeId).join(" / ");
  el.tokenBalance.textContent = state.tokenBalance;
  el.apiStatus.textContent = "Demo Token";
  el.promptInput.value = node.prompt;
  el.taskId.textContent = state.taskId || "待生成";

  renderTree();
  renderControls();
  renderAssets();
  renderStatus("idle");
  renderPreview(null);
  syncPayload();
  updateGenerateButton();
}

function selectNode(nodeId) {
  clearTimers();
  state.selectedNodeId = nodeId;
  const available = getAvailableAssets(nodeId);
  const characters = available.filter((asset) => asset.type === "character");
  const scenes = available.filter((asset) => asset.type === "scene");
  state.selectedCharacters = new Set(characters.slice(0, 2).map((asset) => asset.assetId));
  state.selectedSceneId = scenes[0]?.assetId || "";
  state.taskStatus = "idle";
  state.taskId = null;
  state.currentResult = null;
  renderAll();
}

function runGeneration(isShuffle = false) {
  const blocker = getGenerateBlocker();
  if (blocker) {
    showToast(blocker);
    updateGenerateButton();
    return;
  }

  clearTimers();
  if (isShuffle) {
    state.resultIndex = (state.resultIndex + 1) % presetResults.length;
  }

  const result = {
    ...presetResults[state.resultIndex],
    title: createTitle(el.promptInput.value, presetResults[state.resultIndex].title),
    synopsis: el.promptInput.value.trim(),
  };

  state.seed = result.seed;
  state.tokenBalance -= 5;
  state.currentResult = null;
  state.taskId = `demo_${Date.now().toString().slice(-6)}`;
  el.taskId.textContent = state.taskId;
  el.tokenBalance.textContent = state.tokenBalance;
  el.publishButton.disabled = true;
  renderPreview(null);
  syncPayload();

  advance("assets", 0);
  advance("payload", 900);
  advance("matching", 1900);
  state.timers.push(
    window.setTimeout(() => {
      state.taskStatus = "success";
      state.currentResult = result;
      renderStatus("success");
      renderPreview(result);
      el.publishButton.disabled = false;
      updateGenerateButton();
      showToast(isShuffle ? "已换一版预制分支。" : "预制生成完成，可以使用并挂树。");
    }, 3300),
  );
}

function advance(status, delay) {
  state.timers.push(
    window.setTimeout(() => {
      state.taskStatus = status;
      renderStatus(status);
      updateGenerateButton();
    }, delay),
  );
}

function publishBranch() {
  if (!state.currentResult) return;

  const parent = selectedNode();
  const nodeId = `node_U${Object.keys(nodes).length + 1}`;
  nodes[nodeId] = {
    nodeId,
    parentId: parent.nodeId,
    title: state.currentResult.title,
    synopsis: state.currentResult.synopsis,
    prompt: el.promptInput.value.trim(),
    ownAssetIds: [],
    status: "alive",
    likes: 0,
    videoUrl: state.currentResult.videoUrl,
  };

  showToast(`新分支「${state.currentResult.title}」已挂到 ${parent.title} 后面。`);
  selectNode(nodeId);
}

function createTitle(prompt, fallback) {
  const clean = prompt
    .replace(/@\w+/g, "")
    .replace(/[,.，。]/g, " ")
    .trim();
  const short = clean.slice(0, 12);
  return short ? `新芽·${short}` : fallback;
}

function clearTimers() {
  state.timers.forEach((timer) => window.clearTimeout(timer));
  state.timers = [];
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    el.toast.classList.remove("is-visible");
  }, 3000);
}

el.promptInput.addEventListener("input", () => {
  syncPayload();
  updateGenerateButton();
});
el.modeSelect.addEventListener("change", syncPayload);
el.modelSelect.addEventListener("change", syncPayload);
el.durationSelect.addEventListener("change", syncPayload);
el.cameraSelect.addEventListener("change", syncPayload);
el.sceneSelect.addEventListener("change", (event) => {
  state.selectedSceneId = event.target.value;
  syncPayload();
  updateGenerateButton();
});
el.generateButton.addEventListener("click", () => runGeneration(false));
el.shuffleButton.addEventListener("click", () => runGeneration(true));
el.publishButton.addEventListener("click", publishBranch);
el.uploadLocalButton.addEventListener("click", () => {
  renderAssets();
  showToast("继承链路正常：资产来自当前节点到根节点的父链。");
});

renderAll();
