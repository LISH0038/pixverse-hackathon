const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const root = __dirname;
const port = Number(process.env.PORT || 5173);
const apiBase = "https://app-api.pixverse.ai/openapi/v2";

loadEnv();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await routeApi(req, res);
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || "Internal server error",
    });
  }
});

server.listen(port, () => {
  console.log(`StoryTree video workflow: http://localhost:${port}`);
  console.log(
    process.env.PIXVERSE_API_KEY
      ? "PIXVERSE_API_KEY loaded."
      : "PIXVERSE_API_KEY is missing. Set it before generating videos.",
  );
});

async function routeApi(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    const keyState = getApiKeyState();
    let balance = null;
    if (keyState.valid) {
      try {
        const rawBalance = await pixverseFetch("/account/balance", { method: "GET" });
        balance = rawBalance.Resp || null;
      } catch {
        balance = null;
      }
    }
    sendJson(res, 200, {
      ok: true,
      hasApiKey: keyState.valid,
      keyState: keyState.reason,
      balance,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/upload-reference") {
    requireApiKey();
    const webReq = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: streamToWeb(req),
      duplex: "half",
    });
    const form = await webReq.formData();
    const image = form.get("image");

    if (!image || typeof image === "string") {
      throw new Error("Missing image file.");
    }

    const uploaded = await uploadImage(image, image.name || "reference.png");
    sendJson(res, 200, uploaded);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/upload-local-assets") {
    requireApiKey();
    const body = await readJson(req);
    const items = Array.isArray(body.items) ? body.items : [];
    const cacheByPath = new Map();
    const uploads = {};

    for (const item of items) {
      if (!item.assetId || !item.refImageUrl) continue;

      if (!cacheByPath.has(item.refImageUrl)) {
        const absolute = resolveSafePath(item.refImageUrl);
        const bytes = await fs.promises.readFile(absolute);
        const blob = new Blob([bytes], { type: mimeForPath(absolute) });
        cacheByPath.set(
          item.refImageUrl,
          await uploadImage(blob, path.basename(absolute)),
        );
      }

      uploads[item.assetId] = cacheByPath.get(item.refImageUrl);
    }

    sendJson(res, 200, { uploads });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/generate") {
    requireApiKey();
    const { mode = "fusion", payload } = await readJson(req);
    normalizeFusionPayload(payload);
    validateVideoPayload(payload);

    const endpoint = mode === "text" ? "/video/text/generate" : "/video/fusion/generate";
    if (mode !== "text") validateFusionPayload(payload);

    const raw = await pixverseFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const videoId = raw.Resp?.video_id || raw.Resp?.id || raw.video_id;

    if (!videoId) {
      throw new Error(`PixVerse did not return video_id: ${JSON.stringify(raw)}`);
    }

    sendJson(res, 200, { video_id: videoId, raw });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/status/")) {
    requireApiKey();
    const videoId = decodeURIComponent(url.pathname.replace("/api/status/", ""));
    const raw = await pixverseFetch(`/video/result/${videoId}`, {
      method: "GET",
    });
    sendJson(res, 200, { result: raw.Resp || raw, raw });
    return;
  }

  sendJson(res, 404, { error: "API route not found." });
}

async function pixverseFetch(endpoint, options = {}) {
  const response = await fetch(`${apiBase}${endpoint}`, {
    ...options,
    headers: {
      "API-KEY": process.env.PIXVERSE_API_KEY,
      "Ai-trace-id": randomUUID(),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || (Number.isFinite(data.ErrCode) && data.ErrCode !== 0)) {
    throw new Error(data.ErrMsg || `PixVerse request failed (${response.status})`);
  }

  return data;
}

async function uploadImage(blob, filename) {
  const form = new FormData();
  form.append("image", blob, filename);

  const raw = await pixverseFetch("/image/upload", {
    method: "POST",
    body: form,
  });

  const imgId = raw.Resp?.img_id;
  if (!imgId) {
    throw new Error(`PixVerse did not return img_id: ${JSON.stringify(raw)}`);
  }

  return {
    img_id: imgId,
    img_url: raw.Resp?.img_url || "",
    raw,
  };
}

function validateFusionPayload(payload) {
  if (!Array.isArray(payload.image_references) || payload.image_references.length === 0) {
    throw new Error("image_references must not be empty.");
  }

  if (payload.image_references.length > 3) {
    throw new Error("PixVerse Fusion supports 1 to 3 references.");
  }

  for (const ref of payload.image_references) {
    if (!ref.img_id || !ref.ref_name || !ref.type) {
      throw new Error("Each reference needs type, img_id, and ref_name.");
    }
  }
}

function validateVideoPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Missing video generation payload.");
  }

  if (!payload.prompt || typeof payload.prompt !== "string") {
    throw new Error("Missing prompt.");
  }
}

function normalizeFusionPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  const modelMap = {
    C1: "c1",
    c1: "c1",
    V6: "v6",
    v6: "v6",
    "V4.5": "v4.5",
    "v4.5": "v4.5",
  };
  if (payload.model && modelMap[payload.model]) {
    payload.model = modelMap[payload.model];
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const absolute = resolveSafePath(requested);

  let stat;
  try {
    stat = await fs.promises.stat(absolute);
  } catch {
    sendJson(res, 404, { error: "File not found." });
    return;
  }

  if (!stat.isFile()) {
    sendJson(res, 404, { error: "File not found." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": mimeForPath(absolute),
    "Content-Length": stat.size,
  });
  fs.createReadStream(absolute).pipe(res);
}

function resolveSafePath(inputPath) {
  const absolute = path.resolve(root, inputPath);
  const relative = path.relative(root, absolute);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path escapes project root.");
  }

  return absolute;
}

function mimeForPath(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function streamToWeb(req) {
  return require("node:stream").Readable.toWeb(req);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function requireApiKey() {
  const keyState = getApiKeyState();
  if (!keyState.valid) {
    throw new Error(keyState.message);
  }
}

function getApiKeyState() {
  const key = (process.env.PIXVERSE_API_KEY || "").trim();
  if (!key) {
    return {
      valid: false,
      reason: "missing",
      message: "Missing PIXVERSE_API_KEY. Set it in your environment or .env file.",
    };
  }
  if (key === "your_pixverse_api_key_here") {
    return {
      valid: false,
      reason: "placeholder",
      message: "PIXVERSE_API_KEY is still the placeholder value. Replace it with a real PixVerse OpenAPI key.",
    };
  }
  return { valid: true, reason: "configured", message: "" };
}

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
