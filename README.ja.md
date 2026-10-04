# Marubako

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

[![CI](https://github.com/KaidoAsuka/marubako/actions/workflows/ci.yml/badge.svg)](https://github.com/KaidoAsuka/marubako/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

仕事で何度も開くものをひとつにまとめておく、Windows 用の小さなパネルです。ショートカットひとつで呼び出せます。

<p align="center">
  <img src="docs/images/demo-open.webp" width="880" alt="ショートカットを押すと、フローティングボタンからパネルが展開する。ワンクリックで設計書のフォルダがエクスプローラーで開き、もう一度クリックするとテスト環境のサインインページがブラウザで開く">
</p>

## なぜ作ったか

開発の仕事をしているときに思いついたものです。設計書、オンラインのドキュメント、環境ごとの開発用・テスト用ページ、そしてそれぞれのアカウントとパスワード。必要になるたびにどこかの文書を開いて探すことになり、環境を切り替えるときはさらに面倒でした。

いまは全部がひとつのパネルに入っていて、デスクトップは空っぽです。

## できること

**ワンクリックで開く。** フォルダ、サイト、アプリを、プロジェクトや環境ごとのグループにまとめられます。`Ctrl + Shift + Space` を押せば、どのアプリを使っていてもパネルが出てきます。

**ワンクリックでコピー。** 環境ごとのユーザー名、パスワード、何度も打つコマンド。

<p align="center">
  <img src="docs/images/demo-copy.webp" width="880" alt="クリックでテスト用アカウントのユーザー名をコピーしてサインインページに貼り付け、続けてパスワードも貼り付ける。コピーしたコマンドはターミナルに貼り付けて実行する">
</p>

**なんでも検索。** `Ctrl + K` ですべてのカテゴリを検索します。

<p align="center">
  <img src="docs/images/demo-search.webp" width="880" alt="Ctrl + K を押して test と入力し、Enter を押すと、見つかったフォルダが開く">
</p>

**リストとグリッドをワンクリックで切り替え。** フォルダ、サイト、アプリのページで使えます。グリッドではグループがタイルになり、クリックすると中の項目が表示されます。

<p align="center">
  <img src="docs/images/demo-view.webp" width="880" alt="クリックするとサイトのリストがタイルのグリッドに変わる。タイルをクリックするとそのグループの項目が表示され、もう一度クリックするとリストに戻る">
</p>

**使わないときは邪魔にならない。** パネルは画面の端の小さなフローティングボタンに収納でき、ボタンとパネルは一緒に動きます。

<p align="center">
  <img src="docs/images/demo-ball.webp" width="880" alt="パネルがフローティングボタンに収納されてデスクトップが空になる。ダブルクリックでパネルが戻り、パネルをドラッグするとフローティングボタンもついてくる">
</p>

**パスワードはお使いの PC にだけ保存され、Marubako が外部に送信することは一切ありません。** パスワードは Windows アカウントで暗号化されます。アカウント登録もクラウド同期もなく、利用状況の送信もありません。アプリ自身がインターネットに接続するのは、GitHub で更新を確認してダウンロードするときだけです。その通信に、保存した内容が含まれることはありません。

ほかに、メモと毎日のタスクもあります。ライト、ダーク、Monokai の配色。表示言語は日本語、English、中文。デモのデータはすべて架空のものです。

## インストール

Windows 10 または 11（64 ビット）が必要です。[最新リリース](https://github.com/KaidoAsuka/marubako/releases/latest)から `Marubako-Setup-<バージョン>.exe` をダウンロードして実行してください。

インストーラーにはまだコード署名がないため、**Windows によって PC が保護されました** と表示されることがあります。**詳細情報** をクリックし、**実行** をクリックしてください。現在のアカウントにだけインストールされ、管理者権限は要りません。インストールが終わると Marubako が起動します。更新は自動で届きます（**設定 > 言語とデータ** でバージョンを確認でき、ダウンロード済みの更新もそこからインストールできます）。アンインストールは Windows の **設定 > アプリ** から行います。削除を選ばないかぎり、データは残ります。

## データについて

すべて `%APPDATA%\marubako\` にあります。ふつうの JSON ファイルがひとつと、直近 7 日分の毎日のバックアップです。別の PC に移すときは **設定 > 言語とデータ > データを書き出す** を使い、移行先で **データを読み込む** を実行してください（フォルダをコピーしてもパスワードは移せません。パスワードは 1 台の PC の 1 つの Windows アカウント用に暗号化されています）。パスワード付きで書き出したファイルでは、パスワードは平文のままです。また、コピーしたパスワードは、ほかのコピーした内容と同じく Windows のクリップボードに残ります。

パスワードのページは、テスト環境のアカウントのように手元に置いておきたいものを入れるための便利機能です。パスワードマネージャーではありません。あなたの Windows アカウントにサインインできる人は誰でも見ることができます。大事なパスワードは専用のパスワードマネージャーに入れてください。

パネルの細かい動作は[動作仕様](docs/behavior.zh-CN.md)（中国語）に書いてあります。

## ソースからビルドする

Windows、[Node.js](https://nodejs.org/) 22.13 以降、Git が必要です。

```powershell
git clone https://github.com/KaidoAsuka/marubako.git
cd marubako
npm ci
npm run dev       # ソースから実行します。%APPDATA%\marubako-dev を使い、実際のデータには触れません
npm test          # ユニットテスト
npm run dist      # インストーラーを release\<バージョン>\ に作成します
```

不具合の報告やアイデアは [Issue](https://github.com/KaidoAsuka/marubako/issues) へどうぞ。プルリクエストの前に [CONTRIBUTING.md](CONTRIBUTING.md)（英語）を、セキュリティの問題は [SECURITY.md](SECURITY.md) をご覧ください。

## ライセンス

[MIT](LICENSE)。サードパーティのソフトウェアとそのライセンスは [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) にあります。
