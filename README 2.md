# Shiftly — ガソリンスタンド向けシフト管理MVP

希望シフトの回収、仮シフトへの自動集約、管理者による調整、公開までを一つにまとめたNext.jsアプリです。

## 起動

```bash
npm install
npm run dev
```

ログイン画面の「デモで試す」からスタッフ／管理者の両画面を確認できます。画面右上でもロールを切り替えられます。

## 本番接続

現状のUIはデモデータで動作します。`supabase/schema.sql` をSupabase SQL Editorで実行し、`.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定した上でデータアクセス層を接続してください。
