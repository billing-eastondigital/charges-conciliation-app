-- ============================================================
-- Migration 20260612000004 — seed client_platform_ids + billing config
--
-- Loads data from data_billing_app_client_platform_ids CSV into:
--   1. client_platform_ids  (google_ads_customer_id per stripe_id)
--   2. client_billing_plans (billing_day_one, billing_day_two, base_fee,
--                            billing_percentage, billing_method update)
--
-- Rules applied:
--   - google_id dashes removed for storage (numeric string)
--   - Multi-account clients: primary = first ID; extras in other_ids
--   - billing_percentage: CSV stores as integer % (2 → 0.0200)
--   - billing_method: use_cost → ADS_COST | pct>0 no rule → ADS_REVENUE
--                     SUBSCRIPTION rows not changed
--   - "paypal" stripe_id skipped (not a real Stripe customer ID)
-- ============================================================

-- ── 1. client_platform_ids ────────────────────────────────────────────────

INSERT INTO client_platform_ids (stripe_id, google_ads_customer_id, other_ids)
VALUES
  -- Single google account clients
  ('cus_EJMKHEPaZ23L9y', '8426488421',  '{}'),
  ('cus_GjG9nvTKNHvKm3', '6936529672',  '{}'),
  ('cus_GNUYupp8Hh4cSP', '6499479595',  '{}'),
  ('cus_HN0odgEcZ6VkPR', '3381922941',  '{}'),
  ('cus_HOlII80xvF057s', '8633769880',  '{}'),
  ('cus_HR1JG8drEbsyIx', '6038558382',  '{}'),
  ('cus_HWgmu82x3l9rCZ', '9496589180',  '{}'),
  ('cus_IBgVvLV5wxX9Bd', '8775066022',  '{}'),
  ('cus_IMNaYfltkdPXuv', '4437430284',  '{}'),
  ('cus_JR5mL46ckKKJiR', '3004238601',  '{}'),
  ('cus_KaCrqBNFkryB4k', '1966915399',  '{}'),
  ('cus_KJ4A2hr5aA3J1A', '4431298705',  '{}'),
  ('cus_KpAN7dkWaFdz3B', '5243240323',  '{}'),
  ('cus_L4vWBzInyrA8RN', '8713876103',  '{}'),
  ('cus_L7b1kOJY2PJeOW', '4175710383',  '{}'),
  ('cus_LF3m2e8OrXMsUK', '8220021798',  '{}'),
  ('cus_LKim7EZYOVj9jF', '6998622686',  '{}'),
  ('cus_LpoMNpDjbzi6fz', '3215903425',  '{}'),
  ('cus_M6Ex2LIAHaqE31', '7535008938',  '{}'),
  ('cus_MjtOD8HI7vVrzm', '3622490196',  '{}'),
  ('cus_Mk1E5riYx9BQSb', '9762470644',  '{}'),
  ('cus_NHEkhkK5qPmO8o', '9161532155',  '{}'),
  ('cus_ODTpkZCeWeIqPF', '4342200150',  '{}'),
  ('cus_OinjM3GcjQrwhs', '1529080367',  '{}'),
  ('cus_OkS3Vu3Orhd2vR', '6537681080',  '{}'),
  ('cus_Ol35UjZNKTQSu9', '1033317808',  '{}'),
  ('cus_Ouw9vXPsi6rIp5', '2085249008',  '{}'),
  ('cus_PInUMrDJgQWDKt', '4043445221',  '{}'),
  ('cus_PIpVQvQrcL0N9x', '1031057748',  '{}'),
  ('cus_PldCRQBIaCoGiO', '7193313341',  '{}'),
  ('cus_PO1KaeaHsr0gzb', '7655185119',  '{}'),
  ('cus_PwTdKcMGMbuEIv', '9547602364',  '{}'),
  ('cus_Q1nzEwQxTHo44M', '5268657281',  '{}'),
  ('cus_QUbjD69JAUgYEI', '5626231101',  '{}'),
  ('cus_QUuH0sGgajr5Mf', '4655988544',  '{}'),  -- 465-598-5844
  ('cus_RnWyNOxHOXVL3t', '9231610221',  '{}'),

  -- Multi google account clients: primary = first, extras in other_ids
  -- cus_Gks5Luf2oz80Vv: 340-667-9925 (primary) + 115-781-6524
  ('cus_Gks5Luf2oz80Vv', '3406679925',  '{"google_ads_additional_customer_ids": ["1157816524"]}'),
  -- cus_MAQFq6FlG4sGc3: 463-198-8316 (primary) + 837-892-1672
  ('cus_MAQFq6FlG4sGc3', '4631988316',  '{"google_ads_additional_customer_ids": ["8378921672"]}')

