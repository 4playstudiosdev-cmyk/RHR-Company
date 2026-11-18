-- orders.status is TEXT in new project (not ENUM), so skip if type doesn't exist
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    EXECUTE 'ALTER TYPE order_status ADD VALUE IF NOT EXISTS ''undelivered''';
  END IF;
END $$;
