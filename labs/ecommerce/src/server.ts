import dotenv from "dotenv";
import Fastify from "fastify";
import { Pool } from "pg";

dotenv.config();

const app = Fastify({ logger: true });
const serverId = process.env.SERVER_ID?.trim() || "unknown";

app.addHook("preSerialization", async (_request, _reply, payload) => {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return { ...payload, serverId };
  }
  return payload;
});

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://ecommerce:local-dev-password@localhost:5432/ecommerce",
});

type CreateOrderBody = {
  productId: string;
  quantity: number;
};

app.get("/health/live", async () => ({ status: "ok" }));

app.get("/health/ready", async (_request, reply) => {
  try {
    await pool.query("SELECT 1");
    return { status: "ready", database: "reachable" };
  } catch {
    return reply.code(503).send({ status: "not-ready", database: "unreachable" });
  }
});

app.get<{ Querystring: { limit?: number; offset?: number } }>(
  "/products",
  {
    schema: {
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100 },
          offset: { type: "integer", minimum: 0 },
        },
      },
    },
  },
  async (request) => {
    const limit = request.query.limit ?? 50;
    const offset = request.query.offset ?? 0;
    const result = await pool.query(
      "SELECT id, sku, name, price_cents, stock FROM products " +
        "ORDER BY sku LIMIT $1 OFFSET $2",
      [limit + 1, offset],
    );
    const hasMore = result.rows.length > limit;
    return {
      products: result.rows.slice(0, limit),
      pagination: { limit, offset, hasMore },
    };
  },
);

app.post<{ Body: CreateOrderBody }>(
  "/orders",
  {
    schema: {
      headers: {
        type: "object",
        required: ["idempotency-key"],
        properties: {
          "idempotency-key": { type: "string", minLength: 1, maxLength: 200 },
        },
      },
      body: {
        type: "object",
        required: ["productId", "quantity"],
        additionalProperties: false,
        properties: {
          productId: { type: "string", format: "uuid" },
          quantity: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
  },
  async (request, reply) => {
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string") {
      return reply.code(400).send({ error: "idempotency-key header is required" });
    }

    const { productId, quantity } = request.body;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const inserted = await client.query(
        "INSERT INTO orders (idempotency_key, product_id, quantity, status) " +
          "VALUES ($1, $2, $3, 'pending') " +
          "ON CONFLICT (idempotency_key) DO NOTHING " +
          "RETURNING id, product_id, quantity, status, created_at",
        [idempotencyKey, productId, quantity],
      );

      if (inserted.rows.length === 0) {
        const existing = await client.query(
          "SELECT id, product_id, quantity, status, created_at " +
            "FROM orders WHERE idempotency_key = $1",
          [idempotencyKey],
        );
        await client.query("COMMIT");

        const order = existing.rows[0];
        if (!order) {
          return reply.code(503).send({ error: "Please retry the request" });
        }
        if (order.product_id !== productId || order.quantity !== quantity) {
          return reply
            .code(409)
            .send({ error: "Idempotency key was used for a different order" });
        }
        return reply.code(200).send({ order, idempotentReplay: true });
      }

      const reservation = await client.query(
        "UPDATE products " +
          "SET stock = stock - $2 " +
          "WHERE id = $1 AND stock >= $2 " +
          "RETURNING id",
        [productId, quantity],
      );

      if (reservation.rows.length === 0) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "Product not found or insufficient stock" });
      }

      const confirmed = await client.query(
        "UPDATE orders SET status = 'confirmed' WHERE id = $1 " +
          "RETURNING id, product_id, quantity, status, created_at",
        [inserted.rows[0].id],
      );

      await client.query("COMMIT");
      return reply.code(201).send({ order: confirmed.rows[0], idempotentReplay: false });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      app.log.error(error);
      return reply.code(500).send({ error: "Internal server error" });
    } finally {
      client.release();
    }
  },
);

app.get<{ Params: { id: string } }>(
  "/orders/:id",
  {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", format: "uuid" } },
      },
    },
  },
  async (request, reply) => {
    const result = await pool.query(
      "SELECT id, product_id, quantity, status, created_at " +
        "FROM orders WHERE id = $1",
      [request.params.id],
    );
    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "Order not found" });
    }
    return { order: result.rows[0] };
  },
);

app.addHook("onClose", async () => {
  await pool.end();
});

const port = Number(process.env.PORT ?? 3000);

try {
  await app.listen({ host: "0.0.0.0", port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
