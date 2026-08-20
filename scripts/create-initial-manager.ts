import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const envSchema = z.object({
  INITIAL_STORE_NAME: z.string().trim().min(1).max(100),
  INITIAL_MANAGER_NAME: z.string().trim().min(1).max(100),
  INITIAL_MANAGER_EMAIL: z.string().email().transform((value) => value.toLowerCase()),
  INITIAL_MANAGER_PASSWORD: z.string().min(12).max(128),
  INITIAL_BUSINESS_START_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("07:00"),
  INITIAL_BUSINESS_END_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("20:00"),
  INITIAL_SHIFT_INTERVAL_MINUTES: z.coerce.number().int().refine((value) => [15, 30, 60].includes(value)).default(30),
});

const toTime = (value: string) => new Date(`1970-01-01T${value}:00.000Z`);
const prisma = new PrismaClient();

async function main() {
  const input = envSchema.parse(process.env);
  if (input.INITIAL_BUSINESS_START_TIME >= input.INITIAL_BUSINESS_END_TIME) {
    throw new Error("営業時間の開始は終了より前である必要があります。");
  }

  const [storeCount, userCount] = await Promise.all([
    prisma.store.count(),
    prisma.user.count(),
  ]);

  if (storeCount !== 0 || userCount !== 0) {
    throw new Error(
      "初期化を中止しました。対象DBには既に店舗またはユーザーが存在します。既存データを変更しません。",
    );
  }

  const passwordHash = await hash(input.INITIAL_MANAGER_PASSWORD, 12);
  const result = await prisma.$transaction(async (tx) => {
    const store = await tx.store.create({
      data: {
        name: input.INITIAL_STORE_NAME,
        settings: {
          create: {
            businessStartTime: toTime(input.INITIAL_BUSINESS_START_TIME),
            businessEndTime: toTime(input.INITIAL_BUSINESS_END_TIME),
            shiftIntervalMinutes: input.INITIAL_SHIFT_INTERVAL_MINUTES,
          },
        },
      },
    });

    const manager = await tx.user.create({
      data: {
        storeId: store.id,
        name: input.INITIAL_MANAGER_NAME,
        email: input.INITIAL_MANAGER_EMAIL,
        passwordHash,
        role: "manager",
        isActive: true,
      },
      select: { id: true, name: true, email: true, role: true },
    });

    return { store: { id: store.id, name: store.name }, manager };
  });

  console.log(JSON.stringify(result, null, 2));
  console.log("初期化が完了しました。INITIAL_* 環境変数をホスティングから削除してください。");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
