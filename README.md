# 業務Todoカンバン MVP

Next.js + TypeScript + Tailwind + Supabase で構築した、業務利用向けのシンプルな Todo カンバンです。

## 主な機能

- Supabase Auth によるログイン / ログアウト
- 未ログイン時の `/login` へのリダイレクト
- タスクの作成（タイトル、説明、担当者、重要度、緊急度、期限、GTD分類）
- 表示モード
  - カンバン表示（未着手 / 進行中 / 待ち / 完了）
  - マトリクス表示（重要度 × 緊急度）
  - GTD表示（次にやる / 他者依頼 / プロジェクト / いつか / 保留）
- GTDの `someday` は通常画面（カンバン/マトリクス）では初期非表示
  - トグルで必要時のみ表示可能
  - GTD表示では常に表示
- project と next_action の軽量連携
  - next_action に関連プロジェクト設定
  - project 側に次アクション件数表示
  - next_action 未設定プロジェクトの warning 表示
- タスクステータスの更新
- タスク削除
- 画面からの手動再読込
- キーワード検索、GTD分類フィルタ、重要度フィルタ、緊急度フィルタ
- Supabase(PostgreSQL) への永続化

## 現在の運用軸と補足

- 現在の主な運用軸は **GTD / 重要度 / 緊急度 / ステータス** です。
- `priority` カラムは **DB / 型には互換のため残存** していますが、**UIでは表示していません**。

## セットアップ

1. 依存関係をインストール

```bash
npm install
環境変数を作成

cp .env.example .env.local
.env.local に Supabase プロジェクト値を設定してください。

Supabase にテーブル作成

supabase.sql を Supabase SQL Editor で実行します。

Supabase Auth でユーザーを作成

Supabase ダッシュボードの Authentication からメールアドレス / パスワードのユーザーを作成してください。

開発サーバー起動

npm run dev
ブラウザで http://localhost:3000 を開いて確認します。

補足
この MVP はクライアントサイドから Supabase を直接操作します。

supabase.sql の RLS ポリシーは authenticated ユーザーのみ CRUD 可能です。

タスクは user_id でログインユーザーごとに分離されています。


---

## 3) 主要変更点の要約

- `deleteTask()` で削除対象を事前に取得し、削除成功後「project削除時のみ」`project_task_id === 削除ID` の next_action をローカル state 上で `null` 化するようにしました（削除直後の画面整合を改善）。
- README を現仕様へ更新し、priority が UI 非表示であること、運用軸（GTD/重要度/緊急度/ステータス）、3表示モード、someday の通常画面初期非表示、project-next_action 軽量連携を明記しました。

---

## 4) 手元確認手順

1. `project` タスクを作成。  
2. `next_action` タスクを作成し、関連 project を設定。  
3. `project` タスクを削除。  
4. **削除直後**に、紐づいていた `next_action` の関連 project が未設定表示へ変わることを確認（再読込前でも整合）。  
5. README の記載が現仕様に一致していることを確認。

---

## Screenshot

![updated-board](browser:/tmp/codex_browser_invocations/018945d12424463a/artifacts/artifacts/kanban-after-fix.png)

---

## Testing

- ✅ `npx tsc --noEmit`
- ✅ `npm run build`
- ✅ `npm run dev`（起動確認およびスクリーンショット取得）