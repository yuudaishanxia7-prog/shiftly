# Shiftly 本番公開手順（Vercel + Supabase Postgres）

この手順は2026年9月の試験運用を、開発者所有のGitHub・Vercel・Supabaseで開始するためのものです。SupabaseはPostgreSQLホスティングとしてだけ利用し、Auth、Storage、Realtime、Edge Functions、RLS、RPC、クライアントSDKは利用しません。

## 1. 人間が作成するもの

### Supabase

1. Shiftly専用の新規Projectを作成する。
2. ProjectのリージョンをVercel Functionsに近い地域へ設定する。
3. 強いDatabase passwordをパスワード管理ツールへ保存する。
4. DashboardのAPI SettingsでData APIを無効化する。Prisma以外から`public` schemaを公開しない。
5. Dashboard上部の`Connect`を開き、次の2接続文字列を取得する。

本番DBへローカル開発seedをrestoreしたり、`npm run db:seed`を実行したりしないでください。

### GitHub / Vercel

1. このフォルダをGitリポジトリとして既存の開発者GitHubリポジトリへPushする。
2. Vercelで`Add New > Project`からそのリポジトリをImportする。
3. Framework PresetがNext.js、Build Commandが`npm run build`であることを確認する。
4. Production domain（最初は`https://<project>.vercel.app`）を確定する。

## 2. Supabase接続文字列の使い分け

### `DATABASE_URL` — Vercel runtime

`Connect > Transaction pooler`の文字列（ポート`6543`）を使用します。Vercel Functionsは自動拡縮する一時的なserverlessプロセスなので、Transaction poolerが適しています。

```text
postgresql://USER.PROJECT_REF:PASSWORD@REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require
```

- Dashboardからコピーした値を使い、例示値を手入力しない。
- 既にクエリ文字列がある場合は最初を`?`、追加分を`&`でつなぐ。
- パスワード中の`@`、`:`、`/`、`#`等はURLエンコードする。
- Transaction poolerはprepared statementをサポートしないため、Prisma用に`pgbouncer=true`を付ける。
- serverlessインスタンスごとの接続数を抑えるため`connection_limit=1`を付ける。

### `DIRECT_URL` — migration / 初期化 / バックアップ

標準では`Connect > Session pooler`の文字列（ポート`5432`）を使用します。IPv4で到達でき、Prisma Migrate、初期manager作成、管理用接続に利用できます。

```text
postgresql://USER.PROJECT_REF:PASSWORD@REGION.pooler.supabase.com:5432/postgres?sslmode=require
```

ローカル環境と実行環境の両方でIPv6接続できるか、SupabaseのIPv4 Add-Onを利用している場合は、Direct connection（`db.PROJECT_REF.supabase.co:5432`）を`DIRECT_URL`に使用できます。Transaction poolerをmigrationや`pg_dump`には使用しません。

Prisma schemaはruntimeに`DATABASE_URL`、migrationに`DIRECT_URL`を使う構成です。

## 3. 本番環境変数

`.env.production.example`を`.env.production.local`へコピーし、実値へ置換します。このファイルはGitへcommitされません。

Vercel Project SettingsのEnvironment VariablesでProductionへ次を登録します。

| 名前 | 値 |
|---|---|
| `DATABASE_URL` | Supabase Transaction pooler（6543）|
| `DIRECT_URL` | Supabase Session pooler（5432）またはDirect connection |
| `AUTH_SECRET` | `openssl rand -base64 32`で新規生成した値 |
| `AUTH_URL` | `https://`付きのVercel Production domain |
| `AUTH_TRUST_HOST` | `true` |
| `ENABLE_DEMO_MODE` | `false` |
| `NEXT_PUBLIC_ENABLE_DEMO_MODE` | `false` |

`NEXT_PUBLIC_*`はbuild時にブラウザへ埋め込まれるため、設定変更後は必ず再デプロイします。`INITIAL_*`、`SEED_*`、ローカルDocker変数はVercelへ登録しません。

Preview deploymentを使う場合、本番DBをPreviewへ安易に共有しないでください。別のPreview DBを用意するか、Preview deployment自体を無効化します。Prisma Client生成にはPreview環境にも`DATABASE_URL`と`DIRECT_URL`が必要です。

