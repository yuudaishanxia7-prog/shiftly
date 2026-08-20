# Shiftly — 店舗向けシフト管理

希望シフトの回収、仮シフト生成、調整、公開、時間帯別人数の可視化を行うNext.jsアプリです。フロントエンドからDBへ直接接続せず、すべてのデータ操作と認可をNext.js Route Handlerで実行します。

## 構成

- Next.js 16 / React 19 / TypeScript
- Auth.js Credentials認証（メールアドレス＋パスワード）
- bcrypt（cost 12）によるパスワードハッシュ
- Prisma ORM / 標準PostgreSQL
- Auth.js JWTセッション（httpOnly、SameSite=Lax、本番Secure Cookie）

Supabase SDK、Auth、RLS、RPC等は使用していません。接続先は `DATABASE_URL` で指定する一般的なPostgreSQLです。

## ローカル起動

1. Node.js 22とPostgreSQLを用意します。
2. `.env.example` を `.env.local` にコピーし、値を変更します。
3. 次を実行します。

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

日本語のディレクトリ名ではComposeのプロジェクト名を明示してください。

```bash
docker compose -p shiftly up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

開発seedの初期アカウントは `SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD` で指定します。スタッフは `staff1@example.invalid`〜`staff10@example.invalid`、開発用パスワードは `Development-1!`〜`Development-10!` です。本番ではseedを使用しないでください。

## 環境変数

- `DATABASE_URL`: アプリ実行時のPostgreSQL接続文字列。VercelではSupabase Transaction poolerを使用します。
- `DIRECT_URL`: migration、管理、バックアップ用接続文字列。Supabase Session poolerまたはDirect connectionを使用します。
- `AUTH_SECRET`: `openssl rand -base64 32` などで生成する十分に長い秘密値。
- `AUTH_TRUST_HOST`: リバースプロキシ／Vercelでは `true`。
- `ENABLE_DEMO_MODE`: 本番では必ず `false`。
- `NEXT_PUBLIC_ENABLE_DEMO_MODE`: デモボタンを表示する場合のみ `true`。本番では `false`。
- `SEED_MANAGER_EMAIL`, `SEED_MANAGER_PASSWORD`: 開発seed専用。本番では設定しません。

`.env*` はGit管理対象外です。秘密値をコードやREADMEへ記録しないでください。

## Migration

開発時にスキーマを変更する場合：

```bash
npm run db:migrate:dev -- --name change-name
```

本番デプロイ時：

```bash
npm run db:migrate
```

本番DBを管理画面から手作業で変更せず、レビュー済みmigrationを適用してください。

## 初期管理者

`prisma/seed.ts` は開発専用で、`NODE_ENV=production` では停止します。本番DBにseedを実行してはいけません。

本番では`.env.production.example`を`.env.production.local`へコピーし、実値を設定してから次を実行します。

```bash
npm run check:production-env
npm run db:migrate:production
npm run db:init-manager
```

`db:init-manager`は空DBでのみ動作し、店舗、店舗設定、manager 1名だけをトランザクションで作成します。既に店舗またはユーザーが存在する場合は何も変更せず停止します。成功後は`INITIAL_*`をVercelへ登録せず、ローカルの`.env.production.local`からも削除してください。スタッフはmanagerが本番UIから登録します。

初期パスワードは本人へ安全な経路で伝え、初回ログイン後に変更してください。退職者は削除せず無効化します。

## デプロイ

### Vercel

今回の試験運用では開発者所有のGitHub、Vercel、Supabaseを利用します。所有権移管は行いません。具体的な本番構築手順は[本番公開手順](docs/PRODUCTION_DEPLOYMENT.md)を参照してください。

VercelのBuild Commandはリポジトリの`npm run build`を使用します。このスクリプトは`prisma generate && next build`です。migrationをBuild Commandへ含めてはいけません。同時デプロイやPreview buildから本番DBへmigrationが走ることを防ぐため、migrationは本番公開前に明示的に一度実行します。

### Docker / VPS

```bash
docker build -t shiftly .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgresql://...' \
  -e DIRECT_URL='postgresql://...' \
  -e AUTH_SECRET='...' \
  -e AUTH_URL='https://...' \
  -e AUTH_TRUST_HOST=true \
  -e ENABLE_DEMO_MODE=false \
  -e NEXT_PUBLIC_ENABLE_DEMO_MODE=false \
  shiftly
