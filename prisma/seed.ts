import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const categories = [
    { slug: "everything", name: "Everything", displayOrder: 0, isVisibleToUsers: false },
    { slug: "crypto", name: "Crypto", displayOrder: 1, isVisibleToUsers: true },
    { slug: "politics", name: "Politics", displayOrder: 2, isVisibleToUsers: true },
    { slug: "sports", name: "Sports", displayOrder: 3, isVisibleToUsers: true },
    { slug: "finance", name: "Finance", displayOrder: 4, isVisibleToUsers: true },
    { slug: "economy", name: "Economy", displayOrder: 5, isVisibleToUsers: true },
    { slug: "tech", name: "Tech", displayOrder: 6, isVisibleToUsers: true },
    { slug: "culture", name: "Culture", displayOrder: 7, isVisibleToUsers: true },
    { slug: "weather", name: "Weather", displayOrder: 8, isVisibleToUsers: true },
    { slug: "mentions", name: "Mentions", displayOrder: 9, isVisibleToUsers: true },
    { slug: "geopolitics", name: "Geopolitics", displayOrder: 10, isVisibleToUsers: true },
    { slug: "ai", name: "AI", displayOrder: 11, isVisibleToUsers: true },
    { slug: "business", name: "Business", displayOrder: 12, isVisibleToUsers: true },
    { slug: "entertainment", name: "Entertainment", displayOrder: 13, isVisibleToUsers: true },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, displayOrder: cat.displayOrder, isVisibleToUsers: cat.isVisibleToUsers },
      create: cat,
    });
  }
  console.log("Seeded 14 categories");

  const plans = [
    { slug: "free", name: "Free", price: 0, billingPeriodDays: null, alertQuota: 10 },
    { slug: "pro", name: "Pro", price: 3900, billingPeriodDays: 30, alertQuota: null },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: { name: plan.name, price: plan.price, billingPeriodDays: plan.billingPeriodDays, alertQuota: plan.alertQuota },
      create: plan,
    });
  }
  console.log("Seeded 2 plans");

  const proPlan = await prisma.plan.findUnique({ where: { slug: "pro" } });
  if (proPlan) {
    const activeCategories = await prisma.category.findMany({ where: { isActive: true } });
    for (const cat of activeCategories) {
      await prisma.planCategoryAccess.upsert({
        where: { planId_categoryId: { planId: proPlan.id, categoryId: cat.id } },
        update: {},
        create: { planId: proPlan.id, categoryId: cat.id },
      });
    }
    console.log(`Seeded ${activeCategories.length} PlanCategoryAccess rows for Pro plan`);
  }

  const settings = [
    { key: "minTradeSize", value: "250" },
    { key: "mergeWindowMinutes", value: "15" },
    { key: "trackedTradersPerCategory", value: "5" },
    { key: "pollingIntervalSeconds", value: "30" },
    { key: "leaderboardRefreshHours", value: "6" },
    { key: "affiliateCode", value: "" },
    { key: "free_alert_quota", value: "10" },
    { key: "minTradeSizeUsd", value: "250" },
    { key: "maxTradersPerCategory", value: "100" },
    { key: "alertMergeWindowMinutes", value: "15" },
    { key: "roiWorkerIntervalSeconds", value: "3600" },
    { key: "telegramBatchDelayMs", value: "1000" },
  ];

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log("Seeded 7 app settings");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
