# Stage Lighting Show Packs

VRChat向け **Stage Lighting Console** の公演データを配信するための公開リポジトリです。

## 公開ページ

https://menou2846.github.io/StageLightingShowPacks/

**現時点では公演データは未公開です。** `show-pack.json` はまだ配置していません。公開ページはこのファイルが存在しない間、未公開案内を表示します。

## 初期設定

GitHubの **Settings → Pages → Build and deployment** を開き、`Deploy from a branch` → `main` / `(root)` を選択して保存します。

GitHub Pagesが有効になったら、トップページを開いて「まだ公演データはありません」と表示されれば正常です。最初の公演データ公開後、VRChatで読むURLは次です。

```text
https://menou2846.github.io/StageLightingShowPacks/show-pack.json
```

## 公演データを公開する流れ

1. VRChat Stage Lighting Console内で公演データを書き出す（PC版VRChatのログ経由）。
2. Windows版Stage Lighting Show Managerで受信し、必要なら公演・Act・Cue名を編集して別名保存。
3. 公開してよいことを確認してから、Show Managerの「共有」で本リポジトリに公開。
4. VRChatの SHOW → REMOTE で上記URLを取得 → 検証・比較 → 確認して取り込む。

現在のShow Manager v1は**固定URLに最新の1公演を配信**します。同じShow IDでRelease Revisionが進んだ場合にのみ更新を許可します。複数公演の同時配信は将来の拡張対象です。

**注意：** このリポジトリとPagesの公演データは誰でも閲覧できます。非公開のリハーサルデータ、制作メモ、秘密情報、個人情報はアップロードしないでください。公演JSONは一般公開用に確認したものだけを使用してください。GitHub Pages自体は読み取り専用で、アップロードには認証済みGitHub CLIを使うPCツールが必要です。

## 公開運用について

このリポジトリは当面制作者本人の公演データ配信専用です。将来Stage Lighting Consoleを他の制作者へ配布する場合も、利用者それぞれが自分のGitHubリポジトリ/Pagesを設定して自分のShowを管理できる運用を目指します。共通の中央サーバーに全利用者のデータを集めることは現段階では想定していません。
