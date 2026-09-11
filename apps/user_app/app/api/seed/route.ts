import { balancesTable, db, onRampTransactionsTable, usersTable } from "@repo/db"
import { NextResponse } from "next/server"
import bcrypt from "bcrypt"

export const GET = async () => {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const result = await db.insert(usersTable).values({
      name: "Bob",
      email: "bob@gmail.com",
      password: await bcrypt.hash("password1234", 10),
      number: "733111541",
      authType: "email",
    }).returning()

    const userId = result[0]?.id
    if (!userId) {
      throw new Error("Failed to insert user")
    }

    await db.insert(onRampTransactionsTable).values({
      userId,
      amount: 100,
      status: "Success",
      provider: "Nubank",
      startTime: new Date(),
      token: "1265238",
    })

    await db.insert(balancesTable).values({
      userId,
      amount: 100,
      locked: 100,
    })

    return NextResponse.json({ message: "User created successfully" })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "error" }, { status: 500 })
  }
}
