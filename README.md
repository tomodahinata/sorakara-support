# そらとからだ サポート

iPhoneアプリ「そらとからだ」のサポート・プライバシーポリシー・利用規約・特定商取引法に基づく表記・外部送信について（GitHub Pages で公開する静的な site）。アプリは日本だけで配信するので、日本語の page だけを置く。

| page | URL |
|---|---|
| サポート（FAQ と問い合わせ） | https://tomodahinata.github.io/sorakara-support/ |
| プライバシーポリシー | https://tomodahinata.github.io/sorakara-support/privacy/ |
| 送るかどうかの選択（App Store Connect の Privacy Choices URL） | https://tomodahinata.github.io/sorakara-support/privacy/#choices |
| 利用規約（Apple の標準 EULA を補う規約） | https://tomodahinata.github.io/sorakara-support/terms/ |
| 特定商取引法に基づく表記 | https://tomodahinata.github.io/sorakara-support/tokushoho/ |
| 外部送信について | https://tomodahinata.github.io/sorakara-support/external-transmission/ |

## 正本と変え方

- 法務の 4 page の正本は、アプリの repo（`sorakara`）の `docs/legal/` にある md の ```text の中身。
  `privacy-policy.md`・`terms.md`・`tokushoho.md`・`external-transmission.md` が、それぞれ `privacy/`・`terms/`・`tokushoho/`・`external-transmission/` になる。
  md の決定の表・根拠・弁護士に確認することは公開しない。
- 文を変えるときは、正本（とアプリに同梱する `.txt`・`ConsentText`）を先に直し、同じ日にこの site を直す。行の分け方は正本のままにする。
  見出しは h2（プライバシーポリシーと外部送信は「1. 」の行、利用規約は「第1条（」の行）、「・」の行は箇条、特商法表記は「見出し：値」を表の行にする。
  文の中に link（`<a>`）を足すのはよい（文字は変えない）。
- プライバシーポリシーの 6. の見出しの `id="choices"` は App Store Connect の Privacy Choices URL が指す。変えない。
- サポートの FAQ（`index.html`）は正本を持たない。文は sorakara の `SPEC.md` §11 の文言ガードレールに従い、画面の語（「設定」＞「データ」など）はアプリの文字列に合わせる。
  予報なし版（気象庁の回答しだい）で出すときは、「通知が来ない」の事前通知の項を直す。
- 価格を変えたら（App Store Connect の価格の変更）、正本の `tokushoho.md` を直してから `tokushoho/` を直す。
- 外部のフォント・画像・script・解析は読み込まない（訪問者の情報を第三者に送らない）。外の site への link は Apple の標準 EULA だけ（`scripts/check-site.mjs` の `ALLOWED_EXTERNAL`）。
- 色は `style.css` の 16 進の token だけ。値はアプリの色（sorakara の `docs/design.md` の色の表）から取った。

## 確かめ方

```sh
node scripts/check-site.mjs --canonical ../sorakara
```

lang・title・viewport・h1、外部の資源が無いこと（HTML と、どの .css にも @import と外の url() が無いこと）、site の中の link と `#id`、
下書きの印（【 と ［事業者）が無いこと、light と dark の色の比（WCAG 2.2 AA）を確かめる。`--canonical` に sorakara の repo を渡すと、
法務の 4 page の h1・h2・本文の各行が正本と同じ順で同じこと、どの page にも使わない語（sorakara の `scripts/lib/banned-words.txt`）が無いことも確かめる
（依存なし。Node 22 以降）。

## 置き場の費用と止め方

- GitHub Pages（公開の repo）は無料。月の費用は 0 円。
- 止め方: repo の Settings → Pages で公開を止めるか、repo を削除する。止める前に、App Store Connect の URL
  （sorakara の `store/asc.json` のサポート・プライバシーポリシー・利用規約、`docs/app-privacy.md` の Privacy Choices、
  `store/listing.ja.json` の説明文の末尾と特商法表記の link）と、正本の md に書いた公開 URL を新しい置き場に替える
  （審査に必須のページなので、URL を切らさない）。アプリの中の法務の文は同梱なので、site を止めても読める。
