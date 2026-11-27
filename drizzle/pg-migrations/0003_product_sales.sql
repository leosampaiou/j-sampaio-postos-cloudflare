CREATE TYPE "public"."product_commission_mode" AS ENUM('none', 'percent', 'fixed');--> statement-breakpoint
CREATE TABLE "productSaleItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"saleId" integer NOT NULL,
	"productId" integer NOT NULL,
	"barcodeSnapshot" varchar(80) NOT NULL,
	"nameSnapshot" varchar(160) NOT NULL,
	"brandSnapshot" varchar(120),
	"categorySnapshot" varchar(120),
	"specificationSnapshot" varchar(240),
	"quantity" integer NOT NULL,
	"unitPriceCents" integer NOT NULL,
	"totalCents" integer NOT NULL,
	"commissionMode" "product_commission_mode" DEFAULT 'none' NOT NULL,
	"commissionValue" integer DEFAULT 0 NOT NULL,
	"commissionCents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productSales" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"closureId" integer,
	"closureDate" varchar(10) NOT NULL,
	"shift" "closure_shift" NOT NULL,
	"userId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"sellerName" varchar(160) NOT NULL,
	"idempotencyKey" varchar(80) NOT NULL,
	"totalCents" integer NOT NULL,
	"commissionCents" integer DEFAULT 0 NOT NULL,
	"canceledAt" timestamp with time zone,
	"canceledBy" integer,
	"cancelReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"barcode" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"brand" varchar(120),
	"category" varchar(120),
	"specification" varchar(240),
	"priceCents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"commissionMode" "product_commission_mode" DEFAULT 'none' NOT NULL,
	"commissionValue" integer DEFAULT 0 NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "closures" ADD COLUMN "productSalesCents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "productSaleItems" ADD CONSTRAINT "productSaleItems_saleId_productSales_id_fk" FOREIGN KEY ("saleId") REFERENCES "public"."productSales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productSaleItems" ADD CONSTRAINT "productSaleItems_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productSales" ADD CONSTRAINT "productSales_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productSales" ADD CONSTRAINT "productSales_closureId_closures_id_fk" FOREIGN KEY ("closureId") REFERENCES "public"."closures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productSales" ADD CONSTRAINT "productSales_userId_appUsers_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productSales" ADD CONSTRAINT "productSales_employeeId_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productSales" ADD CONSTRAINT "productSales_canceledBy_appUsers_id_fk" FOREIGN KEY ("canceledBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_createdBy_appUsers_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_sale_item_sale_idx" ON "productSaleItems" USING btree ("saleId");--> statement-breakpoint
CREATE UNIQUE INDEX "product_sale_unit_idempotency_unique" ON "productSales" USING btree ("unitId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "product_sale_unit_period_idx" ON "productSales" USING btree ("unitId","closureDate","shift");--> statement-breakpoint
CREATE INDEX "product_sale_closure_idx" ON "productSales" USING btree ("closureId");--> statement-breakpoint
CREATE INDEX "product_sale_employee_period_idx" ON "productSales" USING btree ("employeeId","closureDate");--> statement-breakpoint
CREATE UNIQUE INDEX "product_unit_barcode_unique" ON "products" USING btree ("unitId","barcode");--> statement-breakpoint
CREATE INDEX "product_unit_active_name_idx" ON "products" USING btree ("unitId","active","name");--> statement-breakpoint
