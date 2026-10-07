ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS alcohol boolean NOT NULL DEFAULT false;
