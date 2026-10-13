# 电话调查备忘

澳洲配偶签和 189 副申请的电话调查练习页。静态页面，可直接放到 GitHub Pages。

答案写在浏览器的本地存储里。刷新、关掉页面后再打开，同一台浏览器里的内容还在。换电脑或清除网站数据之前，用页面上的「下载备份」留一份 JSON 文件，到新浏览器里点「恢复备份」。

导出 PDF 时，在打印窗口选择「存储为 PDF」。

## 云端同步（可选）

填好 `js/sync-config.js` 之后，答案会同步到 Supabase。手机、电脑和伴侣只要用同一个同步码，就能看到同一份答案。不填的话，页面只存在本机浏览器。

1. 在 [supabase.com](https://supabase.com) 注册并新建一个项目（免费档不需要信用卡）。
2. 打开项目的 SQL Editor，把 `supabase/schema.sql` 整段粘贴进去运行。
3. 在 Project Settings → API Keys 里复制 Project URL 和 publishable key（旧项目叫 anon key），填进 `js/sync-config.js`。不要填 secret 或 service_role key。
4. 推送到 GitHub，等 Pages 更新。

每台设备第一次打开都会生成一个同步码。点「复制邀请链接」发给伴侣或另一台设备，打开链接就会加入同一份答案；也可以手动输入同步码后点「加入」。拿到同步码的人都能看和改答案。

一边保存后会通过 Supabase Realtime 通知另一边，通常一两秒内就能看到；实时连接断开时退回每 20 秒拉取一次。广播只带“有更新”的信号，不带答案内容。同一题两个人同时改，以后保存的为准。Supabase 免费项目连续 7 天没有请求会被暂停，暂停期间答案只存在本机，到 Supabase 控制台点恢复后会自动补传。
