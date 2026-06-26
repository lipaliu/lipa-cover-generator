# 封面之王 (King of Cover) —— Mac 本地一键启动手册

这份手册教你如何在自己的 Mac 电脑上，把“封面之王”项目跑起来。
启动后，你可以在浏览器里直接点选生成，**直接消耗你自己的 OpenAI 额度，不再需要通过 Manus 代理，也不扣除任何积分。**

---

## 第一步：准备环境（如果你电脑还没装过）

你的 Mac 需要安装 **Node.js** 和 **Git**。

1. 打开 Mac 上的 **终端 (Terminal)** 应用程序（按 `Command + 空格`，输入 `Terminal` 回车）。
2. 在终端里输入以下命令并回车，安装 Homebrew（一个装软件的神器）：
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   *(如果提示输入密码，就输入你的 Mac 开机密码，输入时屏幕不显示字符是正常的，输完回车即可)*
3. Homebrew 装完后，用它安装 Node.js 和 Git：
   ```bash
   brew install node git
   ```

---

## 第二步：下载代码到本地

1. 在终端里，进入你的桌面（或者你想放代码的文件夹）：
   ```bash
   cd ~/Desktop
   ```
2. 从 GitHub 把最新的代码克隆下来：
   ```bash
   git clone https://github.com/lipaliu/lipa-cover-generator.git
   ```
3. 进入项目文件夹：
   ```bash
   cd lipa-cover-generator
   ```

---

## 第三步：安装依赖

在项目文件夹里，输入以下命令安装项目需要的所有依赖包：
```bash
npm install
```
*(这步可能需要 1-2 分钟，耐心等待跑完)*

---

## 第四步：配置你的 OpenAI Key（免积分模式）

这是最关键的一步，配置好后，项目就会用你的 Key 跑图。

1. 在项目文件夹里，复制一份配置模板：
   ```bash
   cp .env.example .env.local
   ```
2. 用 Mac 自带的文本编辑器打开 `.env.local` 文件：
   ```bash
   open -e .env.local
   ```
3. 在弹出的文本编辑器里，找到并修改以下几行：

   **必须填写的：**
   ```env
   # 填入你完整的 OpenAI API Key（sk-proj-xxx...）
   OPENAI_API_KEY=你的真实Key填在这里

   # 强制指向官方地址（确保不走代理报错）
   OPENAI_API_BASE=https://api.openai.com/v1

   # 开启本地免费模式（不走积分扣费系统，直接用你的Key额度）
   LOCAL_FREE_MODE=true
   ```

   **可选修改的（并发数）：**
   ```env
   # 默认并发是 4，如果你的 OpenAI 账号额度/并发限额够高，可以改成 8 甚至 10，出图更快
   GENERATION_CONCURRENCY=4
   ```

4. 修改完后，按 `Command + S` 保存，然后关掉文本编辑器。

---

## 第五步：一键启动！

在终端里输入：
```bash
npm run dev
```

你会看到类似这样的输出：
```text
> lipa-cover-generator@0.1.0 dev
> concurrently "npm run server" "vite"

[server] Server running on port 8787
[vite]   VITE v5.2.0  ready in 300 ms
[vite]   ➜  Local:   http://localhost:5173/
```

这说明**前端和后端都成功启动了**！

---

## 第六步：开始生图

1. 打开浏览器（推荐 Chrome 或 Safari）。
2. 访问网址：**http://localhost:5173**
3. 你会看到“封面之王”的界面。因为你在 `.env.local` 里开启了 `LOCAL_FREE_MODE=true`，所以**不需要登录、不扣积分、无水印**，你可以直接上传图片、填入标题、选择比例（包含新增的“B站封面”和“横版”等），点击生成。
4. 享受“啪啪啪”并发全开、极速出图的快感吧！

*(当你不想用了，回到终端窗口，按 `Control + C` 即可停止服务)*

---

## 交接给 Claude Code 的建议

当你准备让 Claude Code 接着干活时：
1. 在终端里进入这个项目目录：`cd ~/Desktop/lipa-cover-generator`
2. 启动 Claude Code
3. 告诉它：“请阅读仓库里的 `Claude_Code_Handoff.md` 文档，并从里面的【优先级 1】任务开始做。”
