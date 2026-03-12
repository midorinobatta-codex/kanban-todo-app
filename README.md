# 業務Todoカンバン MVP

Next.js + TypeScript + Tailwind + Supabase で構築した、業務利用向けのシンプルな Todo カンバンです。

## 主な機能

- Supabase Auth によるログイン / ログアウト
- 未ログイン時の `/login` へのリダイレクト
- タスクの作成（タイトル、説明、担当者、優先度、期限）
- 4カラム（未着手 / 進行中 / 待ち / 完了）での可視化
- タスクステータスの更新
- タスク削除
- GTD分類（次にやる / 他者依頼 / プロジェクト / いつか / 保留）の設定と表示
- 優先度ラベル表示、期限超過タスクの強調表示
- 画面からの手動再読込
- キーワード検索、優先度フィルタ、GTD分類フィルタ
- Supabase(PostgreSQL) への永続化

## セットアップ

1. 依存関係をインストール

```bash
npm install
```

2. 環境変数を作成

```bash
cp .env.example .env.local
```

`.env.local` に Supabase プロジェクト値を設定してください。

3. Supabase にテーブル作成

`supabase.sql` を Supabase SQL Editor で実行します。

4. Supabase Auth でユーザーを作成

Supabase ダッシュボードの Authentication からメールアドレス / パスワードのユーザーを作成してください。

5. 開発サーバー起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開いて確認します。

## 補足

- この MVP はクライアントサイドから Supabase を直接操作します。
- `supabase.sql` の RLS ポリシーは `authenticated` ユーザーのみ CRUD 可能です。
- タスクは `user_id` でログインユーザーごとに分離されています。
