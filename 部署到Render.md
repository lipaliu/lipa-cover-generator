# 把 BAKABAKA 部署成永久网站（Render）

部署后：任何人换台电脑、打开网址 → 输用户名密码 → 直接用。无需终端、无需开你的 Mac。
云上只有 **Image2 + Seedream** 两个引擎（即梦是本机工具，云上自动隐藏）。本地隧道那套照常能用即梦，互不影响。

---

## 一、准备
- 代码已经在 GitHub：`lipaliu/lipa-cover-generator`（已包含 `render.yaml`，Render 会自动读）。
- 手边备好这几个值（从项目根目录的 `.env.local` 里复制）：
  - `OPENAI_API_KEY`
  - `ARK_API_KEY`、`ARK_MODEL`
  - 登录用：`ACCESS_USER=lipa`、`ACCESS_PASSWORD=12345677`（可自定义）

## 二、部署步骤（全程网页点，约 5 分钟）
1. 打开 https://render.com → 用 **GitHub 账号登录**（首次会让你授权 Render 访问仓库）。
2. 右上角 **New +** → **Blueprint**。
3. 选仓库 **lipa-cover-generator** → Render 自动识别 `render.yaml` → 点 **Apply / Create**。
4. 它会要你填几个标了 “sync: false” 的密钥（或部署后到服务的 **Environment** 里加）：
   | Key | Value |
   |---|---|
   | OPENAI_API_KEY | （复制 .env.local 里的） |
   | ARK_API_KEY | （复制 .env.local 里的） |
   | ARK_MODEL | （复制 .env.local 里的） |
   | ACCESS_USER | lipa |
   | ACCESS_PASSWORD | 12345677 |
   > ⚠️ 不要填 `HTTPS_PROXY` / `ARK_CA_CERTS`——那是本机翻墙用的，云上海外直连不需要。
5. 点部署，等几分钟（第一次构建较慢）。完成后得到网址：`https://bakabaka-xxxx.onrender.com`。
6. 打开网址 → 浏览器弹登录 → 用户名 `lipa`、密码 `12345677` → 开始用。

## 三、换成你自己的域名（以后随时）
1. 在 Render 该服务 → **Settings → Custom Domains → Add Custom Domain** → 填你的域名。
2. 按它给的提示，去你买域名的地方加一条 **CNAME** 记录指向 Render。
3. 等生效（几分钟到几小时），HTTPS 证书 Render 自动签。
> 告诉我你买好域名了，我带你一步步配。

## 四、日常
- **改代码**：我 push 到 GitHub，Render 会**自动重新部署**，网址不变。
- **免费档**：闲置一会儿会“休眠”，下次打开冷启动约 30 秒（属正常）；要 24 小时不休眠可在 Render 把 plan 从 free 改 starter（约 $7/月）。
- **要用即梦**：继续用本地 `bash scripts/share.sh` 的隧道那套。
