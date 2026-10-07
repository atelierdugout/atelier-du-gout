ALTER TABLE public.products
ALTER COLUMN stock DROP NOT NULL;

ALTER TABLE public.products
ALTER COLUMN stock DROP DEFAULT;

UPDATE public.products
SET stock = NULL
WHERE stock = 0;
