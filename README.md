# Stage Lighting Show Library

VRChat Stage Lighting Console用の**公開公演ライブラリ**です。

**[公演データの保管庫](https://menou2846.github.io/StageLightingShowPacks/)**

## Web管理者保存（追加機能）

- 「固定配信中」カードと公演一覧で、現在の `show-pack.json`、Cue・Release、過去版を区別して表示
- 「GitHubへ保存（管理者）」でSHOWを明示確認後に固定URLへ反映。Unity側のURLは変更不要
- 更新前の固定版と新しい版を `shows/<slug>/releases/rNNNN.json` に保存し、`catalog.json` と固定 `show-pack.json` を**同じnon-force Git Commit**で更新。既存Releaseファイルは上書き禁止。別Show IDへの切替は追加確認
- GitHub所有者の短期限fine-grained PAT（StageLightingShowPacksだけ、Contents: Read and write）を**その操作でのみ入力**。トークンをWebコード・localStorage・Gitコミットへ保存しない。公開ページへの資格情報入力にはリスクがあるため、ドメインが正規サイトか必ず確認
- JSONの破損検査、版番号、同番号のデータ衝突を確認して拒否。保存前のPCダウンロードと明示的な「公開」確認を必須
- WebページにURLを常時大きく表示せず折りたたむが、**GitHub Pagesに置くJSON自体は一般公開**。秘密の台本や個人情報は置かない
- ページのコードを更新しただけでは、現在配信中の `show-pack.json` の中身やUnity側の設定は変えない

## 現在の仕様

- **公演を選択** → **保存済みReleaseを選択** → 実ファイルのShow ID、Release、Cue件数、Schema、FNVチェックサムを検証 → **JSONダウンロード / VRChat REMOTE用URLコピー**
- **手元のRemote PackをJSONアップロード**して内容確認。ブラウザ内だけで読み込み、未公開ファイルをサーバーへ送信しない
- **Webの名称エディター**は、Show名 / Act名 / Cue名（日英）と表示名だけを変更できる。照明パラメータ、Cue UID、Role、Fixture、Timing、LOOK、FOLLOW、Act割当とSchema 3～5のtailはバイト単位で保護
- 編集後はRelease Revisionを上げて**新しいJSONをローカルへダウンロード**。元の公開版、手元の元ファイル、GitHubの履歴は変更しない
- Schema 1は名称が格納されないため読込のみ。名前編集はSchema 2～5
- 過去Releaseは**固定URL**を持ち、後からほかのReleaseを追加しても置き換えない
- 通常の閲覧者には編集権限を与えない。GitHubへ書き込む場合のみ管理者の明示認証と確認が必要

**現在のPublicカタログは空ですが、旧固定URLのSHOW JSONは存在します。** 最初の管理者更新時に現在の配信版を履歴へ移します。

## 公演データのファイル構造

\`\`\`text
index.html
catalog.json
show-pack-codec.mjs
show-library-catalog.mjs
show-library-app.mjs
show-pack.json                          ← 従来の単一Show URL（存在すれば互換対応）
shows/
  <slug>/
    releases/
      r0001.json                        ← Release 1 の不変JSON
      r0002.json                        ← Release 2 の不変JSON
      r0003.json                        ← Release 3 の不変JSON
\`\`\`

\`catalog.json\` 形式：

\`\`\`json
{
  "format": "stage-lighting-show-catalog",
  "version": 1,
  "shows": [
    {
      "slug": "nutcracker",
      "showId": "show-001",
      "title": "くるみ割り人形",
      "archived": false,
      "publishedRevision": 3,
      "releases": [
        {
          "revision": 1,
          "label": "リハーサル版",
          "stage": "rehearsal",
          "cueCount": 24,
          "dataSchema": 5,
          "path": "shows/nutcracker/releases/r0001.json"
        },
        {
          "revision": 3,
          "label": "本番確定版",
          "stage": "final",
          "cueCount": 26,
          "dataSchema": 5,
          "path": "shows/nutcracker/releases/r0003.json"
        }
      ]
    }
  ]
}
\`\`\`

これは形式の**説明例**です。実リポジトリのcatalogは空のままです。

### 公演とReleaseの識別

- 公演名は表示名であり、変更しても同じ \`showId\` を維持する
- \`slug\` は安全な小文字英数字/\`_\`/\`-\`を使う固定識別子。名前変更でパスを変えない
- Release番号は同一公演で一意。**既存Release JSONは絶対に上書きしない**
- \`publishedRevision\` は運用上の本番指定ポインター。過去版へ戻す場合もファイル自体は変更せずポインターだけ更新
- \`archived: true\` は一覧に「アーカイブ」と表示するのみ。URLが消えるわけではなく**公開停止とは違う**
- 本当に公開停止する場合はGitHub上で公開ファイルを取り除く必要があるが、公開済みデータは履歴やキャッシュに残り得る
- 既存の \`show-pack.json\` URLを使っているワールドの互換性を守るため、ファイルを勝手に削除したり入れ替えたりしない

### 公開する手順（現段階）

1. PC版VRChat内で公演を書き出し、PC受取ツールでJSONを受信。書き出しUdon/実機連携は別PR #3、#4の検証が必要
2. Webエディターで受信したJSONを選択して名前を修正し、新しい版としてダウンロード
3. **公開してよい**公演データだけを、管理者がGitHubへReleaseごとのパスでアップロード
4. \`catalog.json\` へ、JSON本体と一致するShow ID / Release / Cue件数 / Schema / pathを追加
5. GitHub Pagesへの反映後、公開サイトで版を選択して検証・URLコピー
6. VRChatの SHOW → REMOTE にその固定URLを入力して、**検証・比較・明示的に確定**

Web管理画面からの明示的なGitHub保存機能を追加しました。PC版Show Managerの旧固定URL更新機能を使う場合は、Web側の版別履歴と整合するよう確認が必要です。

## プレビュー版の検証

\`\`\`bash
node --test tests/*.test.mjs
\`\`\`

Node 22による自動テストで、Schema 2/3/4/5の合成Snapshot、編集前後の非名称バイト不変、ハッシュとサイズ、文字制約、Catalogバリデーション、URLパス制約を確認します。VRChat実公演JSON・Unity・実機での往復検証は別途必要です。

## 注意

- GitHub Pagesは全世界に公開。管理者が設定した「リハ」等のラベルは非公開権限ではありません。**リハーサルデータも掲載すると公開されます**。
- 著作権・個人情報・未公開の舞台演出・秘密の公演素材がないことを確認してから公開してください。
- Cueの読み込みや再生での互換性はStage Lighting Console側のFixture・Role構成に依存します。WebのFNV照合は破損検知であり、改ざん防止署名ではありません。
- ほかの劇団へ一般配布する場合は、自分自身のGitHubリポジトリ／PagesでShowを保持する構成を予定しています。全ユーザーの公演データをこのリポジトリで共同管理する計画ではありません。