```

TLS終端を行うリバースプロキシを前段に置いてください。

## バックアップと復元

カスタム形式を推奨します。

```bash
pg_dump --format=custom --no-owner --no-acl "$DIRECT_URL" > shiftly-$(date +%Y%m%d).dump
createdb shiftly_restore
pg_restore --no-owner --no-acl --dbname="$NEW_DATABASE_URL" shiftly-20260818.dump
```

SQL形式の場合：

```bash
pg_dump --no-owner --no-acl "$DIRECT_URL" > backup.sql
psql "$NEW_DATABASE_URL" < backup.sql
```

バックアップはDBとは別の、店舗が所有する暗号化ストレージへ保管し、定期的に復元テストを行ってください。

## 別PostgreSQLへの移行

1. メンテナンス時間を決め、書き込みを停止します。
2. 現DBを `pg_dump` します。
3. 新しい標準PostgreSQLを作成します。
4. `pg_restore` または `psql` で復元します。
5. `npm run db:migrate` でmigration状態を確認します。
6. アプリの `DATABASE_URL` のみ新DBへ変更します。
7. 再デプロイし、件数、ログイン、権限、シフト編集・公開を確認します。
8. 検証完了まで旧DBを読み取り専用で保持します。

サービス固有ユーザーIDや独自DB関数を保存していないため、PostgreSQL同士で移行できます。

## 認可方針

すべてのAPIでAuth.jsセッションを確認し、クエリに `storeId` を含めます。

- staff: 自分の希望・提出、公開済み同一店舗の確定シフトを閲覧可能。
- manager: 同一店舗のスタッフ、期間、希望、提出、確定シフト、店舗設定を管理可能。
- staffによる確定シフト更新、他店舗参照、他スタッフの未公開希望参照はAPI側で拒否します。

管理者ボタンを隠すUIは補助にすぎず、認可境界はRoute Handlerです。

## 店舗側が所有・管理するもの

- GitHub organization／リポジトリ
- Vercelまたは代替ホスティングの契約
- PostgreSQL契約とバックアップ
- ドメインとDNS
- 管理用メールアドレスと二要素認証
- `AUTH_SECRET` 等の環境変数
- 障害時の連絡先・運用手順

## 開発者離脱時チェック

- 全アカウントの所有者と請求先を店舗へ移管
- 開発者個人の権限、APIキー、SSH鍵を削除
- 店舗管理者2名以上のログインを確認
- バックアップ取得と別DBへの復元を実演
- migration、デプロイ、ドメイン更新手順を引き渡し
- 本番で両デモ環境変数が `false` であることを確認
- HTTPS、Cookie、staff/manager/別店舗の認可テストを実施

## 開発環境から店舗環境への引き継ぎ

このリポジトリはGitリモート、ホスティング事業者、DB事業者、ドメインをコードに保持しません。GitHubアカウントやリポジトリURLを変更してもコード修正は不要です。店舗側リポジトリへ移管するか、新しい空リポジトリへ通常のGit操作でPushできます。

引き継ぎは次の順番で実施します。

1. 店舗所有の管理メールアドレスを作り、二要素認証と復旧手段を設定する。
2. そのメールで店舗所有のGitHub organizationまたはアカウントを作成する。
3. リポジトリを移管するか、店舗側の新規リポジトリへPushする。
4. 店舗所有の標準PostgreSQLを作成し、接続情報を安全に保管する。
5. 店舗所有のホスティング契約を作成し、店舗側GitHubへ接続する。
6. 下記の本番環境変数をホスティングへ設定する。
7. 開発DBを停止または書き込み禁止にし、`pg_dump`を取得する。
8. 店舗DBへ`pg_restore`し、`npm run db:migrate`を実行する。
9. 店舗ホスティングへデプロイし、必要なら店舗ドメインとDNSを設定する。
10. managerログイン、店舗設定、staffログイン、希望提出、公開シフトを確認する。
11. バックアップを取得し、店舗側の保管場所へ保存する。
12. テストユーザー・テストシフトを削除または無効化する。
13. 開発者のGitHub、DB、ホスティング、DNS、メールへのアクセスをすべて削除する。

### 開発時の環境変数

| 変数 | 用途 |
|---|---|
| `DATABASE_URL` | ローカルまたは開発PostgreSQL |
| `DIRECT_URL` | migration・管理・バックアップ用PostgreSQL |
| `AUTH_SECRET` | 開発用セッション署名鍵 |
| `AUTH_URL` | `http://localhost:3000`等の開発URL |
| `AUTH_TRUST_HOST` | ローカル／プロキシ経由のホスト信頼設定 |
| `ENABLE_DEMO_MODE` | 通常は`false` |
| `NEXT_PUBLIC_ENABLE_DEMO_MODE` | 通常は`false` |
| `SEED_MANAGER_EMAIL` | 開発seed専用 |
| `SEED_MANAGER_PASSWORD` | 開発seed専用 |
| `POSTGRES_DB` | Docker ComposeのDB名 |
| `POSTGRES_USER` | Docker ComposeのDBユーザー |
| `POSTGRES_PASSWORD` | Docker ComposeのDBパスワード |
| `DB_PORT` | ローカル公開ポート |
| `COMPOSE_DATABASE_URL` | appコンテナからdbコンテナへの接続文字列 |
| `APP_HOSTNAME` | コンテナの待受ホスト |

