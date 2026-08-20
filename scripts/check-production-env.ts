import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgres")),
  DIRECT_URL: z.string().url().refine((value) => value.startsWith("postgres")),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url().refine((value) => value.startsWith("https://")),
  AUTH_TRUST_HOST: z.literal("true"),
  ENABLE_DEMO_MODE: z.literal("false"),
  NEXT_PUBLIC_ENABLE_DEMO_MODE: z.literal("false"),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error("本番環境変数の検査に失敗しました:");
  for (const issue of result.error.issues) {
    console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

for (const [name, value] of Object.entries(result.data)) {
  if (/localhost|change-me|example\.com/i.test(value)) {
    console.error(`${name} に本番では使用できない値が含まれています。`);
    process.exit(1);
  }
}

const runtimeUrl = new URL(result.data.DATABASE_URL);
if (runtimeUrl.port === "6543" && runtimeUrl.searchParams.get("pgbouncer") !== "true") {
  console.error("Transaction poolerを使うDATABASE_URLには pgbouncer=true が必要です。");
  process.exit(1);
}

console.log("本番環境変数の必須項目を確認しました。");
