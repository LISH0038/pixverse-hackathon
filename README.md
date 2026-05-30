# StoryTree 短剧生成工作流

这是一个轻量网页工作流，重点是跑通 PixVerse Fusion 视频生成：

1. 选择剧情父节点
2. 沿父链继承角色 / 场景 / 风格资产
3. 上传参考图到 PixVerse，拿到 `img_id`
4. 组装 `/openapi/v2/video/fusion/generate` 请求
5. 用 `video_id` 轮询 `/openapi/v2/video/result/{video_id}`
6. `status=1` 后播放返回的视频 URL

## 启动

复制 `.env.example` 为 `.env`，填入 PixVerse API key：

```env
PIXVERSE_API_KEY=your_pixverse_api_key_here
```

启动本地服务：

```powershell
npm start
```

打开：

```text
http://localhost:5173
```

## 使用

- 先点「上传当前资产到 PixVerse」，或在资产卡手动填入已有 `img_id`。
- 一次 Fusion 最多使用 3 个参考，建议 1-2 个角色 + 1 个场景。
- 写一句剧情后点「提交 Fusion 生成」。
- 页面会每 5 秒轮询一次状态，成功后直接播放 PixVerse 返回的视频。

API key 只在 `server.js` 后端代理里使用，不会暴露到前端。
