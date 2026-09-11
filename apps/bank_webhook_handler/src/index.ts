import { timingSafeEqual } from "node:crypto";
import { balancesTable, db, onRampTransactionsTable } from "@repo/db";
import { eq, sql } from "drizzle-orm";
import express from "express";

const app = express();
app.use(express.json({ limit: "64kb" }));

const webhookSecret = process.env.BANK_WEBHOOK_SECRET;
if (!webhookSecret) {
  throw new Error("BANK_WEBHOOK_SECRET is required");
}

function isAuthorized(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const expected = Buffer.from(webhookSecret);
  const provided = Buffer.from(value);

  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/nubankWebhook", async (request, response) => {
  if (!isAuthorized(request.get("x-webhook-secret"))) {
    return response.status(401).json({ message: "Unauthorized" });
  }

  const token = String(request.body?.token ?? "").trim();
  const amount = Number(request.body?.amount);

  if (!token || !Number.isFinite(amount) || amount <= 0) {
    return response.status(400).json({ message: "Invalid payload" });
  }

  try {
    await db.transaction(async (transaction) => {
      const [onRampTransaction] = await transaction
        .select()
        .from(onRampTransactionsTable)
        .where(eq(onRampTransactionsTable.token, token));

      if (!onRampTransaction) {
        throw new Error("Transaction not found");
      }

      if (onRampTransaction.status !== "Processing") {
        throw new Error("Transaction already processed");
      }

      if (Number(onRampTransaction.amount) !== amount) {
        throw new Error("Payment amount mismatch");
      }

      await transaction
        .update(balancesTable)
        .set({ amount: sql`${balancesTable.amount} + ${amount}` })
        .where(eq(balancesTable.userId, onRampTransaction.userId));

      await transaction
        .update(onRampTransactionsTable)
        .set({ status: "Success" })
        .where(eq(onRampTransactionsTable.token, token));
    });

    return response.json({ message: "Captured payment" });
  } catch (error) {
    console.error(error);
    return response.status(409).json({ message: "Failed to capture payment" });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Server started on port ${port}`);
});
