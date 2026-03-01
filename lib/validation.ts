import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const googleSearchSchema = z.object({
  businessType: z.string().min(2),
  county: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  progressive: z.boolean().default(true),
  targetCount: z.coerce.number().min(1).max(500).default(100),
});

export const ctRegistrySchema = z.object({
  nameContains: z.string().optional(),
  city: z.string().optional(),
  entityType: z.string().optional(),
  filingDateFrom: z.string().optional(),
  filingDateTo: z.string().optional(),
  newBusinessesOnly: z.boolean().default(true),
  limit: z.coerce.number().min(10).max(500).default(100),
});

export const providerUpdateSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  baseUrl: z.string().url(),
  endpointsJson: z.string().min(2),
  secret: z.string().optional(),
  rateLimitPerSec: z.coerce.number().int().min(1).max(100),
  timeoutMs: z.coerce.number().int().min(1000).max(60000),
  defaultCostPerCall: z.coerce.number().min(0).max(100),
});

export const leadFilterSchema = z.object({
  name: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  industryType: z.string().optional(),
  qualified: z.enum(["all", "yes", "no"]).default("all"),
  source: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const jobMappingSchema = z.object({
  jobId: z.string().min(1),
  name: z.string().min(1),
  website: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  email: z.string().optional(),
});