ON CONFLICT (stripe_id) DO UPDATE
  SET google_ads_customer_id = EXCLUDED.google_ads_customer_id,
      other_ids               = EXCLUDED.other_ids,
      updated_at              = now();


-- ── 2. Update active billing plans with config from CSV ───────────────────
-- Updates: billing_day_one, billing_day_two, base_fee, billing_percentage,
--          and billing_method (only for non-SUBSCRIPTION plans).
--
-- We only touch the currently active plan (effective_to IS NULL).
-- SUBSCRIPTION rows keep their billing_method; we only update the date/fee cols.

-- ADS_REVENUE clients (billing_pct > 0, no custom_rule / use_revenue)
UPDATE client_billing_plans bp
SET
  billing_day_one    = cfg.day1,
  billing_day_two    = cfg.day2,
  base_fee           = cfg.bf,
  billing_percentage = cfg.pct,
  billing_method     = CASE
                         WHEN bp.billing_method = 'SUBSCRIPTION' THEN 'SUBSCRIPTION'
                         WHEN cfg.custom_rule = 'use_cost'        THEN 'ADS_COST'
                         WHEN cfg.pct > 0                         THEN 'ADS_REVENUE'
                         ELSE bp.billing_method
                       END
FROM clients c
JOIN (VALUES
  -- (stripe_id, day1, day2, base_fee, billing_pct_decimal, custom_rule)
  ('cus_EJMKHEPaZ23L9y',  1,  5, 349.00, 0.0200, NULL),
  ('cus_GjG9nvTKNHvKm3',  1,  5, 399.00, 0.0200, NULL),      -- special case, manual
  ('cus_Gks5Luf2oz80Vv',  1,  5,1000.00, 0.1000, 'use_cost'),
  ('cus_GNUYupp8Hh4cSP',  1,  5,   0.00, 0.1200, 'use_cost'),
  ('cus_HMwHt2FOxWLy8x',  8, 10, 475.00, 0.0000, NULL),
  ('cus_HN0odgEcZ6VkPR',  1,  5, 349.00, 0.0200, NULL),
  ('cus_HOlII80xvF057s',  1,  5, 199.00, 0.0200, NULL),
  ('cus_HR1JG8drEbsyIx',  1,  5, 299.00, 0.0200, NULL),
  ('cus_HWgmu82x3l9rCZ', 20, 20, 399.00, 0.0050, NULL),
  ('cus_IBgVvLV5wxX9Bd',  1,  5, 299.00, 0.0200, NULL),
  ('cus_IMNaYfltkdPXuv',  1,  5, 399.00, 0.0200, NULL),
  ('cus_JR5mL46ckKKJiR',  1,  5, 420.00, 0.0200, NULL),
  ('cus_KaCrqBNFkryB4k',  1,  5, 299.00, 0.0200, NULL),
  ('cus_KJ4A2hr5aA3J1A', 20,  5, 299.00, 0.0200, NULL),
  ('cus_KpAN7dkWaFdz3B', 20, 20, 299.00, 0.0200, NULL),
  ('cus_KvIcMgwLa6rxqx',  7, 10,   0.00, 0.0000, NULL),
  ('cus_L04ut7WgHHqIN4', 22, 25,   0.00, 0.0000, NULL),
  ('cus_L4vWBzInyrA8RN',  1,  5, 399.00, 0.0200, NULL),
  ('cus_L7b1kOJY2PJeOW',  1,  5, 399.00, 0.0200, NULL),
  ('cus_L7DrHmiMofn6ws',  7, 10,   0.00, 0.0000, NULL),
  ('cus_LF3m2e8OrXMsUK',  1,  5, 299.00, 0.0200, NULL),
  ('cus_Lg5HdvMnHkNqn0', 12, 15,   0.00, 0.0000, NULL),
  ('cus_LKim7EZYOVj9jF', 20, 20, 399.00, 0.0200, NULL),
  ('cus_LpoMNpDjbzi6fz', 20, 20, 199.00, 0.0200, NULL),
  ('cus_LS8xakJItjgXhd',  6, 10,   0.00, 0.0000, NULL),
  ('cus_M6Ex2LIAHaqE31',  1,  5, 199.00, 0.0200, NULL),
  ('cus_MAQFq6FlG4sGc3',  1,  5, 399.00, 0.0200, NULL),
  ('cus_MjtOD8HI7vVrzm',  1,  5, 399.00, 0.0200, NULL),
  ('cus_Mk1E5riYx9BQSb',  1,  5, 299.00, 0.0200, NULL),
  ('cus_Mql0N9LiRyQDMW', 28,  0,   0.00, 0.0000, NULL),
  ('cus_NHEkhkK5qPmO8o',  8, 10, 475.00, 0.0000, NULL),
  ('cus_ODTpkZCeWeIqPF', 20, 20, 299.00, 0.0200, NULL),
  ('cus_OinjM3GcjQrwhs', 20, 20, 299.00, 0.0200, NULL),
  ('cus_OkS3Vu3Orhd2vR', 20, 20, 399.00, 0.0200, NULL),
  ('cus_Ol35UjZNKTQSu9',  1,  5, 299.00, 0.0200, NULL),
  ('cus_OmyL3eKyTwAn7O',  1,  5, 475.00, 0.0000, NULL),
  ('cus_OsGRkNz3m6JSSO', 22, 25, 475.00, 0.0000, NULL),
  ('cus_Ouw9vXPsi6rIp5', 20, 20, 199.00, 0.0200, NULL),
  ('cus_OuwrMB5A8wG0Tm',  8, 10, 475.00, 0.0000, NULL),
  ('cus_PedLemYgsMB4Ko', 19, NULL, 650.00, 0.0000, NULL),
  ('cus_Pg2WQGOuZH2q8T', 19, 20, 475.00, 0.0000, NULL),
  ('cus_PInUMrDJgQWDKt', 20, 20, 299.00, 0.0200, NULL),
  ('cus_PIpVQvQrcL0N9x', 20, 20, 399.00, 0.0200, NULL),
  ('cus_PldCRQBIaCoGiO', 20, 20, 650.00, 0.0200, NULL),
  ('cus_PO1KaeaHsr0gzb',  1,  5, 399.00, 0.0200, NULL),
  ('cus_PwTdKcMGMbuEIv', 20, 20, 650.00, 0.0200, NULL),
  ('cus_PyNx1GjDB2FRJh',  7, 10, 475.00, 0.0000, NULL),
  ('cus_Q1nzEwQxTHo44M',  1,  5, 299.00, 0.0200, NULL),
  ('cus_Q6dKFOJXsnoiPd',  1,  5, 475.00, 0.1250, NULL),
  ('cus_Q6Hm4ikzgMKpLU', 13,  5, 475.00, 0.0000, NULL),
  ('cus_QhMNKJ23jRrM3E',  1,  5, 475.00, 0.0000, NULL),
  ('cus_QUbjD69JAUgYEI',  1,  5, 399.00, 0.0200, NULL),
  ('cus_QUuH0sGgajr5Mf',  1, 12, 650.00, 0.0200, NULL),
  ('cus_Rgkuafb4zbdprf', 31,  5, 475.00, 0.0000, NULL),
  ('cus_RnWyNOxHOXVL3t',  1,  5, 399.00, 0.0200, NULL),
  ('cus_RO2yhKAyKj9spR', 13,  5,   0.00, 0.0000, NULL),
  ('cus_SFWU1lLTiWM73N',  4,  5, 475.00, 0.0000, NULL),
  ('cus_Sgavq2Eogudl9V', 15, 15, 475.00, 0.0000, NULL)
) AS cfg(stripe_id, day1, day2, bf, pct, custom_rule)
  ON c.stripe_id = cfg.stripe_id
WHERE bp.client_id  = c.id
  AND bp.effective_to IS NULL;   -- only active plan

-- ── 3. Verification counts ────────────────────────────────────────────────
-- Run after apply to check:
--   SELECT COUNT(*) FROM client_platform_ids;                    -- expect 38
--   SELECT billing_method, COUNT(*) FROM client_billing_plans
--     WHERE effective_to IS NULL GROUP BY 1 ORDER BY 1;