### 本番時の環境変数

| 変数 | 本番設定 |
|---|---|
| `DATABASE_URL` | 店舗所有PostgreSQLの接続文字列 |
| `DIRECT_URL` | migration・管理・バックアップ用の直接／session接続文字列 |
| `AUTH_SECRET` | 店舗側で新しく生成した32バイト以上の秘密値 |
| `AUTH_URL` | `https://`から始まる店舗の正式な公開URL |
| `AUTH_TRUST_HOST` | 信頼できるホスティング／プロキシでは`true` |
| `ENABLE_DEMO_MODE` | 必ず`false` |
| `NEXT_PUBLIC_ENABLE_DEMO_MODE` | 必ず`false` |

Vercel等でDocker Composeを使わない場合、`POSTGRES_*`、`DB_PORT`、`COMPOSE_DATABASE_URL`、`APP_HOSTNAME`、`SEED_*`は不要です。`AUTH_SECRET`は開発環境からコピーせず店舗側で再生成します。

### Auth.jsとURL変更

認証コードはlocalhostや特定ドメインを参照しません。開発時の`AUTH_URL`を、納品時に店舗のHTTPS URLへ変更します。ホスティングが転送ヘッダーを正しく設定することを確認し、`AUTH_TRUST_HOST=true`を使用します。本番ではHTTPSによりセッションCookieへ`Secure`属性が付きます。

ドメイン変更時に必要なのは、ホスティング／DNS設定と`AUTH_URL`の変更、再デプロイ、ログイン確認です。コード修正は不要です。

## 開発DBから店舗DBへの移行リハーサル

現在のDBを壊さない手順です。復元先には必ず空の検証用PostgreSQLを指定してください。

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > handover-rehearsal.dump
pg_restore --no-owner --no-acl --dbname="$TARGET_DATABASE_URL" handover-rehearsal.dump
DATABASE_URL="$TARGET_DATABASE_URL" npm run db:migrate
```

その後、一時的な検証デプロイで`DATABASE_URL`を復元先へ向け、manager／staffのログイン、件数、希望、確定シフト、店舗設定を比較します。検証中も元DBの`DATABASE_URL`は変更しません。切り替え本番時のみホスティング環境変数を店舗DBへ変更します。

## 納品時チェックリスト

- [ ] 店舗所有の管理メールを作成し、二要素認証を設定した
- [ ] GitHubリポジトリを移管または店舗GitHubへPushした
- [ ] 店舗所有PostgreSQLへ`pg_dump`／`pg_restore`で移行した
- [ ] 店舗所有ホスティングへ再デプロイした
- [ ] 必要なドメインとDNSを店舗所有にした
- [ ] 本番用`AUTH_SECRET`を店舗側で新規生成した
- [ ] `AUTH_URL`を店舗のHTTPS URLにした
- [ ] managerアカウントでログインできた
- [ ] staffの希望提出・再ログイン・確定シフト閲覧を確認した
- [ ] 店舗名・営業時間・入力間隔を確認した
- [ ] DBバックアップを店舗側保管場所へ取得した
- [ ] 両デモモードを`false`にした
- [ ] テストアカウントとテストデータを削除または無効化した
- [ ] 開発用seed変数を本番環境から削除した
- [ ] 開発者の環境変数・ローカルコピーを安全に削除した
- [ ] 開発者のGitHub、DB、ホスティング、DNSアクセスを削除した
- [ ] 店舗担当者へバックアップ復元と障害時連絡手順を引き渡した

## 日常運用

通常のスタッフ管理、期間作成、期限変更、受付終了、シフト編集・公開、店舗営業時間設定はアプリの管理機能/APIで行えます。DB管理画面を日常的に操作する運用にはしません。