## 4. Migrationと初期manager

Supabase Projectが空であることを確認し、ローカル端末から次を実行します。

```bash
cp .env.production.example .env.production.local
# .env.production.localへ実値を入力
npm run check:production-env
npm run db:migrate:production
npm run db:init-manager
```

`db:migrate:production`は`.env.production.local`を明示的に読み、`prisma migrate deploy`を実行します。通常の`db:migrate`、`prisma migrate dev`、`prisma db push`は本番で使用しません。`prisma/seed.ts`も実行しません。

初期化スクリプトが作るデータは次だけです。

- 店舗 1件
- 店舗設定 1件
- role=`manager`の有効ユーザー 1名

パスワードはbcrypt cost 12でハッシュ化され、平文はDBへ保存されません。初期化成功後、`.env.production.local`の`INITIAL_*`値を削除します。

## 5. Vercelデプロイ

1. Vercel Production環境変数をすべて設定する。
2. Production branchをデプロイする。
3. Build logで`Generated Prisma Client`と`Compiled successfully`を確認する。
4. `https://<production-domain>/`を開く。
5. 初期managerでログインする。
6. 店舗設定を確認する。
7. 管理者画面で2026年9月のShiftPeriodと提出期限を作成する。
8. 管理者画面から実スタッフ約10名を登録し、初期パスワードを個別に安全な手段で伝える。

環境変数変更は既存deploymentへ反映されません。変更後は再デプロイします。

## 6. 本番E2Eチェック

本番データを汚さないよう、実スタッフ登録前に承認されたManager、Staff A、Staff Bだけで実施します。検証後にテスト専用ユーザーを無効化します。

- [ ] ManagerがHTTPS URLでログインできる
- [ ] 2026年9月ShiftPeriodを作成でき、重複作成は拒否される
- [ ] Staff A/BをUIから登録できる
- [ ] Staff Aが複数日を設定、保存、提出できる
- [ ] ログアウト・再ログイン後もStaff Aの希望が保持される
- [ ] Staff Bが異なる希望を提出できる
- [ ] Staff AはStaff Bの未公開希望を取得できない
- [ ] Managerが提出状況を確認できる
- [ ] 希望受付終了でConfirmedShiftが重複なく生成される
- [ ] 一覧、1日、3日、1週間グラフを確認できる
- [ ] シフト編集後に時間帯人数が再計算される
- [ ] 公開後、Staff Aが自分と全体の確定シフトを確認できる
- [ ] Staff AからConfirmedShift更新APIが403になる

## 7. スマートフォン確認

iPhone SafariとAndroid Chromeの実機または同等のBrowser DevToolsで、幅375pxを最低基準として確認します。

- [ ] ログイン
- [ ] 希望入力
- [ ] 複数日選択と一括設定
- [ ] 保存・提出
- [ ] 自分の確定シフト
- [ ] 全体グラフの横スクロール
- [ ] 1日・3日・1週間切替

## 8. バックアップ

Supabase DashboardからコピーしたSession poolerまたはDirect connectionを使います。Transaction poolerは`pg_dump`に使用しません。

```bash
pg_dump --format=custom --no-owner --no-acl \
  --dbname="$DIRECT_URL" \
  --file="shiftly-production-$(date +%Y%m%d-%H%M).dump"
```

取得直後にファイルサイズが0でないことを確認し、DBとは別の暗号化ストレージへコピーします。9月運用中は定期バックアップを設定し、公開前・店舗側DBへの移管前にも取得します。

復元リハーサルは本番DBではなく空の検証用PostgreSQLで行います。

```bash
pg_restore --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" shiftly-production-YYYYMMDD-HHMM.dump
```

## 9. 今回の停止点

実デプロイには以下の実値が必要です。仮値では進めません。

- Supabase ProjectのTransaction pooler接続文字列
- Supabase ProjectのSession pooler接続文字列（または到達可能なDirect connection）
- Vercel ProjectのProduction URL
- 本番の店舗名、初期manager名・メール・初期パスワード
- Push先GitHubリポジトリURL

これらを取得した後にmigration、初期化、Vercel deploy、本番E2Eを実施します。
