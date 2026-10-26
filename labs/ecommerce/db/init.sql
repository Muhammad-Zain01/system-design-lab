CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    stock INTEGER NOT NULL CHECK (stock >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO products (id, sku, name, price_cents, stock)
VALUES
    ('11111111-1111-4111-8111-111111111111', 'BOOK-001', 'System Design Field Notes', 2499, 100000),
    ('22222222-2222-4222-8222-222222222222', 'MUG-001', 'Coffee and Queues Mug', 1599, 100000),
    ('33333333-3333-4333-8333-333333333333', 'TEE-001', 'Scale One Step at a Time Tee', 2999, 100000)
ON CONFLICT (sku) DO NOTHING;
